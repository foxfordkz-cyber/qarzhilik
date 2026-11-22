/**
 * banks-b.js — ставкаларды автоматты жинайтын фетчерлер (2-топ).
 *
 * Банктер: bcc (www.bcc.kz), alatau (alataucitybank.kz),
 *          forte (bank.forte.kz), eurasian (eubank.kz)
 *
 * Cloudflare Worker ішінде күнделікті cron-мен жұмыс істеуге арналған.
 * Тек fetch / AbortSignal.timeout / JSON / RegExp — npm да, DOM да жоқ.
 *
 * Шығыс пішімі (Worker өзі normalize.js арқылы санға айналдырады):
 *   deposits: [{ name, rate, gesv, minTerm, currencies, url }]
 *   loans:    [{ type, name, rateFrom, gesvFrom, maxAmount, maxTerm, url }]
 *
 * robots.txt (01.10.2026 тексерілді) — барлық пайдаланылған жол '*' үшін ашық:
 *   www.bcc.kz        : Disallow /bitrix/ /local/ /upload/ /search/ /prelogin* /index.php
 *                       → /personal/** ашық.
 *   alataucitybank.kz : Allow: / ; Disallow /search, utm/gclid/yclid параметрлері
 *                       → /graphql ашық.
 *   bank.forte.kz     : Allow: / ; Disallow /private/ → /ru/** ашық.
 *   eubank.kz         : "Disallow:" (бос) — барлығы ашық → /api/pages ашық.
 */

/* ------------------------------------------------------------------ *
 *  HTTP
 * ------------------------------------------------------------------ */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TIMEOUT_MS = 8000;

async function httpGet(url, accept) {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'user-agent': UA,
      accept: accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ru,kk;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res.text();
}

async function httpPostJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'user-agent': UA,
      'content-type': 'application/json',
      accept: 'application/json',
      'accept-language': 'ru,kk;q=0.9,en;q=0.8',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`POST ${url} → HTTP ${res.status}`);
  return res.json();
}

async function getJson(url) {
  const txt = await httpGet(url, 'application/json,*/*;q=0.8');
  return JSON.parse(txt);
}

/* ------------------------------------------------------------------ *
 *  Мәтін / сан көмекшілері
 * ------------------------------------------------------------------ */

const ENTITIES = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…', deg: '°',
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));
}

/** HTML → бір жолдық таза мәтін (script/style алынып тасталады). */
function htmlToText(html) {
  return decodeEntities(
    String(html)
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[\u00a0\u202f\u2028\u2029\u3164\u115f\u1160]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** HTML ішіндегі экрандалған JSON-ды (Next.js/Strapi payload) оқуға жарамды қылу. */
function unescapeEmbedded(html) {
  return String(html)
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u2028/gi, ' ')
    .replace(/\\\\n/g, ' ')
    .replace(/\\n/g, ' ')
    .replace(/\\"/g, '"');
}

/** JSON ағашындағы барлық жолдарды құжат тәртібімен біріктіру. */
function flattenStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) flattenStrings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) flattenStrings(v, out);
  return out;
}

function jsonToText(json) {
  return htmlToText(flattenStrings(json).join(' | '));
}

function toNum(raw) {
  if (raw === null || raw === undefined) return null;
  const n = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function tidy(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s:–—-]+|[\s:*–—,.]+$/g, '').trim();
  return t ? t : null;
}

/* ------------------------------------------------------------------ *
 *  Ставка + ГЭСВ іздеу (жапсырмаға байланған регекстер)
 * ------------------------------------------------------------------ */

const NUM = String.raw`(\d{1,2}(?:[.,]\d{1,2})?)`;
const SEP = String.raw`(?:\s*(?:до|[-–—])\s*)`;
/** "15,00 - 17,40%" / "от 16% до 38%" — екінші саннан кейін % болуы шарт. */
const RANGE = `(?:от\\s*)?${NUM}\\s*%?${SEP}${NUM}\\s*%`;
/** "(ГЭСВ", "ГЭСВ :", "ГЭСВ- ", "(ГЭСВ) – от" */
const GESV = String.raw`\(?\s*ГЭСВ\s*\)?[^0-9]{0,30}?(?:от\s*)?`;
/** "Ставка", "ставка вознаграждения", "Номинальная ставка" ... (% кездеспеуі керек) */
const RATE_LABEL = String.raw`[Сс]тавк\S*[^0-9%]{0,90}?(?:от\s*)?`;
const GAP = String.raw`[^0-9]{0,70}?`;

const RX_LABEL_RANGE = new RegExp(RATE_LABEL + RANGE + GAP + GESV + RANGE, 'g');
const RX_LABEL_ONE = new RegExp(RATE_LABEL + NUM + String.raw`\s*%[^0-9]{0,90}?` + GESV + NUM + String.raw`\s*%`, 'g');
const RX_FREE_RANGE = new RegExp(RANGE + GAP + GESV + RANGE, 'g');
const RX_FREE_ONE = new RegExp(NUM + String.raw`\s*%[^0-9]{0,90}?` + GESV + NUM + String.raw`\s*%`, 'g');

/**
 * Мәтіннен (rate, gesv) жұптарын қабаттап жинайды.
 * Бірінші жеміс берген қабат қайтарылады — төмендегі «шулы» қабаттар елеусіз қалады.
 */
function ratePairs(text, kind) {
  const tiers =
    kind === 'loan'
      ? [RX_LABEL_RANGE, RX_LABEL_ONE, RX_FREE_RANGE, RX_FREE_ONE]
      : [RX_FREE_RANGE, RX_LABEL_RANGE, RX_FREE_ONE];

  for (const rx of tiers) {
    const out = [];
    rx.lastIndex = 0;
    let m;
    while ((m = rx.exec(text)) !== null) {
      const g = m.slice(1).map(toNum).filter((x) => x !== null);
      if (g.length === 4) {
        const [r1, r2, g1, g2] = g;
        out.push(
          kind === 'loan'
            ? { rate: Math.min(r1, r2), gesv: Math.min(g1, g2) }
            : { rate: Math.max(r1, r2), gesv: Math.max(g1, g2) }
        );
      } else if (g.length === 2) {
        out.push({ rate: g[0], gesv: g[1] });
      }
    }
    const ok = out.filter((p) => isSane(kind, p.rate, p.gesv));
    if (ok.length) return ok;
  }
  return [];
}

/** Жапсырма айналасындағы терезелерді ғана қарау (бір бетте бірнеше бағдарлама болса). */
function windows(text, anchor, width = 260) {
  if (!anchor) return [text];
  const out = [];
  let i = text.indexOf(anchor);
  while (i !== -1) {
    out.push(text.slice(i, i + width));
    i = text.indexOf(anchor, i + 1);
  }
  return out;
}

function pickPair(text, kind, anchor) {
  const all = [];
  for (const w of windows(text, anchor)) all.push(...ratePairs(w, kind));
  if (!all.length) return null;
  if (kind === 'loan') {
    all.sort((a, b) => a.rate - b.rate || a.gesv - b.gesv);
  } else {
    all.sort((a, b) => b.rate - a.rate || b.gesv - a.gesv);
  }
  return all[0];
}

/* ------------------------------------------------------------------ *
 *  Валидация
 * ------------------------------------------------------------------ */

const LIMITS = {
  deposit: { rate: [0, 30], gesv: [0, 35] },
  loan: { rate: [0, 60], gesv: [0, 60] },
};

function inRange(v, [lo, hi]) {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
}

/** Жеке жұпқа ақылға қонымдылық тексерісі. */
function isSane(kind, rate, gesv) {
  const L = LIMITS[kind];
  if (rate !== null && rate !== undefined && !inRange(rate, L.rate)) return false;
  if (gesv !== null && gesv !== undefined && !inRange(gesv, L.gesv)) return false;
  if (kind === 'loan' && rate !== null && gesv !== null && rate !== undefined && gesv !== undefined) {
    // Қарыз бойынша ГЭСВ номиналдық ставкадан кем болмайды.
    if (gesv < rate) return false;
  }
  return true;
}

/**
 * Өнімді жинақтаушы. Тексерістен өтпегені — қайтарылмайды, тек есептеледі.
 * Мұнда rate міндетті: оны таппасақ, өнімді қайтарғаннан гөрі тастаймыз.
 */
function collector(kind) {
  const items = [];
  const dropped = [];
  return {
    items,
    dropped,
    add(obj, rate, gesv) {
      const r = rate === null || rate === undefined ? null : toNum(rate);
      const g = gesv === null || gesv === undefined ? null : toNum(gesv);
      const label = obj.name || obj.type || obj.url;
      if (r === null) {
        dropped.push({ product: label, reason: 'ставка табылмады' });
        return;
      }
      if (!isSane(kind, r, g)) {
        dropped.push({ product: label, reason: `валидациядан өтпеді (rate=${r}, gesv=${g})` });
        return;
      }
      if (kind === 'deposit') items.push({ ...obj, rate: r, gesv: g });
      else items.push({ ...obj, rateFrom: r, gesvFrom: g });
    },
  };
}

function finish(bank, dep, loan) {
  const dropped = [...dep.dropped, ...loan.dropped];
  if (!dep.items.length && !loan.items.length) {
    throw new Error(`${bank}: бірде-бір өнім жиналмады (${dropped.length} тасталды)`);
  }
  return {
    deposits: dep.items,
    loans: loan.items,
    _dropped: dropped,
  };
}

/* ------------------------------------------------------------------ *
 *  Мерзім / сома мәтінін алу
 * ------------------------------------------------------------------ */

/** «8 000 000 ₸», «50 млн ₸», «от 100 000 до 7 000 000 теңге» */
const AMT = String.raw`\d[\d \u00a0\u202f]{0,18}(?:\s*(?:млн|млрд))?`;
const AMOUNT = String.raw`((?:от|до)?\s*${AMT}(?:\s*(?:до|[-–—])\s*${AMT})?\s*(?:₸|тенге|теңге))`;

function grabAmount(text) {
  const labelled = new RegExp(
    String.raw`(?:Максимальная\s+сумма(?:\s+(?:займа|кредита|финансирования))?|Сумма\s+(?:займа|кредита|финансирования)|Сумма)` +
      String.raw`[^0-9]{0,30}?` +
      AMOUNT,
    'i'
  );
  let m = text.match(labelled);
  if (m) return tidy(m[1]);
  // Жапсырмасыз нұсқа: «Оформите до 200 000 000 ₸», «Ипотека до 100 000 000 ₸»
  m = text.match(new RegExp(String.raw`(до\s*${AMT}\s*(?:₸|тенге|теңге))`, 'i'));
  return m ? tidy(m[1]) : null;
}

function grabTerm(text, words) {
  const tail = String.raw`(?:месяц|мес\.|лет|год|жыл)[а-яёңқұүһө]{0,4}(?![а-яёA-Za-z])`;
  // «Срок …» жапсырмасының барлық кездесуін қарап, «до N месяцев» түрін артық көреміз.
  const label = new RegExp(String.raw`(?:Срок|Сроки)\s*(?:${words})?`, 'gi');
  const up = new RegExp(String.raw`(до\s*\d[^|;.!?%]{0,40}?${tail})`, 'i');
  let m;
  label.lastIndex = 0;
  while ((m = label.exec(text)) !== null) {
    const hit = text.slice(m.index + m[0].length, m.index + m[0].length + 120).match(up);
    if (hit) return tidy(hit[1]);
  }
  const any = new RegExp(
    String.raw`(?:Срок|Сроки)\s*(?:${words})?[^0-9]{0,30}?((?:от|до)?\s*\d[^|;.!?%]{0,60}?${tail})`,
    'i'
  );
  const m2 = text.match(any);
  return m2 ? tidy(m2[1]) : null;
}

/* ================================================================== *
 *  1. BCC — www.bcc.kz
 *     Дереккөз: өнім беттерінің HTML мәтіні.
 *     Сайтта ашық JSON/XHR ставка эндпойнті жоқ; JSON-LD (schema.org)
 *     бар, бірақ ол ескірген/қайшылықты (мыс. birge-plus → 16,7),
 *     сондықтан «Ставка … (ГЭСВ …)» жапсырмасына байланған мәтін оқылады.
 * ================================================================== */

const BCC_DEPOSITS = [
  { name: '«Моя цель»', slug: 'personal/deposits/my-target', currencies: ['KZT'] },
  { name: '«Рахмет»', slug: 'personal/deposits/rakhmet', currencies: ['KZT', 'USD'] },
  { name: 'Birge+', slug: 'personal/deposits/birge-plus', currencies: ['KZT'] },
  { name: '«Чемпион»', slug: 'personal/deposits/champion', currencies: ['KZT', 'USD', 'RUB', 'EUR'] },
];

const BCC_LOANS = [
  { type: 'Кредит наличными', slug: 'personal/loans/cash-credit' },
  { type: 'Рефинансирование', slug: 'personal/loans/refinancing' },
  { type: 'Автокредит', slug: 'personal/loans/auto-credit-for-new-car' },
  // Бір бетте бірнеше ипотека бағдарламасы бар (#Ипотека, #Ипотека ПЛЮС, #Ипотека ДДУ,
  // 7-20-25, партнерлік …). Базалық «#Ипотека» бағдарламасының жапсырмасына бекітеміз.
  { type: 'Ипотека', name: '#Ипотека', slug: 'personal/ipoteka', anchor: '#Ипотека - Ставка' },
  { type: 'Кредит под залог недвижимости', slug: 'personal/loans/mortgage-loan' },
];

async function bcc() {
  const dep = collector('deposit');
  const loan = collector('loan');

  const texts = {};
  const all = [...BCC_DEPOSITS, ...BCC_LOANS];
  const pages = await Promise.all(
    all.map((p) =>
      httpGet(`https://www.bcc.kz/${p.slug}/`).then(
        (h) => ({ slug: p.slug, text: htmlToText(h) }),
        (e) => ({ slug: p.slug, error: String(e && e.message) })
      )
    )
  );
  for (const r of pages) texts[r.slug] = r;

  for (const p of BCC_DEPOSITS) {
    const url = `https://www.bcc.kz/${p.slug}/`;
    const t = texts[p.slug];
    const base = { name: p.name, minTerm: null, currencies: p.currencies, url };
    if (!t || t.error) {
      dep.dropped.push({ product: p.name, reason: `бет оқылмады: ${t && t.error}` });
      continue;
    }
    const pair = pickPair(t.text, 'deposit');
    base.minTerm = grabTerm(t.text, 'вклада|хранения вклада');
    dep.add(base, pair && pair.rate, pair && pair.gesv);
  }

  for (const p of BCC_LOANS) {
    const url = `https://www.bcc.kz/${p.slug}/`;
    const t = texts[p.slug];
    const base = {
      type: p.type,
      name: p.name || p.type,
      maxAmount: null,
      maxTerm: null,
      url,
    };
    if (!t || t.error) {
      loan.dropped.push({ product: p.type, reason: `бет оқылмады: ${t && t.error}` });
      continue;
    }
    const pair = pickPair(t.text, 'loan', p.anchor);
    base.maxAmount = grabAmount(t.text);
    base.maxTerm = grabTerm(t.text, 'кредита|займа|кредитования');
    loan.add(base, pair && pair.rate, pair && pair.gesv);
  }

  return finish('bcc', dep, loan);
}

/* ================================================================== *
 *  2. ALATAU — alataucitybank.kz
 *     Дереккөз: сайттың өзі шақыратын GraphQL:
 *       POST https://alataucitybank.kz/graphql
 *       { bankProductsByLink(link:"…"){ TableTariffs{content{ru}}
 *         productReview{tariffs{shortInfo{info{ru}}}} } }
 *     Депозит ставкалары TableTariffs кестесінде («16,5% до 17,81%»),
 *     қарыз шарттары shortInfo жолдарында (label/value).
 * ================================================================== */

const ALATAU_GQL = 'https://alataucitybank.kz/graphql';

const ALATAU_DEPOSITS = [
  { link: 'sandyq', name: 'Sandyq', currencies: ['KZT'] },
  { link: 'jinaq+', name: 'Jinaq+', currencies: ['KZT', 'USD'] },
  { link: 'baytaq-deposit', name: 'Baytaq депозит', currencies: ['KZT', 'USD', 'EUR', 'RUB'] },
  { link: 'common-budget', name: 'Общий бюджет', currencies: ['KZT'] },
];

const ALATAU_LOANS = [
  { link: 'express', type: 'Кредит наличными' },
  { link: 'refinance', type: 'Рефинансирование' },
  { link: 'salary', type: 'Кредит до зарплаты' },
];

function alatauQuery(link) {
  return {
    query:
      '{bankProductsByLink(link:"' +
      link.replace(/["\\]/g, '') +
      '"){TableTariffs{content{ru}} productReview{tariffs{shortInfo{info{ru}}}}}}',
  };
}

async function alatauProduct(link) {
  const j = await httpPostJson(ALATAU_GQL, alatauQuery(link));
  const p = j && j.data && j.data.bankProductsByLink;
  if (!p) throw new Error(`alatau: "${link}" GraphQL жауабы бос`);
  const tariffs = htmlToText((p.TableTariffs || []).map((x) => (x && x.content && x.content.ru) || '').join(' '));
  const rows = ((p.productReview && p.productReview.tariffs && p.productReview.tariffs.shortInfo) || [])
    .map((x) => (x && x.info && x.info.ru) || '')
    .map((html) => {
      const cells = String(html)
        .split(/<\/td>/i)
        .map((c) => htmlToText(c))
        .filter((c) => c);
      return { label: cells[0] || '', value: cells.slice(1).join(' ') };
    })
    .filter((r) => r.label);
  return { tariffs, rows };
}

function alatauRow(rows, rx) {
  const r = rows.find((x) => rx.test(x.label));
  return r ? r.value : null;
}

/**
 * Alatau тарифтер кестесі «номиналды % / эффективті %» бағандарынан тұрады:
 *   «Срок мес. … KZT  6  16,5%  до 17,81%»
 * Сондықтан ГЭСВ сөзі жоқ — «X% до Y%» жұптарын тікелей оқимыз.
 * Шетел валютасының ставкалары әлдеқайда төмен (0,98% …), ең жоғарғысы = KZT.
 */
const ALATAU_PAIR = new RegExp(NUM + String.raw`\s*%\s*до\s*` + NUM + String.raw`\s*%`, 'g');

function alatauDepositPair(tariffs) {
  ALATAU_PAIR.lastIndex = 0;
  const out = [];
  let m;
  while ((m = ALATAU_PAIR.exec(tariffs)) !== null) {
    const rate = toNum(m[1]);
    const gesv = toNum(m[2]);
    if (rate === null || !isSane('deposit', rate, gesv)) continue;
    if (gesv !== null && gesv < rate) continue; // эффективті ставка номиналдықтан кем болмайды
    out.push({ rate, gesv });
  }
  if (!out.length) return null;
  out.sort((a, b) => b.rate - a.rate || (b.gesv || 0) - (a.gesv || 0));
  return out[0];
}

async function alatau() {
  const dep = collector('deposit');
  const loan = collector('loan');

  const got = {};
  const links = [...ALATAU_DEPOSITS, ...ALATAU_LOANS].map((p) => p.link);
  const res = await Promise.all(
    links.map((l) => alatauProduct(l).then((v) => ({ l, v }), (e) => ({ l, error: String(e && e.message) })))
  );
  for (const r of res) got[r.l] = r;

  for (const p of ALATAU_DEPOSITS) {
    const url = `https://alataucitybank.kz/ru/deposit/${p.link}`;
    const g = got[p.link];
    if (!g || g.error) {
      dep.dropped.push({ product: p.name, reason: `GraphQL: ${g && g.error}` });
      continue;
    }
    const pair = alatauDepositPair(g.v.tariffs) || pickPair(g.v.tariffs, 'deposit');
    const nameRow = alatauRow(g.v.rows, /Наименование\s+продукта/i);
    dep.add(
      {
        name: tidy(nameRow) || p.name,
        minTerm: tidy(alatauRow(g.v.rows, /Срок(и)?\s+(хранения|размещения)/i)) || grabTerm(g.v.tariffs, 'хранения'),
        currencies: p.currencies,
        url,
      },
      pair && pair.rate,
      pair && pair.gesv
    );
  }

  for (const p of ALATAU_LOANS) {
    const url = `https://alataucitybank.kz/ru/credit/${p.link}`;
    const g = got[p.link];
    if (!g || g.error) {
      loan.dropped.push({ product: p.type, reason: `GraphQL: ${g && g.error}` });
      continue;
    }
    const rateTxt = alatauRow(g.v.rows, /^Ставка\s+вознаграждения/i);
    const gesvTxt = alatauRow(g.v.rows, /Годовая\s+эффективная\s+ставка/i);
    const rate = rateTxt ? toNum((rateTxt.match(new RegExp(NUM + String.raw`\s*%`)) || [])[1]) : null;
    const gesv = gesvTxt ? toNum((gesvTxt.match(new RegExp(NUM + String.raw`\s*%`)) || [])[1]) : null;
    loan.add(
      {
        type: p.type,
        name: p.type,
        maxAmount: tidy(alatauRow(g.v.rows, /(Максимальная\s+сумма|^Сумма)\s+(займа|кредита)?/i)),
        maxTerm: tidy(alatauRow(g.v.rows, /^Срок\s+(займа|кредита)/i)),
        url,
      },
      rate,
      gesv
    );
  }

  return finish('alatau', dep, loan);
}

/* ================================================================== *
 *  3. FORTE — bank.forte.kz
 *     Ашық API жоқ. Беттің HTML-інде сайттың өзі қолданатын Strapi
 *     payload-ы экрандалған JSON күйінде жатыр:
 *       депозит: "toggleButtons" → values[{title,value,customPercent,gesv}]
 *       қарыз:   шарттар кестесі "title":"Ставка вознаграждения" /
 *                "title":"ГЭСВ" → "description":"**от X% до Y%**"
 *     Екеуі де табылмаса — мәтіндегі «Ставка … (ГЭСВ …)» қалыбы.
 * ================================================================== */

const FORTE_DEPOSITS = [
  { slug: 'sber_noadd', name: 'Сберегательный вклад без пополнения', currencies: ['KZT'] },
  { slug: 'sberegatelnyi', name: 'Сберегательный вклад без снятия', currencies: ['KZT'] },
  { slug: 'so-snyatiem', name: 'Депозит с возможностью снятия', currencies: ['KZT', 'USD', 'EUR'] },
];

const FORTE_LOANS = [
  { slug: 'express', type: 'Кредит наличными' },
  { slug: 'refenansirovanie', type: 'Рефинансирование' },
  { slug: 'auto-loan', type: 'Автокредит' },
  { slug: 'ipoteka_forte', type: 'Ипотека', name: 'Forte Ипотека' },
  { slug: 'ipoteka_deposit', type: 'Ипотека', name: 'Ипотека под залог денег' },
  { slug: 'credits', type: 'Кредит под залог', name: 'Залоговый кредит', anchor: '"title":"Залоговый кредит"' },
];

/** Депозит калькуляторының мерзім/ставка кілттері. */
const FORTE_TOGGLE = /"title":"([^"]{1,40})","value":"([^"]{0,60})","customPercent":"([\d.,]+)","gesv":"([\d.,]+)"/g;

function forteDepositPair(raw) {
  FORTE_TOGGLE.lastIndex = 0;
  const out = [];
  let m;
  while ((m = FORTE_TOGGLE.exec(raw)) !== null) {
    const rate = toNum(m[3]);
    const gesv = toNum(m[4]);
    if (rate === null) continue;
    if (!isSane('deposit', rate, gesv)) continue;
    out.push({ term: tidy(m[1]), rate, gesv });
  }
  if (!out.length) return null;
  out.sort((a, b) => b.rate - a.rate || (b.gesv || 0) - (a.gesv || 0));
  return out[0];
}

/** Шарттар кестесіндегі екі жол: ставка + ГЭСВ (бір-бірінен 800 таңба ішінде). */
const FORTE_RATE_ROW = new RegExp(
  '"title":"[^"]{0,80}?(?:Ставка вознаграждения|Номинальная ставка|Процентная ставка)[^"]{0,80}?","description":"[*\\s]{0,4}(?:от\\s*)?' +
    NUM +
    '\\s*%?' +
    SEP +
    NUM +
    '\\s*%',
  'g'
);
const FORTE_GESV_ROW = new RegExp(
  '"title":"[^"]{0,80}?ГЭСВ[^"]{0,20}?","description":"[*\\s]{0,4}(?:от\\s*)?' + NUM + '\\s*%?' + SEP + NUM + '\\s*%',
  'g'
);

function forteLoanRowPair(raw) {
  FORTE_RATE_ROW.lastIndex = 0;
  FORTE_GESV_ROW.lastIndex = 0;
  const rates = [];
  const gesvs = [];
  let m;
  while ((m = FORTE_RATE_ROW.exec(raw)) !== null) rates.push({ at: m.index, v: Math.min(toNum(m[1]), toNum(m[2])) });
  while ((m = FORTE_GESV_ROW.exec(raw)) !== null) gesvs.push({ at: m.index, v: Math.min(toNum(m[1]), toNum(m[2])) });
  for (const r of rates) {
    const g = gesvs.find((x) => x.at > r.at && x.at - r.at < 800);
    if (g && isSane('loan', r.v, g.v)) return { rate: r.v, gesv: g.v };
  }
  return null;
}

async function forte() {
  const dep = collector('deposit');
  const loan = collector('loan');

  const all = [...FORTE_DEPOSITS, ...FORTE_LOANS];
  const got = {};
  const res = await Promise.all(
    all.map((p) =>
      httpGet(`https://bank.forte.kz/ru/${p.slug}`).then(
        (h) => ({ slug: p.slug, raw: unescapeEmbedded(h), text: htmlToText(unescapeEmbedded(h)) }),
        (e) => ({ slug: p.slug, error: String(e && e.message) })
      )
    )
  );
  for (const r of res) got[r.slug] = r;

  for (const p of FORTE_DEPOSITS) {
    const url = `https://bank.forte.kz/ru/${p.slug}`;
    const g = got[p.slug];
    if (!g || g.error) {
      dep.dropped.push({ product: p.name, reason: `бет оқылмады: ${g && g.error}` });
      continue;
    }
    const best = forteDepositPair(g.raw);
    const pair = best || pickPair(g.text, 'deposit');
    dep.add(
      {
        name: p.name,
        minTerm: (best && best.term) || grabTerm(g.text, 'депозита|вклада'),
        currencies: p.currencies,
        url,
      },
      pair && pair.rate,
      pair && pair.gesv
    );
  }

  for (const p of FORTE_LOANS) {
    const url = `https://bank.forte.kz/ru/${p.slug}`;
    const g = got[p.slug];
    if (!g || g.error) {
      loan.dropped.push({ product: p.name || p.type, reason: `бет оқылмады: ${g && g.error}` });
      continue;
    }
    // 1) шарттар кестесінің жолдары, 2) мәтіндегі «Ставка … (ГЭСВ …)»
    let pair = p.anchor ? null : forteLoanRowPair(g.raw);
    if (!pair) {
      const scope = p.anchor ? windows(g.raw, p.anchor, 420).map((w) => htmlToText(w)).join(' ') : g.text;
      pair = pickPair(scope, 'loan');
    }
    const scopeText = p.anchor ? windows(g.raw, p.anchor, 420).map((w) => htmlToText(w)).join(' ') : g.text;
    loan.add(
      {
        type: p.type,
        name: p.name || p.type,
        maxAmount: grabAmount(scopeText) || grabAmount(g.text),
        maxTerm: grabTerm(scopeText, 'кредита|займа|кредитования') || grabTerm(g.text, 'кредита|займа|кредитования'),
        url,
      },
      pair && pair.rate,
      pair && pair.gesv
    );
  }

  return finish('forte', dep, loan);
}

/* ================================================================== *
 *  4. EURASIAN — eubank.kz
 *     Дереккөз: сайттың өз Payload CMS REST API-і (беттің серверлік
 *     деректері дәл осыдан келеді):
 *       GET https://eubank.kz/api/pages?where[slug][equals]=<slug>&depth=2
 *     Депозит: валюта блоктарында terms[{annualRate,effectiveRate,monthTerm}]
 *              → KZT ғана алынады.
 *     Қарыз:   rich-text мәтінінде «Ставка вознаграждения … (ГЭСВ …)».
 * ================================================================== */

const EU_API = 'https://eubank.kz/api/pages?where%5Bslug%5D%5Bequals%5D=';

const EU_DEPOSITS = [
  { slug: 'turbo-deposit-cumulative', name: 'TURBO Deposit Накопительный', currencies: ['KZT'] },
  { slug: 'eurasian-flex', name: 'Eurasian Flex', currencies: ['KZT'] },
  { slug: 'turbo-deposit-express', name: 'Turbo Deposit', currencies: ['KZT', 'USD', 'EUR', 'RUB'] },
];

const EU_LOANS = [
  { slug: 'unsecured_cash_loan', type: 'Беззалоговый кредит наличными' },
  { slug: 'loan-for-loyal-customers', type: 'Кредит для лояльных клиентов' },
  { slug: 'loan-for-new-car', type: 'Автокредит' },
  { slug: 'mortgage-7-20-25', type: 'Ипотека', name: 'Ипотека «7-20-25»' },
];

/** KZT валюта блоктарындағы ең жоғары номиналдық ставка. */
function euDepositTerms(node, out = []) {
  if (Array.isArray(node)) {
    for (const n of node) euDepositTerms(n, out);
    return out;
  }
  if (node && typeof node === 'object') {
    if (node.currencyCode === 'KZT' && Array.isArray(node.terms)) {
      for (const t of node.terms) {
        const rate = toNum(t && t.annualRate);
        const gesv = toNum(t && t.effectiveRate);
        const term = toNum(t && t.monthTerm);
        if (rate !== null) out.push({ rate, gesv, term });
      }
    }
    for (const v of Object.values(node)) euDepositTerms(v, out);
  }
  return out;
}

async function eurasian() {
  const dep = collector('deposit');
  const loan = collector('loan');

  const all = [...EU_DEPOSITS, ...EU_LOANS];
  const got = {};
  // eubank бір беттің JSON-ы 100–250 КБ: қатарынан (параллель емес) сұраймыз,
  // әйтпесе 8 сек timeout-қа тіреледі.
  for (const p of all) {
    try {
      got[p.slug] = { slug: p.slug, json: await getJson(EU_API + encodeURIComponent(p.slug) + '&depth=1') };
    } catch (e) {
      got[p.slug] = { slug: p.slug, error: String(e && e.message) };
    }
  }

  for (const p of EU_DEPOSITS) {
    const url = `https://eubank.kz/ru/${p.slug}`;
    const g = got[p.slug];
    if (!g || g.error) {
      dep.dropped.push({ product: p.name, reason: `API: ${g && g.error}` });
      continue;
    }
    const doc = (g.json && g.json.docs && g.json.docs[0]) || null;
    if (!doc) {
      dep.dropped.push({ product: p.name, reason: 'API: docs бос' });
      continue;
    }
    const terms = euDepositTerms(doc).filter((t) => isSane('deposit', t.rate, t.gesv));
    terms.sort((a, b) => b.rate - a.rate || (b.gesv || 0) - (a.gesv || 0));
    const best = terms[0] || null;
    dep.add(
      {
        name: p.name,
        minTerm: best && best.term ? `${best.term} мес.` : null,
        currencies: p.currencies,
        url,
      },
      best && best.rate,
      best && best.gesv
    );
  }

  for (const p of EU_LOANS) {
    const url = `https://eubank.kz/ru/${p.slug}`;
    const g = got[p.slug];
    if (!g || g.error) {
      loan.dropped.push({ product: p.name || p.type, reason: `API: ${g && g.error}` });
      continue;
    }
    const doc = (g.json && g.json.docs && g.json.docs[0]) || null;
    if (!doc) {
      loan.dropped.push({ product: p.name || p.type, reason: 'API: docs бос' });
      continue;
    }
    const text = jsonToText(doc);
    const pair = pickPair(text, 'loan');
    loan.add(
      {
        type: p.type,
        name: p.name || p.type,
        maxAmount: grabAmount(text),
        maxTerm: grabTerm(text, 'кредита|займа|кредитования'),
        url,
      },
      pair && pair.rate,
      pair && pair.gesv
    );
  }

  return finish('eurasian', dep, loan);
}

/* ------------------------------------------------------------------ */

export const FETCHERS = { bcc, alatau, forte, eurasian };
export default FETCHERS;
