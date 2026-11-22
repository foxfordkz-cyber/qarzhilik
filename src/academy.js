import { CONTENT } from './academy-content.js';

const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const langOf = url => url.searchParams.get('lang') === 'ru' ? 'ru' : 'kk';
const message = (lang, ru, kk) => lang === 'ru' ? ru : kk;
const active = access => access?.status === 'active' && (!access.expires_at || access.expires_at > Date.now());
const getAccess = (env, id) => id ? env.DB.prepare('SELECT * FROM academy_access WHERE user_id = ?').bind(id).first() : null;
const videoConfigured = env => !!(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY && env.S3_SECRET_KEY);

export function gradeLesson(lesson, answers) {
  if (!Array.isArray(answers) || answers.length !== lesson.quiz.length || answers.some((answer, i) => !Number.isInteger(answer) || answer < 0 || answer >= lesson.quiz[i].options.length)) return null;
  const score = answers.reduce((n, answer, i) => n + Number(answer === lesson.quiz[i].answer), 0);
  return { score, total: lesson.quiz.length, passed: score / lesson.quiz.length >= .75,
    feedback: lesson.quiz.map((q, i) => ({ correct: answers[i] === q.answer, answer: q.answer, explain: q.explain })) };
}

export async function academyApi(request, env, user, url) {
  const lang = langOf(url), path = url.pathname, method = request.method;
  const lessons = CONTENT[lang];
  const fail = (ru, kk, status) => reply({ error: message(lang, ru, kk) }, status);
  const access = await getAccess(env, user?.id);
  const hasAccess = !!user?.is_admin || active(access);
  if (method === 'GET' && path === '/api/academy') {
    const progress = user ? (await env.DB.prepare('SELECT lesson, score, total, completed, position_seconds, updated_at FROM academy_progress WHERE user_id = ?').bind(user.id).all()).results : [];
    const videos = (await env.DB.prepare('SELECT lesson FROM academy_videos').all()).results;
    return reply({ course: { id: 'financial-literacy', title: message(lang, 'Финансовая грамотность', 'Қаржылық сауаттылық'), lessonCount: lessons.length, plannedMinutes: 450, stage: 'pilot', paymentsEnabled: false },
      user: user ? { id: user.id, name: user.name, email: user.email, isAdmin: !!user.is_admin } : null,
      access: { status: hasAccess ? 'active' : access?.status === 'active' ? 'expired' : access?.status || 'none', expiresAt: access?.expires_at || null },
      lessons: lessons.map((lesson, i) => ({ id: lesson.id, number: i + 1, title: lesson.title, summary: lesson.summary,
        plannedMinutes: 30, preview: i === 0, locked: !hasAccess && i > 0, module: i < 5 ? 1 : i < 10 ? 2 : 3,
        videoReady: videoConfigured(env) && videos.some(v => v.lesson === lesson.id), quizCount: lesson.quiz.length })), progress });
  }
  if (method === 'POST' && path === '/api/academy/request-access') {
    if (!user) return fail('Войдите в аккаунт.', 'Аккаунтқа кіріңіз.', 401);
    if (hasAccess) return reply({ ok: true, status: 'active' });
    await env.DB.prepare(`INSERT INTO academy_access (user_id) VALUES (?) ON CONFLICT(user_id) DO UPDATE SET status = 'pending', updated_at = datetime('now')`).bind(user.id).run();
    return reply({ ok: true, status: 'pending' });
  }
  const lessonMatch = path.match(/^\/api\/academy\/lessons\/([a-z0-9-]+)(?:\/(quiz|position|video))?$/);
  if (lessonMatch) {
    const lesson = lessons.find(l => l.id === lessonMatch[1]), action = lessonMatch[2];
    if (!lesson) return fail('Урок не найден.', 'Сабақ табылмады.', 404);
    if (lesson.id !== lessons[0].id && !hasAccess) return fail('Для этого урока нужен доступ к курсу.', 'Бұл сабақ үшін курсқа рұқсат керек.', user ? 403 : 401);
    if (method === 'GET' && !action) return reply({ lesson: { ...lesson, quiz: lesson.quiz.map(q => ({ q: q.q, options: q.options })) } });
    if (method === 'POST' && action === 'quiz') {
      if (!user) return fail('Войдите, чтобы сохранить результат.', 'Нәтижені сақтау үшін кіріңіз.', 401);
      const result = gradeLesson(lesson, (await request.json()).answers);
      if (!result) return fail('Ответьте на каждый вопрос.', 'Барлық сұраққа жауап беріңіз.', 400);
      await env.DB.prepare(`INSERT INTO academy_progress (user_id, lesson, score, total, completed) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, lesson) DO UPDATE SET score = MAX(score, excluded.score), total = excluded.total,
        completed = MAX(completed, excluded.completed), updated_at = datetime('now')`).bind(user.id, lesson.id, result.score, result.total, Number(result.passed)).run();
      return reply(result);
    }
    if (method === 'POST' && action === 'position') {
      if (!user) return fail('Войдите в аккаунт.', 'Аккаунтқа кіріңіз.', 401);
      const { seconds } = await request.json();
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 14400) return fail('Некорректная позиция.', 'Қате уақыт.', 400);
      await env.DB.prepare(`INSERT INTO academy_progress (user_id, lesson, total, position_seconds) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, lesson) DO UPDATE SET position_seconds = excluded.position_seconds, updated_at = datetime('now')`).bind(user.id, lesson.id, lesson.quiz.length, seconds).run();
      return reply({ ok: true });
    }
    if (method === 'GET' && action === 'video') {
      const video = await env.DB.prepare('SELECT object_key FROM academy_videos WHERE lesson = ?').bind(lesson.id).first();
      if (!video || !videoConfigured(env)) return reply({ available: false });
      return reply({ available: true, url: await signedVideoUrl(env, video.object_key), expiresIn: 3600 });
    }
  }
  if (path.startsWith('/api/academy/admin')) {
    if (!user?.is_admin) return fail('Доступ только для преподавателя.', 'Тек оқытушыға арналған.', 403);
    if (method === 'GET' && path === '/api/academy/admin') {
      const students = (await env.DB.prepare(`SELECT u.id, u.name, u.email, a.status, a.requested_at, a.expires_at,
        (SELECT COUNT(*) FROM academy_progress p WHERE p.user_id = u.id AND p.completed = 1) completed
        FROM academy_access a JOIN users u ON u.id = a.user_id ORDER BY a.requested_at DESC LIMIT 500`).all()).results;
      return reply({ students, videoConfigured: videoConfigured(env), videos: (await env.DB.prepare('SELECT lesson, object_key FROM academy_videos').all()).results });
    }
    if (method === 'POST' && path === '/api/academy/admin/access') {
      const { userId, status, days } = await request.json();
      if (!Number.isInteger(userId) || !['active', 'revoked'].includes(status) || (status === 'active' && (!Number.isInteger(days) || days < 1 || days > 366))) return fail('Проверьте параметры доступа.', 'Рұқсат параметрлерін тексеріңіз.', 400);
      if (!await getAccess(env, userId)) return fail('Заявка не найдена.', 'Өтінім табылмады.', 404);
      await env.DB.batch([
        env.DB.prepare(`UPDATE academy_access SET status = ?, expires_at = ?, granted_by = ?, updated_at = datetime('now') WHERE user_id = ?`).bind(status, status === 'active' ? Date.now() + days * 86400000 : null, user.id, userId),
        env.DB.prepare('INSERT INTO academy_audit (actor_id, user_id, action, details) VALUES (?, ?, ?, ?)').bind(user.id, userId, status, JSON.stringify({ days: status === 'active' ? days : null })),
      ]);
      return reply({ ok: true });
    }
    if (method === 'POST' && path === '/api/academy/admin/video') {
      const { lessonId, objectKey } = await request.json();
      if (!lessons.some(l => l.id === lessonId) || typeof objectKey !== 'string' || !/^[a-zA-Z0-9/_ .-]{1,250}\.mp4$/.test(objectKey) || objectKey.includes('..')) return fail('Укажите ключ MP4-файла в закрытом S3.', 'Жабық S3 ішіндегі MP4 файл кілтін көрсетіңіз.', 400);
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO academy_videos (lesson, object_key) VALUES (?, ?) ON CONFLICT(lesson) DO UPDATE SET object_key = excluded.object_key, updated_at = datetime('now')`).bind(lessonId, objectKey),
        env.DB.prepare('INSERT INTO academy_audit (actor_id, action, details) VALUES (?, ?, ?)').bind(user.id, 'video', JSON.stringify({ lessonId, objectKey })),
      ]);
      return reply({ ok: true });
    }
  }
  return fail('Страница не найдена.', 'Бет табылмады.', 404);
}

// Private S3 MP4 files, signed on the server. No credentials enter the clients.
export async function signedVideoUrl(env, objectKey, now = new Date()) {
  const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  const enc = value => encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const utf = new TextEncoder();
  const hash = async value => hex(await crypto.subtle.digest('SHA-256', utf.encode(value)));
  const hmac = async (key, value) => crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', typeof key === 'string' ? utf.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), utf.encode(value));
  const endpoint = new URL(env.S3_ENDPOINT);
  if (endpoint.protocol !== 'https:' || endpoint.search || endpoint.pathname !== '/') throw new Error('S3_ENDPOINT must be an HTTPS origin');
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, ''), day = stamp.slice(0, 8), region = env.S3_REGION || 'us-east-1';
  const scope = `${day}/${region}/s3/aws4_request`;
  const path = '/' + [env.S3_BUCKET, ...objectKey.split('/')].map(enc).join('/');
  const params = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${env.S3_ACCESS_KEY}/${scope}`, 'X-Amz-Date': stamp, 'X-Amz-Expires': '3600', 'X-Amz-SignedHeaders': 'host' };
  const query = Object.keys(params).sort().map(k => `${enc(k)}=${enc(params[k])}`).join('&');
  const canonical = `GET\n${path}\n${query}\nhost:${endpoint.host}\n\nhost\nUNSIGNED-PAYLOAD`;
  let key = await hmac('AWS4' + env.S3_SECRET_KEY, day);
  for (const part of [region, 's3', 'aws4_request']) key = await hmac(key, part);
  return `${endpoint.origin}${path}?${query}&X-Amz-Signature=${hex(await hmac(key, `AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${await hash(canonical)}`))}`;
}
