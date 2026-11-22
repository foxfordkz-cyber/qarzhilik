import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../server/database.mjs';
import worker from '../src/worker.js';
import { CONTENT } from '../src/academy-content.js';
import { signedVideoUrl } from '../src/academy.js';

function fixture() {
  const DB = openDatabase(':memory:', fileURLToPath(new URL('../migrations/', import.meta.url)));
  const env = { DB };
  async function call(path, { body, token, cookie, headers = {} } = {}) {
    const request = new Request('https://academy.test' + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: 'https://academy.test' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const response = await worker.fetch(request, env, { waitUntil() {} });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('Set-Cookie') };
  }
  const register = async (name, mobile = true) => call('/api/register', { body: { name, email: name.toLowerCase() + '@example.test', password: 'LocalTest!2026', is_admin: 1 }, headers: mobile ? { 'X-QZ-Client': 'mobile' } : {} });
  return { DB, env, call, register };
}
test('shared website/mobile flow, grants, grading, expiry and revocation', async () => {
  const { DB, call, register } = fixture();
  try {
    const guest = await call('/api/academy?lang=ru');
    assert.equal(guest.body.lessons.length, 15); assert.equal(guest.body.lessons[0].locked, false); assert.equal(guest.body.lessons[1].locked, true);
    const preview = await call('/api/academy/lessons/life-negizder');
    assert.equal('answer' in preview.body.lesson.quiz[0], false);
    assert.equal((await call('/api/academy/lessons/life-tabys-shygys')).status, 401);
    const student = await register('Student'); const token = student.body.token;
    assert.equal(student.status, 201); assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal((await call('/api/academy', { token })).body.user.isAdmin, false);
    assert.equal((await call('/api/academy/admin', { token })).status, 403);
    assert.equal((await call('/api/academy/request-access', { token, body: {} })).body.status, 'pending');
    assert.equal((await call('/api/academy/lessons/life-tabys-shygys', { token })).status, 403);
    const teacher = await register('Teacher');
    await DB.prepare('UPDATE users SET is_admin=1 WHERE id=?').bind(teacher.body.user.id).run();
    assert.equal((await call('/api/academy/admin/access', { token, body: { userId: student.body.user.id, status: 'active', days: 30 } })).status, 403);
    assert.equal((await call('/api/academy/admin/access', { token: teacher.body.token, body: { userId: student.body.user.id, status: 'active', days: 30 } })).status, 200);
    assert.equal((await call('/api/academy/lessons/life-tabys-shygys', { token })).status, 200);
    const quizPath = '/api/academy/lessons/life-tabys-shygys/quiz';
    assert.equal((await call(quizPath, { token, body: { score: 100, total: 100 } })).status, 400);
    const answers = CONTENT.kk[1].quiz.map(q => q.answer);
    const result = await call(quizPath, { token, body: { answers } });
    assert.equal(result.body.passed, true); assert.equal(result.body.score, answers.length);
    // A second website session sees the mobile result.
    const web = await call('/api/login', { body: { email: 'student@example.test', password: 'LocalTest!2026' } });
    assert.equal(web.body.token, undefined); assert.match(web.cookie, /HttpOnly; Secure; SameSite=Lax/);
    const dashboard = await call('/api/academy', { cookie: web.cookie.split(';')[0] });
    assert.equal(dashboard.body.progress[0].completed, 1);
    const wrong = CONTENT.kk[1].quiz.map(q => (q.answer + 1) % q.options.length);
    await call(quizPath, { token, body: { answers: wrong } });
    assert.equal((await call('/api/academy', { token })).body.progress[0].score, answers.length);
    await DB.prepare('UPDATE academy_access SET expires_at=1 WHERE user_id=?').bind(student.body.user.id).run();
    assert.equal((await call('/api/academy', { token })).body.access.status, 'expired');
    assert.equal((await call(quizPath, { token, body: { answers } })).status, 403);
    assert.equal((await call('/api/academy/lessons/life-tabys-shygys/video', { token })).status, 403);
    await call('/api/academy/admin/access', { token: teacher.body.token, body: { userId: student.body.user.id, status: 'revoked', days: 0 } });
    assert.equal((await call('/api/academy', { token })).body.access.status, 'revoked');
    await call('/api/logout', { token, body: {} });
    assert.equal((await call('/api/academy', { token })).body.user, null);
  } finally { DB.close(); }
});
test('cross-origin auth is rejected and repeated attempts are throttled', async () => {
  const { DB, call } = fixture();
  try {
    assert.equal((await call('/api/register', { body: {}, headers: { Origin: 'https://untrusted.test' } })).status, 403);
    for (let i = 0; i < 15; i++) assert.equal((await call('/api/login', { body: { email: 'missing@example.test', password: 'x' } })).status, 401);
    assert.equal((await call('/api/login', { body: { email: 'missing@example.test', password: 'x' } })).status, 429);
  } finally { DB.close(); }
});
test('all 15 lessons have matching Kazakh and Russian identifiers and valid quizzes', () => {
  assert.deepEqual(CONTENT.kk.map(l => l.id), CONTENT.ru.map(l => l.id));
  for (const lessons of Object.values(CONTENT)) for (const lesson of lessons) {
    assert.ok(lesson.sections.length); assert.ok(lesson.quiz.length);
    for (const q of lesson.quiz) assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length);
  }
});
test('signed video links encode paths, expire, and never expose the secret key', async () => {
  const env = { S3_ENDPOINT: 'https://storage.example.test', S3_BUCKET: 'private-course', S3_ACCESS_KEY: 'public-key-id', S3_SECRET_KEY: 'never-expose-this' };
  const url = new URL(await signedVideoUrl(env, 'course/lesson 01.mp4', new Date('2026-10-11T12:00:00Z')));
  assert.equal(url.pathname, '/private-course/course/lesson%2001.mp4');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '3600');
  assert.match(url.searchParams.get('X-Amz-Signature'), /^[0-9a-f]{64}$/);
  assert.equal(url.href.includes(env.S3_SECRET_KEY), false);
  await assert.rejects(() => signedVideoUrl({ ...env, S3_ENDPOINT: 'http://storage.example.test' }, 'a.mp4'));
});
