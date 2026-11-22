// Автоматты фетчерлер: halyk, bereke, freedom, kaspi.
// Шикі пішім (нормализацияны src/normalize.js жасайды):
//   deposits: [{ name, rate, gesv, minTerm, currencies, url }]
//   loans:    [{ type, name, rateFrom, gesvFrom, maxAmount, maxTerm, url }]
// Тек fetch / AbortSignal.timeout / JSON / RegExp. Сыртқы тәуелділік жоқ, DOM жоқ.
//
// robots.txt (21.09–01.10.2026 тексерілді):
//   halykbank.kz  — "User-agent: *  Allow: /", бірақ /*.pdf, /*httpMethod, /kz/*, /en/* жабық.
//                   Сол себепті тек орысша (/) HTML беттер оқылады, PDF мен October CMS
//                   AJAX (httpMethod) эндпоинттері пайдаланылмайды.
//   berekebank.kz — /robots.txt → /ru/robots.txt: "User-agent: *  Allow: /".
//   bankffin.kz   — "User-agent: *  Allow: /". auto./cash-loans. қосалқы домендерінде
//                   robots.txt жоқ (яғни шектеу жоқ).
//   kaspi.kz      — "Disallow: /bank/ , /search/ , /shop/cart/ ..." — біз оқитын
//                   /deposit, /savedeposit, /cashkredit, /purchase, /installment,
//                   /kaspired бұл тізімге кірмейді. guide.kaspi.kz/robots.txt — бос.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const TIMEOUT_MS = 8000;

async function get(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "ru,kk;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

// Бір рет қайталап көреді: банк сайттары қатар сұрауларда жиі timeout береді.
async function getRetry(url) {
  try {
    return await get(url);
  } catch (e) {
    return get(url);
  }
}

// Қатар сұраулардың саны шектеледі — әйтпесе 8 с timeout-қа жиі тіреледі.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

const CONCURRENCY = 3;

// Бетті алады; сәтсіз болса null (бір өнім түсіп қалады, бүкіл банк құламайды).
const page = (url) => getRetry(url).catch(() => null);

// ——— мәтінге айналдыру ———————————————————————————————————————————————

const ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', laquo: "«", raquo: "»", mdash: "—", ndash: "–" };

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, c) => String.fromCodePoint(parseInt(c, 16)))
    .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(Number(c)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => (n in ENTITIES ? ENTITIES[n] : m));
}

function dropNoise(html) {
  return html.replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1>/gi, " ");
}

// Тегтерді бос орынға айналдырады — бір сөйлемнің ішіндегі <br>/<span> бөлінбейді.
function flat(html) {
  return decodeEntities(dropNoise(html).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

// Тегтерді жол ауысымына айналдырады — «белгі / мәні» жұптарын іздеуге керек.
function lines(html) {
  return decodeEntities(dropNoise(html).replace(/<[^>]*>/g, "\n"))
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// Тег ішіндегі мәтінді біріктіреді (<strong>B</strong>ereke… → «Bereke…»).
function inline(html) {
  return decodeEntities(dropNoise(html).replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

const num = (s) => {
  if (s == null) return null;
  const n = Number(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// «Белгі» жолынан кейінгі, саны бар бірінші жолды қайтарады.
function labelValue(ls, labels) {
  for (const label of labels) {
    const i = ls.findIndex((l) => l.replace(/[*:\s]+$/, "") === label || l === label);
    if (i < 0) continue;
    for (let j = i + 1; j < Math.min(i + 4, ls.length); j++) {
      if (/\d/.test(ls[j]) && !/^\*/.test(ls[j])) return ls[j];
    }
  }
  return null;
}

// «от 21% до 25% (ГЭСВ от 23,2% до 32,2%)», «7% (ГЭСВ от 7,24% по 7,80%)»,
// «3 месяца - 16,67% (ГЭСВ*- 18,01%)» — номиналдық + ГЭСВ жұбы.
const RATE_GESV_PAIR =
  /(?:от\s*)?(\d{1,2}(?:[.,]\d{1,2})?)\s*%(?:[^%(]{0,60}?до\s*\d{1,2}(?:[.,]\d{1,2})?\s*%)?[^%(\n]{0,40}?\(\s*ГЭСВ[^\d%]{0,24}(\d{1,2}(?:[.,]\d{1,2})?)\s*%/g;

function pairs(text) {
  RATE_GESV_PAIR.lastIndex = 0;
  const out = [];
  let m;
  while ((m = RATE_GESV_PAIR.exec(text))) {
    const rate = num(m[1]);
    const gesv = num(m[2]);
    if (rate != null && gesv != null) out.push({ rate, gesv, at: m.index });
  }
  return out;
}

// Ең арзан ұсыныс («-дан»): ең кіші номиналдық ставка және сол жұптың ГЭСВ-і.
function cheapestPair(text) {
  const all = pairs(text);
  if (!all.length) return null;
  return all.reduce((a, b) => (b.rate < a.rate ? b : a));
}

// «до 8 000 000 ₸», «До 70 млн ₸», «до 30 000 000 теңге»
function maxAmountText(text) {
  const m = text.match(/\b[Дд]о\s+(\d[\d\s]{2,}|\d{1,4}(?:[.,]\d+)?\s*млн\.?)\s*(₸|теңге|тенге)/);
  return m ? `до ${m[1].replace(/\s+/g, " ").trim()} ₸` : null;
}

// «до 5 лет», «до 120 месяцев», «от 2 до 7 лет»
function maxTermText(text) {
  const m = text.match(/\b[Дд]о\s+(\d{1,3})\s*(лет|года|год|месяц\w*|мес\.?)/);
  return m ? `до ${m[1]} ${m[2]}` : null;
}

// Тым ұзын мәтінді бірінші мәнмен шектеу («30 000 000 теңге – для городов…»).
function firstClause(s) {
  if (!s) return null;
  const t = s.split(/\s+[–—]\s+|,\s|\s\(/)[0].trim();
  return t.length ? t.slice(0, 60) : null;
}

// ——— тексеру (валидация) —————————————————————————————————————————————

const DEP_RATE = [0, 30];
const DEP_GESV = [0, 35];
const LOAN_RATE = [0, 60];
const LOAN_GESV = [0, 60];

const inRange = (v, [lo, hi]) => v == null || (Number.isFinite(v) && v >= lo && v <= hi);

function validDeposit(p) {
  if (!p.name) return false;
  if (!inRange(p.rate, DEP_RATE) || !inRange(p.gesv, DEP_GESV)) return false;
  // Екеуі де белгісіз болса — өнімнің мәні жоқ.
  if (p.rate == null && p.gesv == null) return false;
  // Капитализациямен ГЭСВ номиналдық ставкадан кем болмайды.
  if (p.rate != null && p.gesv != null && p.gesv + 0.01 < p.rate) return false;
  return true;
}

function validLoan(p) {
  if (!p.type) return false;
  if (!inRange(p.rateFrom, LOAN_RATE) || !inRange(p.gesvFrom, LOAN_GESV)) return false;
  // Несиеде ГЭСВ ставкадан кем болмайды (комиссиялар қосылады).
  if (p.rateFrom != null && p.gesvFrom != null && p.gesvFrom + 0.01 < p.rateFrom) return false;
  return true;
}

// Тексеруден өтпегенді ЛАҚТЫРАДЫ (қайтармайды) және санап, журналға жазады.
function sieve(bank, deposits, loans) {
  const okD = deposits.filter(validDeposit);
  const okL = loans.filter(validLoan);
  const dropped = deposits.length - okD.length + (loans.length - okL.length);
  if (dropped) {
    const bad = [
      ...deposits.filter((p) => !validDeposit(p)),
      ...loans.filter((p) => !validLoan(p)),
    ].map((p) => p.name || p.type);
    console.warn(`[banks-a] ${bank}: тексеруден өтпеген ${dropped} өнім лақтырылды: ${bad.join(", ")}`);
  }
  if (!okD.length && !okL.length) throw new Error(`[banks-a] ${bank}: жарамды өнім табылмады`);
  return { deposits: okD, loans: okL, dropped };
}

// ══════════════════════════════════════════════════════════════════════
// HALYK BANK — halykbank.kz
// Депозиттер: /deposit/srochnye-vklady бетіндегі Alpine.js калькуляторының
// x-data="depositCalcNew({ storage: [...] })" деректері — банктің өзі
// қолданатын машинамен оқылатын дереккөз (nominal_rate / effective_rate).
// Мөлшерлемелер PDF-те де бар, бірақ robots.txt /*.pdf жабады.
// Несиелер: HTML беттердегі «от X% до Y% (ГЭСВ от A% до B%)» мәтіні.
// ══════════════════════════════════════════════════════════════════════

const HALYK_LOANS = [
  { type: "Кредит без залога", url: "https://halykbank.kz/credit/bez-zaloga", amount: ["Максимальная сумма рефинансируемого займа"], term: ["Максимальный срок"] },
  { type: "Рефинансирование", url: "https://halykbank.kz/credit/refinans", amount: ["Максимальная сумма рефинансируемого займа"], term: ["Максимальный срок"] },
  { type: "Кредит под залог недвижимости", url: "https://halykbank.kz/credit/na-neotlozhnye-nuzhdy", amount: [], term: ["Срок", "Срок*"] },
  { type: "Автокредит", url: "https://halykbank.kz/credit/v-salonah-partnerah", amount: [], term: ["Максимальный срок кредитования"] },
  { type: "Автокредит льготный (БРК)", url: "https://halykbank.kz/credits/avtocredit", amount: [], term: ["Срок кредитования", "Максимальный срок"] },
  { type: "Ипотека", url: "https://halykbank.kz/credit/cifrovaya-ipoteka", amount: ["Максимальная сумма займа"], term: ["Максимальный срок"] },
  { type: "Ипотека «7-20-25»", url: "https://halykbank.kz/credit/7-20-25-new", amount: ["Максимальная стоимость жилья"], term: ["Срок займа"] },
];

function halykDeposits(html) {
  const m = html.match(/x-data="depositCalcNew\(\{[\s\S]*?\}\)"/);
  if (!m) throw new Error("halyk: depositCalcNew storage табылмады");
  const data = decodeEntities(m[0]);
  const url = "https://halykbank.kz/deposit/srochnye-vklady";

  // Өнімдер «{ id: N, name: "…"» шекарасымен бөлінеді.
  const chunks = data.split(/\{\s*id:\s*\d+\s*,\s*name:\s*/).slice(1);
  const out = [];
  for (const chunk of chunks) {
    const nameM = chunk.match(/^"([^"]*)"/);
    if (!nameM) continue;
    const name = nameM[1].trim();

    const currencies = [...chunk.matchAll(/name:\s*"([A-Z]{3})"\s*,\s*months:/g)].map((x) => x[1]);
    // Теңгедегі (KZT) ең жоғары номиналдық ставка — сайтта көрсетілетін басты сан.
    const kzt = chunk.match(/name:\s*"KZT"\s*,\s*months:\s*\[([\s\S]*?)\]/);
    if (!kzt) continue;
    const months = [...kzt[1].matchAll(
      /nominal_rate:\s*([\d.]+)\s*,\s*effective_rate:\s*([\d.]+)[^}]*?month:\s*(\d+)/g
    )].map((x) => ({ rate: num(x[1]), gesv: num(x[2]), month: Number(x[3]) }));
    if (!months.length) continue;

    const best = months.reduce((a, b) => (b.rate > a.rate ? b : a));
    const minMonth = months.reduce((a, b) => (b.month < a.month ? b : a)).month;
    out.push({
      name,
      rate: best.rate,
      gesv: best.gesv,
      minTerm: `от ${minMonth} мес.`,
      currencies: currencies.length ? currencies : null,
      url,
    });
  }
  if (!out.length) throw new Error("halyk: storage ішінен депозит шықпады");
  return out;
}

function halykAqyl(html) {
  const text = flat(html);
  // «36 мес. – 14,3% (ГЭСВ 15,5%)»
  const rows = [...text.matchAll(
    /(\d{1,3})\s*мес\.?\s*[–—-]\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*\(\s*ГЭСВ\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/g
  )].map((m) => ({ month: Number(m[1]), rate: num(m[2]), gesv: num(m[3]) }));
  if (!rows.length) return null;
  const best = rows.reduce((a, b) => (b.rate > a.rate ? b : a));
  const minMonth = rows.reduce((a, b) => (b.month < a.month ? b : a)).month;
  return {
    name: "Образовательный вклад AQYL",
    rate: best.rate,
    gesv: best.gesv,
    minTerm: `от ${minMonth} мес.`,
    currencies: ["KZT"],
    url: "https://halykbank.kz/deposit/obrazovatelnyj",
  };
}

// Ипотека бетінде ставка мен ГЭСВ екі бөлек блокта — жұп регексі жұмыс етпейді.
// Келесі «белгі» сөзі басталған жерде тізім бітеді (әйтпесе «не менее 20% от
// стоимости жилья» деген бастапқы жарна ГЭСВ ретінде алынып кетеді).
const NEXT_LABEL = /Максимальн|Комисси|Первоначальн|Обеспечени|Страхован|Срок|Цель|Сумма/;

function halykSplitBlocks(text) {
  const i = text.search(/Ставка вознаграждения/);
  if (i < 0) return null;
  const j = text.indexOf("ГЭСВ", i);
  if (j < 0) return null;
  const pct = (s) => {
    const cut = s.search(NEXT_LABEL);
    const part = cut > 0 ? s.slice(0, cut) : s;
    return [...part.matchAll(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/g)].map((m) => num(m[1])).filter((v) => v != null && v > 1);
  };
  const rates = pct(text.slice(i + 22, j));
  const gesvs = pct(text.slice(j + 4, j + 200));
  if (!rates.length || !gesvs.length) return null;
  return { rate: Math.min(...rates), gesv: Math.min(...gesvs) };
}

async function halyk() {
  const [vkladyHtml, aqylHtml] = await Promise.all([
    get("https://halykbank.kz/deposit/srochnye-vklady"),
    get("https://halykbank.kz/deposit/obrazovatelnyj"),
  ]);

  const deposits = halykDeposits(vkladyHtml);
  const aqyl = halykAqyl(aqylHtml);
  if (aqyl) deposits.push(aqyl);

  const htmls = await Promise.all(HALYK_LOANS.map((l) => get(l.url).catch(() => null)));
  const loans = [];
  for (let k = 0; k < HALYK_LOANS.length; k++) {
    const spec = HALYK_LOANS[k];
    const html = htmls[k];
    if (!html) continue;
    const text = flat(html);
    const ls = lines(html);
    const p = cheapestPair(text) || halykSplitBlocks(text);
    loans.push({
      type: spec.type,
      name: null,
      rateFrom: p ? p.rate : null,
      gesvFrom: p ? p.gesv : null,
      maxAmount: firstClause(labelValue(ls, spec.amount) || maxAmountText(text)),
      maxTerm: firstClause(labelValue(ls, spec.term)) || maxTermText(text),
      url: spec.url,
    });
  }

  return sieve("halyk", deposits, loans);
}

// ══════════════════════════════════════════════════════════════════════
// BEREKE BANK — berekebank.kz
// Сервер жағында дайындалған HTML кестелер: «Номинальная ставка
// вознаграждения» → <li>3 месяца - 16,67% (ГЭСВ*- 18,01%)</li>.
// XHR/JSON эндпоинті жоқ — кесте тікелей бетте.
// ══════════════════════════════════════════════════════════════════════

const BEREKE_LOANS = [
  { type: "Ипотека", url: "https://berekebank.kz/ru/personal/credits/ipoteka" },
  { type: "Кредит без залога онлайн", url: "https://berekebank.kz/ru/personal/credits/onlinecredit" },
  { type: "Рефинансирование кредитов других банков", url: "https://berekebank.kz/ru/personal/credits/refinansirovanie" },
  { type: "Кредит под залог недвижимости", url: "https://berekebank.kz/ru/personal/credits/zalog_any" },
  { type: "Рефинансирование автокредита", url: "https://berekebank.kz/ru/personal/credits/ref_auto" },
  { type: "Автокредит на новый автомобиль", url: "https://berekebank.kz/ru/personal/credits/new_auto" },
];

function berekeDeposits(html) {
  const url = "https://berekebank.kz/ru/personal/deposits";
  const out = [];
  // Әр өнім rowspan-ды td-дан басталады: онда атауы, одан кейінгі td-лардың
  // бірінде «Номинальная ставка …» блогы тұрады (арасында «Общие условия» болуы мүмкін).
  const segments = html.split(/<td[^>]*\browspan=/i).slice(1);
  for (const seg of segments) {
    const nameEnd = seg.indexOf("</td>");
    const attrEnd = seg.indexOf(">");
    if (nameEnd < 0 || attrEnd < 0 || attrEnd > nameEnd) continue;
    // attrEnd — rowspan="10" … атрибуттарының соңы; атау одан кейін тұрады.
    const name = inline(seg.slice(attrEnd + 1, nameEnd)).replace(/\s*\*+\s*$/, "").trim();
    if (!name || name.length > 120) continue;

    const blockM = seg.match(/<strong>\s*Номинальная ставка[\s\S]*?<\/td>/);
    if (!blockM) continue;
    const block = blockM[0];

    // Бір мерзім = бір жол: «3 месяца - 16,67% (ГЭСВ*- 18,01%)».
    // Жолдар әр өнімде әртүрлі белгіленеді: <li>, <p> немесе тек <br>.
    const rows = [];
    for (const raw of block
      .replace(/<\/(li|p|div)>|<br\s*\/?>/gi, "\n")
      .split("\n")) {
      const t = flat(raw);
      if (!t) continue;
      const p = pairs(t)[0];
      if (!p) continue;
      const mo = t.match(/(\d{1,3})\s*(?:месяц|месяца|месяцев|мес)/);
      rows.push({ ...p, month: mo ? Number(mo[1]) : null });
    }
    if (!rows.length) continue;

    const best = rows.reduce((a, b) => (b.rate > a.rate ? b : a));
    const withMonth = rows.filter((r) => r.month != null);
    const minMonth = withMonth.length ? Math.min(...withMonth.map((r) => r.month)) : null;
    const cur = /валют/i.test(name) ? null : ["KZT"];
    out.push({
      name,
      rate: best.rate,
      gesv: best.gesv,
      minTerm: minMonth != null ? `от ${minMonth} мес.` : null,
      currencies: cur,
      url,
    });
  }
  if (!out.length) throw new Error("bereke: депозит кестесі табылмады");
  return out;
}

async function bereke() {
  const depHtml = await get("https://berekebank.kz/ru/personal/deposits");
  const deposits = berekeDeposits(depHtml);

  const htmls = await Promise.all(BEREKE_LOANS.map((l) => get(l.url).catch(() => null)));
  const loans = [];
  for (let k = 0; k < BEREKE_LOANS.length; k++) {
    const spec = BEREKE_LOANS[k];
    const html = htmls[k];
    if (!html) continue;
    const text = flat(html);
    const p = cheapestPair(text);
    // Bereke карточкаларында мәні белгіден БҰРЫН тұрады, сондықтан labelValue
    // жарамсыз — сома мен мерзімді мәтіннен тікелей өрнекпен аламыз.
    loans.push({
      type: spec.type,
      name: null,
      rateFrom: p ? p.rate : null,
      gesvFrom: p ? p.gesv : null,
      maxAmount: maxAmountText(text),
      maxTerm: maxTermText(text),
      url: spec.url,
    });
  }

  return sieve("bereke", deposits, loans);
}

// ══════════════════════════════════════════════════════════════════════
// FREEDOM BANK — bankffin.kz
// Депозиттер: өнім бетіндегі «Условия» кестесі. Жолдар —
//   <th>Номинальная ставка</th><td data-currency=0>…<p>16.99% <span>1 мес.</span></p>
//   <th>Годовая эффективная ставка</th><td data-currency=0>…
// Бірінші <td> — әрқашан data-currency=0, яғни KZT.
// Несиелер: cash-loans./auto. қосалқы домендеріндегі Next.js беттері —
// мәтіні сервер жағында дайындалған, көрінетін белгілерге байланады.
// ══════════════════════════════════════════════════════════════════════

const FREEDOM_DEPOSITS = [
  { name: "Депозит «Стратегия»", slug: "strategy" },
  { name: "Депозит «Капитал»", slug: "capital" },
  { name: "Депозит «Копилка»", slug: "moneybox" },
  { name: "До востребования", slug: "demand" },
];

function ffRow(html, label) {
  const re = new RegExp(`<th[^>]*>\\s*${label}\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`, "i");
  const m = html.match(re);
  return m ? m[1] : null;
}

function ffCells(block) {
  if (!block) return [];
  const out = [];
  for (const p of block.match(/<p[^>]*>[\s\S]*?<\/p>/g) || []) {
    const t = flat(p);
    const v = t.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
    if (!v) continue;
    const mo = t.match(/(\d{1,3})\s*мес/);
    out.push({ value: num(v[1]), month: mo ? Number(mo[1]) : null });
  }
  return out;
}

function freedomDeposit(html, spec) {
  const url = `https://bankffin.kz/ru/deposits/physical/${spec.slug}`;
  const nom = ffCells(ffRow(html, "Номинальная ставка"));
  const eff = ffCells(ffRow(html, "Годовая эффективная ставка"));
  if (!nom.length && !eff.length) return null;

  const best = nom.length ? nom.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  // ГЭСВ сол мерзімнен алынады; мерзім белгісіз болса — ең жоғарысы.
  let gesv = null;
  if (eff.length) {
    const same = best && best.month != null ? eff.find((e) => e.month === best.month) : null;
    gesv = same ? same.value : eff.reduce((a, b) => (b.value > a.value ? b : a)).value;
  }

  const months = [...nom, ...eff].map((c) => c.month).filter((v) => v != null);
  const bodyText = flat(html);
  const curM = bodyText.match(/Валюта\s+((?:KZT|USD|EUR|RUB|CNY|TRY|AED)(?:\s+(?:KZT|USD|EUR|RUB|CNY|TRY|AED))*)/);

  return {
    name: spec.name,
    rate: best ? best.value : null,
    gesv,
    minTerm: months.length ? `от ${Math.min(...months)} мес.` : spec.slug === "demand" ? "бессрочный" : null,
    currencies: curM ? curM[1].split(/\s+/) : null,
    url,
  };
}

// «Под залог квартиры: … Номинальная ставка — от 21% … ГЭСВ — от 23,2% …»
// Бір бетте «Под залог квартиры» бірнеше рет кездеседі (сома туралы сұрақта да),
// сондықтан екі өрнек те сәйкес келетін бірінші орынды іздейміз.
function ffPledge(text, anchor) {
  let i = -1;
  while ((i = text.indexOf(anchor, i + 1)) >= 0) {
    const win = text.slice(i, i + 400);
    const r = win.match(/Номинальная ставка\s*[—–-]\s*от\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
    const g = win.match(/ГЭСВ\s*[—–-]\s*от\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
    if (r && g) return { rate: num(r[1]), gesv: num(g[1]) };
  }
  return null;
}

// auto.bankffin.kz мөлшерлемелерді тек Next.js payload-ында (script ішінде)
// береді, сондықтан мұнда script алынып тасталмайды, JSON escape-і ашылады.
function ffPayloadText(html) {
  return decodeEntities(html)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, c) => String.fromCodePoint(parseInt(c, 16)))
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"')
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Белгіден кейінгі терезеден ставка/ГЭСВ жұбын алу.
function ffAfter(text, anchor, span = 220) {
  const i = text.indexOf(anchor);
  if (i < 0) return null;
  return pairs(text.slice(i, i + span))[0] || null;
}

async function freedom() {
  const depHtmls = await Promise.all(
    FREEDOM_DEPOSITS.map((s) => get(`https://bankffin.kz/ru/deposits/physical/${s.slug}`).catch(() => null))
  );
  const deposits = [];
  for (let k = 0; k < FREEDOM_DEPOSITS.length; k++) {
    if (!depHtmls[k]) continue;
    const d = freedomDeposit(depHtmls[k], FREEDOM_DEPOSITS[k]);
    if (d) deposits.push(d);
  }
  if (!deposits.length) throw new Error("freedom: депозиттер табылмады");

  const loans = [];
  const [cashHtml, autoHtml] = await Promise.all([
    get("https://cash-loans.bankffin.kz/ru").catch(() => null),
    get("https://auto.bankffin.kz/").catch(() => null),
  ]);

  if (cashHtml) {
    const t = flat(cashHtml);
    const estate = ffPledge(t, "Под залог квартиры");
    const car = ffPledge(t, "Под залог легкового автомобиля");
    if (estate)
      loans.push({
        type: "Кредит под залог недвижимости",
        name: "Денежный кредит под залог квартиры",
        rateFrom: estate.rate,
        gesvFrom: estate.gesv,
        maxAmount: "до 100 000 000 ₸",
        maxTerm: "до 120 мес.",
        url: "https://cash-loans.bankffin.kz/ru",
      });
    if (car)
      loans.push({
        type: "Кредит под залог авто",
        name: "Денежный кредит под залог автомобиля",
        rateFrom: car.rate,
        gesvFrom: car.gesv,
        maxAmount: "до 20 000 000 ₸",
        maxTerm: "до 84 мес.",
        url: "https://cash-loans.bankffin.kz/ru",
      });
  }

  if (autoHtml) {
    const t = ffPayloadText(autoHtml);
    // «В автосалоне — от 0,1% до 31% (ГЭСВ от 1,20% до 35,00%)»
    const salon = ffAfter(t, "В автосалоне");
    const priv = ffAfter(t, "У физических лиц");
    const p = salon && priv ? (salon.rate <= priv.rate ? salon : priv) : salon || priv;
    if (p)
      loans.push({
        type: "Автокредит",
        name: "Цифровой автокредит",
        rateFrom: p.rate,
        gesvFrom: p.gesv,
        maxAmount: null,
        maxTerm: "до 7 лет",
        url: "https://auto.bankffin.kz/",
      });
  }

  // Цифровая ипотека (bankffin.kz/ipoteka/) — толық SPA, HTML-де мөлшерлеме жоқ.
  // Болжам жасамаймыз: өнім мүлде қайтарылмайды.

  return sieve("freedom", deposits, loans);
}

// ══════════════════════════════════════════════════════════════════════
// KASPI BANK — kaspi.kz
// Депозиттер: өнім бетіндегі «Высокая годовая эффективная ставка N% в теңге».
//   Номиналдық ставка сайтта жарияланбайды → rate: null.
// Несиелер: ГЭСВ — guide.kaspi.kz бiлiм базасынан (сұрақ id-сі ауысып
//   кетпеу үшін алдымен категория беті оқылады, сосын тиісті сұрақ беті).
//   kaspi.kz/cashkredit ішіндегі creditSchemes — кезең-кезеңдік (stepped)
//   кесте, бір жылдық номиналдық ставка емес → rateFrom: null.
// ══════════════════════════════════════════════════════════════════════

const KASPI_DEPOSITS = [
  { name: "Kaspi Депозит", url: "https://kaspi.kz/deposit" },
  { name: "Накопительный Депозит", url: "https://kaspi.kz/savedeposit" },
];

function kaspiEffective(html) {
  const t = flat(html);
  const m = t.match(/эффективная\s+ставка\s+(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*в\s+теңге/i);
  return m ? num(m[1]) : null;
}

// Категория бетінен «годовая эффективная ставка» сұрағының id-сін табады.
function kaspiQuestionId(html) {
  const re = /<li[^>]*\bid="(q\d+)"[\s\S]{0,1200}?<\/li>/g;
  let m;
  while ((m = re.exec(html))) {
    if (/годовая эффективная ставка/i.test(flat(m[0]))) return m[1];
  }
  return null;
}

async function kaspiGuideGesv(categoryUrl) {
  const cat = await get(categoryUrl).catch(() => null);
  if (!cat) return null;
  const qid = kaspiQuestionId(cat);
  if (!qid) return null;
  const page = await get(`${categoryUrl}/${qid}`).catch(() => null);
  if (!page) return null;
  const t = flat(page);
  // «… (ГЭСВ) по Кредиту Наличными от Kaspi.kz — 46%.»
  // [^.] қолдануға болмайды: «Kaspi.kz» ішінде нүкте бар.
  const m = t.match(/ГЭСВ\)[^%]{0,160}?[—–-]\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
  return m ? num(m[1]) : null;
}

function kaspiMaxAmount(html) {
  const m = html.match(/class="range-to"[^>]*>([\s\S]*?)<\//);
  return m ? inline(m[1]).replace(/^до\s*/i, "до ") : null;
}

async function kaspi() {
  const depHtmls = await Promise.all(KASPI_DEPOSITS.map((d) => get(d.url).catch(() => null)));
  const deposits = [];
  for (let k = 0; k < KASPI_DEPOSITS.length; k++) {
    const html = depHtmls[k];
    if (!html) continue;
    const gesv = kaspiEffective(html);
    if (gesv == null) continue;
    deposits.push({
      name: KASPI_DEPOSITS[k].name,
      rate: null, // Kaspi номиналдық ставканы сайтта жарияламайды.
      gesv,
      minTerm: null, // Мерзім де жарияланбайды.
      currencies: ["KZT"],
      url: KASPI_DEPOSITS[k].url,
    });
  }

  const [cashHtml, installHtml, redHtml, purchaseHtml, gesvCash, gesvCar] = await Promise.all([
    get("https://kaspi.kz/cashkredit").catch(() => null),
    get("https://kaspi.kz/installment").catch(() => null),
    get("https://kaspi.kz/kaspired").catch(() => null),
    get("https://kaspi.kz/purchase").catch(() => null),
    kaspiGuideGesv("https://guide.kaspi.kz/client/ru/cash_credit/conditions/unsecured"),
    kaspiGuideGesv("https://guide.kaspi.kz/client/ru/cash_credit/conditions/car_secured"),
  ]);

  const loans = [];
  if (cashHtml)
    loans.push({
      type: "Кредит Наличными",
      name: null,
      rateFrom: null,
      gesvFrom: gesvCash,
      maxAmount: kaspiMaxAmount(cashHtml),
      maxTerm: null,
      url: "https://kaspi.kz/cashkredit",
    });
  if (gesvCar != null)
    loans.push({
      type: "Кредит Наличными под залог авто",
      name: null,
      rateFrom: null,
      gesvFrom: gesvCar,
      maxAmount: null,
      maxTerm: null,
      url: "https://guide.kaspi.kz/client/ru/cash_credit/conditions/car_secured",
    });
  if (purchaseHtml)
    loans.push({
      type: "Кредит на Покупки",
      name: null,
      rateFrom: null,
      gesvFrom: null,
      maxAmount: kaspiMaxAmount(purchaseHtml),
      maxTerm: null,
      url: "https://kaspi.kz/purchase",
    });
  // JS-тегі \w кирилл әріптерін қамтымайды, сондықтан [а-яёА-ЯЁ] жазылады.
  if (installHtml && /Рассрочк[а-яё]*\s*0\s*%/i.test(flat(installHtml)))
    loans.push({
      type: "Рассрочка",
      name: null,
      rateFrom: 0,
      gesvFrom: null,
      maxAmount: kaspiMaxAmount(installHtml),
      maxTerm: null,
      url: "https://kaspi.kz/installment",
    });
  if (redHtml && /рассрочк[а-яё]*\s*0\s*%/i.test(flat(redHtml)))
    loans.push({
      type: "Рассрочка",
      name: "Kaspi Red",
      rateFrom: 0,
      gesvFrom: null,
      maxAmount: kaspiMaxAmount(redHtml),
      maxTerm: null,
      url: "https://kaspi.kz/kaspired",
    });

  return sieve("kaspi", deposits, loans);
}

export const FETCHERS = { halyk, bereke, freedom, kaspi };
