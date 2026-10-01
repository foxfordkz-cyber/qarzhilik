// Банк сайттарынан алынған шикі деректерді сайттың бірыңғай пішіміне келтіру және тексеру.
// Мәтін емес, сандар сақталады: мерзім — аймен, сома — теңгемен. Тілге қарай пішімдеуді сайттың өзі жасайды.

const LOAN_TYPES = [
  [/рассрочк|kaspi\s*red|бөліп төлеу/i, "installment"],
  [/до зарплаты|жалақыға дейін/i, "payday"],
  [/лояльн|тұрақты клиент/i, "loyal"],
  [/рефинансирован|қайта қаржыландыру/i, "refi"],
  [/(льготн|государствен|субсидир|брк).*(авто)|(авто).*(льготн|государствен|субсидир|брк)/i, "autoGov"],
  [/(7-20-25|государствен|гос\.|мемлекеттік).*(ипотек)|(ипотек).*(7-20-25|государствен|мемлекеттік)/i, "mortgageGov"],
  [/под залог авто|көлік кепіл/i, "autoSecured"],
  [/автокредит|авто ?заем|автонесие|на покупку.*авто/i, "auto"],
  [/ипотек/i, "mortgage"],
  [/на покупки|сатып алуға/i, "purchase"],
  [/без ?залог|беззалог|кепілсіз/i, "cash"],
  [/залог|кепілді/i, "secured"],
  [/наличными|қолма-қол/i, "cash"],
];

// Банктердің орысша депозит атауларының қазақша нұсқасы (белгілі болса)
const DEPOSIT_NAME_KK = {
  "Универсальный": "Әмбебап",
  "Максимальный": "Барынша жоғары",
  "Образовательный вклад AQYL": "AQYL білім салымы",
  "До востребования": "Талап етілгенге дейін",
  "Накопительный Депозит": "Жинақтаушы Депозит",
  "Общий бюджет": "Ортақ бюджет",
  "Сберегательный вклад без права пополнения": "Толықтырусыз жинақ салымы",
  "Сберегательный депозит без снятия": "Ақша алусыз жинақ депозиті",
  "Депозит со снятием": "Ақша алу мүмкіндігі бар депозит",
  "TURBO Deposit Накопительный": "TURBO Deposit Жинақтаушы",
};

export function loanTypeKey(text = "") {
  for (const [re, key] of LOAN_TYPES) if (re.test(text)) return key;
  return "other";
}

export function specialOf(typeKey, rateFrom) {
  if (typeKey === "installment") return "installment";
  if (typeKey === "autoGov" || typeKey === "mortgageGov") return "gov";
  if (rateFrom != null && rateFrom < 5 && (typeKey === "auto" || typeKey === "mortgage")) return "partner";
  return null;
}

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export function toNumber(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v).replace(/\s/g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// «3 месяца», «5 лет», «60 мес.», «6 айдан», «25 жылға дейін» → айлар саны
export function toMonths(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isInteger(v) && v > 0 && v <= 600 ? v : null;
  const s = String(v).toLowerCase();
  if (/без срока|бессроч|мерзімсіз/.test(s)) return 0;
  const m = s.match(/(\d+)\s*(мес|ай|лет|год|жыл)/);
  if (!m) return null;
  const n = Number(m[1]);
  const months = /лет|год|жыл/.test(m[2]) ? n * 12 : n;
  return months > 0 && months <= 600 ? months : null;
}

// «8 000 000 ₸», «до 70 млн ₸», «45 000 000 тенге» → сан
export function toAmount(v) {
  if (v == null) return null;
  if (typeof v === "number") return v > 0 ? v : null;
  const s = String(v).replace(/ /g, " ").toLowerCase();
  const m = s.match(/(\d[\d\s]*(?:[.,]\d+)?)\s*(млн|млрд|миллион)?/);
  if (!m) return null;
  let n = Number(m[1].replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (m[2]) n *= /млрд/.test(m[2]) ? 1e9 : 1e6;
  return n >= 1000 && n <= 1e10 ? n : null;
}

const okRate = (v, max) => v == null || (typeof v === "number" && v >= 0 && v <= max);

export function normalizeDeposit(raw) {
  const name = clean(raw.name);
  const rate = toNumber(raw.rate);
  const gesv = toNumber(raw.gesv);
  if (!name || name.length > 80) return null;
  if (!okRate(rate, 30) || !okRate(gesv, 35)) return null;
  if (rate == null && gesv == null) return null;
  if (rate != null && gesv != null && gesv + 0.01 < rate) return null; // ЖТСМ мөлшерлемеден кем болмайды
  return {
    name,
    nameKk: DEPOSIT_NAME_KK[name] || null,
    rate,
    gesv,
    termMonths: toMonths(raw.minTerm ?? raw.term),
    currencies: Array.isArray(raw.currencies) ? raw.currencies.filter((c) => /^[A-Z]{3}$/.test(c)).slice(0, 6) : [],
    url: /^https:\/\//.test(raw.url || "") ? raw.url : null,
  };
}

export function normalizeLoan(raw) {
  const source = `${raw.type || ""} ${raw.name || ""}`;
  const typeKey = loanTypeKey(source);
  const rateFrom = toNumber(raw.rateFrom ?? raw.rate);
  const gesvFrom = toNumber(raw.gesvFrom ?? raw.gesv);
  if (!okRate(rateFrom, 60) || !okRate(gesvFrom, 60)) return null;
  if (rateFrom == null && gesvFrom == null) return null;
  if (rateFrom != null && gesvFrom != null && gesvFrom + 0.01 < rateFrom) return null;
  const brandMatch = clean(raw.name).match(/«[^»]+»|#\S+|Kaspi Red|Kolesa\.kz/);
  return {
    typeKey,
    brand: brandMatch ? brandMatch[0] : null,
    rateFrom,
    gesvFrom,
    maxAmount: toAmount(raw.maxAmount),
    maxTermMonths: toMonths(raw.maxTerm),
    special: specialOf(typeKey, rateFrom),
    url: /^https:\/\//.test(raw.url || "") ? raw.url : null,
  };
}

export function normalizeBank(raw) {
  const deposits = (raw?.deposits || []).map(normalizeDeposit).filter(Boolean).slice(0, 8);
  const loans = (raw?.loans || []).map(normalizeLoan).filter(Boolean).slice(0, 10);
  const dropped = (raw?.deposits || []).length + (raw?.loans || []).length - deposits.length - loans.length;
  return { deposits, loans, dropped };
}
