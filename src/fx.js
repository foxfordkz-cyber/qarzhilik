// Банктердің айырбастау бағамдары (сатып алу / сату).
// buy — банк клиенттен валютаны сатып алатын бағам, sell — банк клиентке сататын бағам.
// Әр банк өз сайтындағы ашық виджеттен алынады; қатесі бар банк жай ғана бос қалады.

const UA = "Mozilla/5.0 (compatible; QARZHY/1.0; +https://qarzhy.zerdeliportald.workers.dev)";
const TIMEOUT = 8000;
const CODES = ["USD", "EUR", "RUB"];

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const pair = (buy, sell) => ({ buy: num(buy), sell: num(sell) });
const empty = () => ({ USD: null, EUR: null, RUB: null });

async function get(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, Accept: "application/json,text/html;q=0.9", ...(init.headers || {}) },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res;
}
const postJson = (url, body, headers = {}) =>
  get(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }).then((r) => r.json());

async function halyk() {
  const j = await (await get("https://back.halykbank.kz/common/currency-history")).json();
  const days = Object.values(j.data.currencyHistory).sort((a, b) => b.date.localeCompare(a.date));
  const p = days[0].privatePersons;
  const out = empty();
  for (const c of CODES) if (p[`${c}/KZT`]) out[c] = pair(p[`${c}/KZT`].buy, p[`${c}/KZT`].sell);
  return out;
}

async function kaspi() {
  const j = await postJson(
    "https://guide.kaspi.kz/client/api/v2/intgr/currency/rate/aggregate",
    { use_type: "2", currency_codes: CODES, rate_types: ["SALE", "BUY"] },
    { gLanguage: "ru", gSystem: "kkz" }
  );
  const out = empty();
  for (const r of j.body || []) if (CODES.includes(r.currency)) out[r.currency] = pair(r.buy, r.sale);
  return out;
}

async function freedom() {
  const j = await (await get("https://bankffin.kz/api/exchange-rates/getRates")).json();
  const out = empty();
  for (const r of j.data.cash || []) if (r.sellCode === "KZT" && CODES.includes(r.buyCode)) out[r.buyCode] = pair(r.buyRate, r.sellRate);
  return out;
}

const unentity = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

async function bcc() {
  const html = await (await get("https://www.bcc.kz/personal/currency-rates/")).text();
  const m = html.match(/data-personal='([^']*)'/);
  if (!m) throw new Error("bcc: data-personal not found");
  const rows = JSON.parse(unentity(m[1]));
  const out = empty();
  for (const c of CODES) {
    const r =
      rows.find((x) => x.currency === c && x.region === "GO" && (x.limit === "below" || x.limit === null)) ||
      rows.find((x) => x.currency === c && x.region === "GO");
    if (r) out[c] = pair(r.buy, r.sell);
  }
  return out;
}

async function alatau() {
  const arr = await (await get("https://alataucitybank.kz/currency/exchange")).json();
  const out = empty();
  // saleSum — клиент сатады (банк сатып алады), buyingSum — клиент сатып алады (банк сатады)
  for (const r of arr) {
    if (r.exchangeType === "1" && r.currencyTo === "KZT" && CODES.includes(r.currencyFrom)) {
      out[r.currencyFrom] = pair(r.saleSum, r.buyingSum);
    }
  }
  return out;
}

async function forte() {
  const ids = { USD: 221, EUR: 241, RUB: 243 };
  const out = empty();
  await Promise.all(
    Object.entries(ids).map(async ([c, id]) => {
      const j = await (
        await get(`https://forte.kz/api/anthill/fortex/v1/api/financialInstruments/exchange/bestExchangeRate?instrId=${id}&operationType=ALL`)
      ).json();
      out[c] = pair(j.BUY, j.SELL);
    })
  );
  return out;
}

async function eurasian() {
  const j = await postJson("https://eubank.kz/v1/GetCurrentRates", { RateType: "EXCHANGE_RATES", DepartmentNumber: 6 });
  const dep = j.RatesByDepartment?.DepartmentRate?.[0];
  const out = empty();
  for (const r of dep?.Rates || []) if (CODES.includes(r.Name)) out[r.Name] = pair(r.Buy, r.Sale);
  return out;
}

// note — бағам түрі қолма-қол ақшаға емес, басқа арнаға қатысты болса
const SOURCES = {
  halyk: { fn: halyk },
  kaspi: { fn: kaspi, note: "Kaspi бөлімшелеріндегі қолма-қол бағам" },
  freedom: { fn: freedom },
  bcc: { fn: bcc },
  alatau: { fn: alatau },
  forte: { fn: forte, note: "ForteX — қосымшадағы бағам" },
  eurasian: { fn: eurasian },
};

export async function fetchBankRates() {
  const ids = Object.keys(SOURCES);
  const settled = await Promise.allSettled(ids.map((id) => SOURCES[id].fn()));
  const banks = {};
  settled.forEach((s, i) => {
    const id = ids[i];
    if (s.status === "fulfilled" && CODES.some((c) => s.value[c]?.buy || s.value[c]?.sell)) {
      banks[id] = { ...s.value, note: SOURCES[id].note || null };
    } else {
      console.error("fx", id, s.status === "rejected" ? String(s.reason?.message || s.reason) : "empty");
    }
  });
  return banks;
}
