// Otbasy bank (ҚТЖБ / hcsbk.kz) housing programs fetcher.
//
// Re-reads the rate-related fields of each housing program straight from the
// official pages of hcsbk.kz, in both languages (Kazakh: /<path>/, Russian:
// /ru/<path>/). Plain ES module: only fetch / AbortSignal.timeout / RegExp /
// JSON — runs as-is inside a Cloudflare Worker cron handler.
//
// robots.txt of hcsbk.kz (checked 2026-10-01) disallows for '*' only
// /bitrix/, /ru/feedback/bpm/, *faq/?, *.pdf, *.xlsx and a list of query
// parameters (print=, action=, auth=, utm_source=, bxajaxid=, ...). None of
// the program pages below is disallowed; we never append query parameters.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

const TIMEOUT_MS = 8000;
const CONCURRENCY = 3;
const MAX_LEN = 200;
const MIN_PROGRAMS = 5;

// id -> path on hcsbk.kz (Kazakh path; Russian page is the same with /ru prefix)
export const OTBASY_PATHS = {
  nauryz: '/to-get-a-loan/nauryz/',
  'nauryz-zhumysker': '/to-get-a-loan/nauryz-zhumysker/',
  'nauryz-askeri': '/to-get-a-loan/nauryz-askeri/',
  otau: '/to-get-a-loan/otau/',
  'turgyn-uy-zaemy': '/most-important/zhilzaim/',
  'aralyk-zaem': '/most-important/promzaim/',
  'aldyn-ala-zaem': '/most-important/predzaim/',
  'zhas-otbasy': '/save/young-family/',
  'oz-uyim': '/to-get-a-loan/your-home/',
  'askeri-baspana': '/to-get-a-loan/military-product/',
  umai: '/to-get-a-loan/umai-asian-bank/',
  'zhasyl-ipoteka': '/zelenaya-ipoteka/',
  'asyl-meken': '/to-get-a-loan/asyl-meken/',
  'zhas-galymdar': '/affordable-housing/programma-dlya-molodykh-uchenykh/',
  'bakytty-otbasy-2-10-20': '/affordable-housing/bakytty-otbasy/',
  'mgp-5-10-20': '/affordable-housing/concept-5-10-20/',
  'diplommen-auylga': '/affordable-housing/s-diplomom-v-selo/',
  refinancing: '/to-get-a-loan/helpful-information/mortgage-refinancing/',
};

const FIELDS = ['rate', 'gesv', 'downPayment', 'maxTerm', 'maxAmount'];

// NB: JavaScript \w and \b are ASCII-only, so Cyrillic word endings and word
// boundaries have to be spelled out. L = any Cyrillic/Kazakh letter.
const L = 'а-яёәғқңөұүһі';
const W = `[${L}]*`; // word tail (ставк|а, вознаграждени|я, ...)
const B = `(?![${L}])`; // end-of-word boundary

const lbl = (src) => new RegExp(src + B, 'i');

// Label anchors, most specific first. Extraction is always anchored to one of
// these labels as printed on the page — never to a position in the document.
const LABELS = {
  ru: {
    rate: [
      lbl(`Ставка${W}\\s+вознаграждени${W}(?:\\s+по\\s+(?:займу|кредиту))?`),
      lbl(`Вознаграждение\\s+по\\s+займу`),
      lbl(`Ставка\\s+по\\s+(?:займу|кредиту|продукту)`),
      lbl(`Годова${W}\\s+ставк${W}`),
      lbl(`Ставка\\s+в\\s+год`),
      lbl(`Процентн${W}\\s+ставк${W}`),
    ],
    gesv: [/ГЭСВ/],
    downPayment: [
      lbl(`Первоначальн${W}\\s+взнос${W}`),
      lbl(`Размер\\s+первоначального\\s+взноса`),
      lbl(`Перв${W}\\s+взнос${W}`),
    ],
    maxTerm: [
      lbl(`Общий\\s+срок\\s+кредитовани${W}`),
      lbl(`Максимальн${W}\\s+срок\\s+(?:займа|кредита|кредитовани${W})`),
      lbl(`Срок\\s+кредитовани${W}`),
      lbl(`Срок\\s+(?:займа|кредита)`),
      lbl(`Срок\\s+финансировани${W}`),
    ],
    maxAmount: [
      lbl(`Максимальн${W}\\s+совокупн${W}\\s+сумм${W}(?:\\s+на\\s+одного\\s+заемщика)?`),
      lbl(`Максимальн${W}\\s+сумм${W}\\s+(?:займа|кредита)`),
      lbl(`Сумма\\s+(?:займа|кредита|финансировани${W})`),
      lbl(`Размер\\s+займа`),
    ],
  },
  kk: {
    rate: [
      lbl(`сыйақы\\s+мөлшерлемес${W}`),
      lbl(`(?:Қарыз|Заем|Несие)\\s+бойынша\\s+(?:жылдық\\s+)?мөлшерлеме${W}`),
      lbl(`(?:Жылдық|Пайыздық|Төменгі\\s+пайыздық)\\s+мөлшерлеме${W}`),
      lbl(`мөлшерлемес${W}`),
      lbl(`мөлшерлеме${W}`), // last resort: bare «Мөлшерлеме» heading
    ],
    gesv: [/ЖТСМ/],
    downPayment: [
      lbl(`(?:Алғашқы|Бастапқы)\\s+жарна\\s+сомас${W}`),
      lbl(`(?:Алғашқы|Бастапқы|Бірінші)\\s+жарна${W}`),
    ],
    maxTerm: [
      lbl(`Несиелеу\\s+мерзім${W}`),
      lbl(`(?:Заемның|Қарыздың)\\s+ең\\s+(?:жоғары|ұзақ)\\s+мерзім${W}`),
      lbl(`(?:Заем|Қарыз|Несие)\\s+мерзім${W}`),
      lbl(`Қаржыландыру\\s+мерзім${W}`),
    ],
    maxAmount: [
      lbl(`(?:Заемның|Қарыздың)\\s+ең\\s+жоғары\\s+сомас${W}`),
      lbl(`Ең\\s+жоғары\\s+(?:заем\\s+)?сома${W}`),
      lbl(`(?:Заем|Қарыз|Несие)\\s+сомас${W}`),
    ],
  },
};

// Every label of every field except ГЭСВ/ЖТСМ (which the bank prints *inside*
// the rate sentence) — used to stop a value from running into the next label,
// so one field can never swallow another field's text.
const ANY_LABEL = {
  ru: new RegExp(
    `(?:Ставка${W}\\s+вознаграждени|Первоначальн${W}\\s+взнос|Срок\\s+(?:займа|кредит)|Сумма\\s+займа|Максимальн${W}\\s+сумм|Целевое\\s+назначение|Требовани${W})`,
    'i'
  ),
  kk: new RegExp(
    `(?:сыйақы\\s+мөлшерлемес|(?:Алғашқы|Бастапқы)\\s+жарна|(?:Заем|Қарыз|Несие)\\s+мерзім|Несиелеу\\s+мерзім|(?:Заем|Қарыз)\\s+сомас|Нысаналы\\s+мақсат|Талап${W})`,
    'i'
  ),
};

// Loan calculators on these pages print bare slider captions such as
// «Срок займа, мес:» 36 мес 120 мес — a label with no real product value.
const CALC_LABEL = /,\s*(?:мес|ай|жыл|тг|теңге|тенге)\s*:?\s*$|^\s*[^\d]{0,30}%\s*$/i;
const CALC_VALUE = /^\s*\d+\s*(?:мес|ай)\b[\s\S]{0,12}\d+\s*(?:мес|ай)\s*$/i;

/* ------------------------------ html -> text ------------------------------ */

const ENTITIES = {
  nbsp: ' ', laquo: '«', raquo: '»', amp: '&', quot: '"', apos: "'",
  lt: '<', gt: '>', ndash: '–', mdash: '—', deg: '°', hellip: '…', rsquo: '’',
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : ' '));
}

// Cut the page down to its own content area, so that header, navigation,
// calculator widgets below the article, footer and modal windows cannot
// contribute values.
function mainRegion(html) {
  let h = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|select|option)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // Loan calculators sit inside the content area and print their own slider
  // captions («Максимальная сумма займа 10 000 000 теңге» = slider maximum,
  // not the product limit). Drop them, inputs included.
  h = h
    .replace(/<input\b[^>]*>/gi, ' ')
    .replace(
      /<(p|span|label|div)\b[^>]*class="[^"]*(?:range_label|slider|calc)[^"]*"[^>]*>[\s\S]{0,400}?<\/\1>/gi,
      ' '
    );
  const start = h.search(/class="[^"]*\bmain_content\b/);
  if (start >= 0) h = h.slice(start);
  const end = h.search(/<footer\b|id="footer"|class="[^"]*\bmain-widget\b/);
  if (end > 500) h = h.slice(0, end);
  return h;
}

// Split into leaf text segments. Block tags and <br> become segment borders,
// so a label and its value stay together only when the page itself puts them
// in one block (the Kazakh pages do, the Russian ones often do not).
function segments(html) {
  const out = [];
  const parts = html
    .replace(/<br\s*\/?>/gi, '\u0001')
    // inline tags must not break words apart (<strong>Первоначал</strong>ьный)
    .replace(/<\/?(?:b|strong|em|i|u|span|a|sup|sub|small|font|nobr|mark)\b[^>]*>/gi, '')
    .split(/<\/?(?:div|p|li|td|th|tr|h[1-6]|section|article|ul|ol|table|dl|dt|dd|figure|header|nav|form|label|button)\b[^>]*>/i);
  for (const raw of parts) {
    const text = decodeEntities(raw.replace(/<[^>]*>/g, ' '))
      .replace(/\u0001/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 2) out.push(text);
  }
  return out;
}

/* ------------------------------ validation ------------------------------- */

const NUM = /(\d{1,3}(?:[.,]\d+)?)\s*%/g;

function hasPlausibleRate(s) {
  NUM.lastIndex = 0;
  let m;
  while ((m = NUM.exec(s))) {
    const v = Number(m[1].replace(',', '.'));
    if (v >= 0 && v <= 30) return true;
  }
  return false;
}

const VALIDATORS = {
  rate: hasPlausibleRate,
  gesv: (s) => /ГЭСВ|ЖТСМ/.test(s) && hasPlausibleRate(s),
  // an initial payment is a share of the loan/contract sum, so it carries a %
  // or a sum; a sentence that talks about the rate is not a down payment.
  downPayment: (s) =>
    /\d/.test(s) &&
    (/%/.test(s) || /(?:теңге|тг|₸|МРП|АЕК)/i.test(s)) &&
    !/(?:мөлшерлеме|ставк|ГЭСВ|ЖТСМ)/i.test(s),
  // a term must carry a time unit, not just any number
  maxTerm: (s) => /\d/.test(s) && /(?:лет|года?|год|месяц|мес\b|жыл|ай\b)/i.test(s),
  // an amount must carry a currency / index unit and a non-zero figure; a bare
  // percentage ("заем сомасының 50%-ын...") is never an amount
  maxAmount: (s) =>
    /(?:теңге|тенге|тг\b|₸|млн|млрд|МРП|АЕК)/i.test(s) &&
    /(?:[1-9]\d*|\d+[.,]\d*[1-9])/.test(s.replace(/\d+\s*%/g, '')),
};

// Keep whole clauses while staying inside MAX_LEN; a single clause longer than
// MAX_LEN is rejected (returns null) rather than cut mid-sentence.
function shorten(s) {
  const v = s.replace(/^[\s:;—–-]+/, '').replace(/\s+/g, ' ').trim();
  if (!v || v.length < 3) return null;
  if (v.length <= MAX_LEN) return v;
  const clauses = v.split(/(?<=[;•])\s*|\s*•\s*/).filter(Boolean);
  let acc = '';
  for (const c of clauses) {
    if (!acc) {
      if (c.length > MAX_LEN - 2) return null;
      acc = c;
    } else if ((acc + ' ' + c).length <= MAX_LEN - 2) {
      acc += ' ' + c;
    } else break;
  }
  if (!acc) return null;
  return acc.replace(/[;\s]+$/, '') + ' …';
}

/* ------------------------------ extraction ------------------------------- */

function valueAfterLabel(segs, i, label, lang) {
  const seg = segs[i];
  const m = label.exec(seg);
  label.lastIndex = 0;
  if (!m) return null;
  if (CALC_LABEL.test(seg)) return null; // calculator slider caption
  let tail = seg.slice(m.index + m[0].length);

  if (/\d/.test(tail)) {
    // value is inline: stop it before the next label in the same block
    const rest = tail.replace(/^[\s:;—–-]+/, '');
    const nxt = ANY_LABEL[lang].exec(rest);
    if (nxt && nxt.index > 0 && /\d/.test(rest.slice(0, nxt.index))) {
      tail = rest.slice(0, nxt.index);
    }
    return tail;
  }

  // the label occupies its own block -> the value is in the following blocks
  tail = tail.trim();
  for (let j = i + 1; j < Math.min(i + 3, segs.length); j++) {
    const next = segs[j];
    if (CALC_VALUE.test(next)) return null;
    if (ANY_LABEL[lang].test(next) && !/\d/.test(next)) break; // next label
    tail = (tail ? tail + ' ' : '') + next;
    if (/\d/.test(next)) break;
  }
  return /\d/.test(tail) ? tail : null;
}

function extractField(segs, lang, field) {
  for (const label of LABELS[lang][field]) {
    for (let i = 0; i < segs.length; i++) {
      if (!label.test(segs[i])) continue;
      const raw = valueAfterLabel(segs, i, label, lang);
      if (!raw) continue;
      const v = shorten(raw);
      if (v && !CALC_VALUE.test(v) && VALIDATORS[field](v)) return v;
    }
  }
  return null;
}

// ГЭСВ / ЖТСМ is almost never a field of its own: it is printed inside the
// rate sentence. Collect the fragments that mention it, anchored to the word.
function extractGesv(segs, lang) {
  const word = lang === 'kk' ? 'ЖТСМ' : 'ГЭСВ';
  const found = [];
  for (const seg of segs) {
    if (!seg.includes(word)) continue;
    if (/калькулятор/i.test(seg)) continue;
    const re = new RegExp(word + '[^;•\\)\\n]{0,90}', 'g');
    let m;
    while ((m = re.exec(seg))) {
      const frag = m[0].replace(/[\s,.:–-]+$/, '').trim();
      if (hasPlausibleRate(frag) && !found.includes(frag)) found.push(frag);
      if (found.length >= 3) break;
    }
    if (found.length >= 3) break;
  }
  if (!found.length) return null;
  let joined = found.join('; ');
  if (joined.length > MAX_LEN) joined = found.slice(0, 2).join('; ');
  if (joined.length > MAX_LEN) joined = found[0];
  return joined.length <= MAX_LEN ? joined : null;
}

export function parseProgramPage(html, lang) {
  const segs = segments(mainRegion(html));
  const out = {};
  for (const f of FIELDS) out[f] = f === 'gesv' ? extractGesv(segs, lang) : extractField(segs, lang, f);
  return out;
}

/* -------------------------------- fetching -------------------------------- */

async function getPage(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'ru,kk;q=0.9,en;q=0.5',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return res.text();
}

async function pool(items, limit, worker) {
  const results = [];
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await worker(items[i]);
      } catch (e) {
        results[i] = { id: items[i][0], error: String(e && e.message || e) };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

const BASE = 'https://hcsbk.kz';
const urlFor = (lang, path) => BASE + (lang === 'ru' ? '/ru' : '') + path;

export async function fetchOtbasy() {
  const out = { kk: {}, ru: {} };
  const entries = Object.entries(OTBASY_PATHS);

  const rows = await pool(entries, CONCURRENCY, async ([id, path]) => {
    const row = { id, kk: null, ru: null, errors: [] };
    for (const lang of ['kk', 'ru']) {
      try {
        const html = await getPage(urlFor(lang, path));
        const data = parseProgramPage(html, lang);
        // a program where nothing could be extracted is skipped
        if (FIELDS.some((f) => data[f] !== null)) row[lang] = data;
        else row.errors.push(lang + ': nothing extracted');
      } catch (e) {
        row.errors.push(lang + ': ' + String(e && e.message || e));
      }
    }
    return row;
  });

  let ok = 0;
  for (const row of rows) {
    if (!row || row.error) continue;
    if (row.kk) out.kk[row.id] = row.kk;
    if (row.ru) out.ru[row.id] = row.ru;
    if (row.kk || row.ru) ok++;
  }

  if (ok < MIN_PROGRAMS) {
    throw new Error('otbasy: only ' + ok + ' of ' + entries.length + ' programs could be read');
  }
  return out;
}

export default fetchOtbasy;
