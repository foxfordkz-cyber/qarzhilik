// QARZHЫ — Cloudflare Worker: статикалық сайт + API (D1)
//   POST /api/register   { name, email, password }
//   POST /api/login      { email, password }
//   POST /api/logout
//   GET  /api/me
//   POST /api/enroll     { course }
//   POST /api/progress   { course, topic, quizScore, quizTotal }
//   GET  /api/rates      — Ұлттық Банктің ресми бағамдары
//   GET  /api/bank-rates — банктердің айырбастау бағамдары (сатып алу / сату)

import { fetchBankRates } from "./fx.js";

const COURSES = ["life", "pro"];
const SESSION_COOKIE = "qz_session";
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;
const RATES_URL = "https://nationalbank.kz/rss/rates_all.xml";
const RATES_TTL = 60 * 60; // 1 сағат
const RATE_CODES = ["USD", "EUR", "RUB", "CNY"];
const BANK_RATES_TTL = 30 * 60; // 30 минут

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    try {
      return await handleApi(request, env, ctx, url);
    } catch (err) {
      console.error(err);
      return json({ error: "Сервер қатесі. Кейінірек қайталап көріңіз." }, 500);
    }
  },
};

async function handleApi(request, env, ctx, url) {
  const route = `${request.method} ${url.pathname}`;

  if (route === "GET /api/rates") return rates(ctx);
  if (route === "GET /api/bank-rates") return bankRates(ctx);

  if (request.method === "POST" && !isSameOrigin(request, url)) {
    return json({ error: "Рұқсат жоқ" }, 403);
  }

  switch (route) {
    case "POST /api/register": return register(request, env);
    case "POST /api/login":    return login(request, env);
    case "POST /api/logout":   return logout(request, env);
    case "GET /api/me":        return me(request, env);
    case "POST /api/enroll":   return enroll(request, env);
    case "POST /api/progress": return saveProgress(request, env);
  }
  return json({ error: "Табылмады" }, 404);
}

// ---------- Auth ----------

async function register(request, env) {
  const body = await readJson(request);
  const name = String(body.name || "").trim().slice(0, 80);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (name.length < 2) return json({ error: "Атыңызды енгізіңіз" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    return json({ error: "Email дұрыс емес" }, 400);
  }
  if (password.length < 6) return json({ error: "Құпиясөз кемінде 6 таңбадан тұруы керек" }, 400);

  const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (exists) return json({ error: "Бұл email бұрын тіркелген. Кіріп көріңіз." }, 409);

  const salt = randomHex(16);
  const hash = await hashPassword(password, salt);
  const res = await env.DB
    .prepare("INSERT INTO users (name, email, password_hash, salt) VALUES (?, ?, ?, ?)")
    .bind(name, email, hash, salt)
    .run();

  const userId = res.meta.last_row_id;
  const cookie = await createSession(env, userId);
  return json({ user: { id: userId, name, email } }, 201, { "Set-Cookie": cookie });
}

async function login(request, env) {
  const body = await readJson(request);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  const user = await env.DB
    .prepare("SELECT id, name, email, password_hash, salt FROM users WHERE email = ?")
    .bind(email)
    .first();
  if (!user) return json({ error: "Email немесе құпиясөз қате" }, 401);

  const hash = await hashPassword(password, user.salt);
  if (!timingSafeEqual(hash, user.password_hash)) {
    return json({ error: "Email немесе құпиясөз қате" }, 401);
  }

  const cookie = await createSession(env, user.id);
  return json({ user: { id: user.id, name: user.name, email: user.email } }, 200, { "Set-Cookie": cookie });
}

async function logout(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  return json({ ok: true }, 200, {
    "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  });
}

async function me(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ user: null });

  const [enrollments, progress] = await env.DB.batch([
    env.DB.prepare("SELECT course, created_at FROM enrollments WHERE user_id = ?").bind(user.id),
    env.DB
      .prepare("SELECT course, topic, quiz_score, quiz_total, completed_at FROM progress WHERE user_id = ?")
      .bind(user.id),
  ]);

  return json({
    user,
    enrollments: enrollments.results.map((r) => r.course),
    progress: progress.results.map((r) => ({
      course: r.course,
      topic: r.topic,
      quizScore: r.quiz_score,
      quizTotal: r.quiz_total,
      completedAt: r.completed_at,
    })),
  });
}

// ---------- Courses ----------

async function enroll(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Алдымен жүйеге кіріңіз" }, 401);

  const { course } = await readJson(request);
  if (!COURSES.includes(course)) return json({ error: "Курс табылмады" }, 400);

  await env.DB
    .prepare("INSERT OR IGNORE INTO enrollments (user_id, course) VALUES (?, ?)")
    .bind(user.id, course)
    .run();
  return json({ ok: true });
}

async function saveProgress(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Алдымен жүйеге кіріңіз" }, 401);

  const body = await readJson(request);
  const course = body.course;
  const topic = String(body.topic || "");
  if (!COURSES.includes(course) || !/^[a-z0-9-]{2,40}$/.test(topic)) {
    return json({ error: "Қате деректер" }, 400);
  }
  const quizTotal = toSmallInt(body.quizTotal);
  const quizScore = quizTotal == null ? null : Math.min(toSmallInt(body.quizScore) ?? 0, quizTotal);

  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO enrollments (user_id, course) VALUES (?, ?)").bind(user.id, course),
    env.DB
      .prepare(
        `INSERT INTO progress (user_id, course, topic, quiz_score, quiz_total)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, course, topic) DO UPDATE SET
           quiz_score = COALESCE(MAX(excluded.quiz_score, progress.quiz_score), excluded.quiz_score, progress.quiz_score),
           quiz_total = COALESCE(excluded.quiz_total, progress.quiz_total)`
      )
      .bind(user.id, course, topic, quizScore, quizTotal),
  ]);
  return json({ ok: true });
}

// ---------- Rates ----------

async function rates(ctx) {
  const cache = caches.default;
  const cacheKey = new Request("https://qarzhy.cache/api/rates");
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let data;
  try {
    const res = await fetch(RATES_URL, { cf: { cacheTtl: RATES_TTL } });
    if (!res.ok) throw new Error(`NBK ${res.status}`);
    data = parseRates(await res.text());
  } catch (err) {
    console.error("rates", err);
    return json({ error: "Бағамдар уақытша қолжетімсіз" }, 502);
  }

  const response = json(data, 200, { "Cache-Control": `public, max-age=${RATES_TTL}` });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function bankRates(ctx) {
  const cache = caches.default;
  const cacheKey = new Request("https://qarzhy.cache/api/bank-rates");
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const banks = await fetchBankRates();
  if (!Object.keys(banks).length) return json({ error: "Бағамдар уақытша қолжетімсіз" }, 502);

  const updatedAt = new Date().toLocaleString("ru-RU", {
    timeZone: "Asia/Almaty", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const response = json({ updatedAt, banks }, 200, { "Cache-Control": `public, max-age=${BANK_RATES_TTL}` });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

function parseRates(xml) {
  const out = { source: "nationalbank.kz", date: null, rates: {} };
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = (name) => (item.match(new RegExp(`<${name}>([^<]*)</${name}>`)) || [])[1]?.trim();
    const code = tag("title");
    if (!RATE_CODES.includes(code)) continue;
    const quant = Number(tag("quant")) || 1;
    out.rates[code] = {
      rate: Number(tag("description")) / quant,
      change: Number(tag("change")) / quant || 0,
    };
    out.date ||= tag("pubDate");
  }
  if (!Object.keys(out.rates).length) throw new Error("NBK: бос жауап");
  return out;
}

// ---------- Sessions ----------

async function createSession(env, userId) {
  const token = randomHex(32);
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < ?").bind(userId, now),
    env.DB
      .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(token, userId, now + maxAge * 1000),
  ]);
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function currentUser(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return env.DB
    .prepare(
      `SELECT u.id, u.name, u.email FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .bind(token, Date.now())
    .first();
}

// ---------- Helpers ----------

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomHex(bytes) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  return new Uint8Array(hex.match(/.{2}/g).map((h) => parseInt(h, 16)));
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function isSameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  return !origin || origin === url.origin;
}

async function readJson(request) {
  try {
    return (await request.json()) || {};
  } catch {
    return {};
  }
}

function toSmallInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}
