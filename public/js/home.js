// QARZHЫ — басты бет
(function () {
  "use strict";
  const { icon, esc, api, me, openModal } = window.QZ;

  const fmt = (n, d = 2) => Number(n).toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = (n) => `${Math.round(n).toLocaleString("ru-RU")} ₸`;

  // Fallback бағамдар (API қолжетімсіз болса)
  let rates = { USD: { rate: 446.84, change: 0 }, EUR: { rate: 512.9, change: 0 }, RUB: { rate: 5.28, change: 0 }, CNY: { rate: 62.1, change: 0 } };
  let ratesDate = null;

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("about-art").innerHTML = aboutArt();
    document.getElementById("world-art").innerHTML = worldArt();
    initScrollSpy();
    loadRates();
    loadBanks().then(fillMarketStats);
    document.querySelectorAll("[data-market]").forEach((b) => b.addEventListener("click", () => MARKET[b.dataset.market]()));

    me().then(({ user }) => {
      if (!user) return;
      document.getElementById("start-cta").innerHTML = `
        <a class="btn btn-orange btn-lg" href="/cabinet">Жеке кабинетке өту ${icon("arrow")}</a>
        <a class="btn btn-ghost btn-lg" href="#learn">Курстарды көру</a>`;
    });
  });

  // ---------- Scroll spy ----------
  function initScrollSpy() {
    const links = [...document.querySelectorAll("[data-nav]")];
    const sections = ["home", "learn", "world", "about", "start"].map((id) => document.getElementById(id)).filter(Boolean);
    const update = () => {
      const y = window.scrollY + window.innerHeight * 0.35;
      let current = "home";
      sections.forEach((s) => { if (s.offsetTop <= y) current = s.id; });
      if (current === "start") current = "about";
      links.forEach((a) => a.classList.toggle("is-active", a.dataset.nav === current));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  // ---------- Қаржы әлемі карточкаларындағы көрсеткіштер (banks.json бойынша) ----------
  function fillMarketStats({ banks = [] }) {
    const set = (k, v) => { const el = document.querySelector(`[data-stat="${k}"]`); if (el && v) el.textContent = v; };
    const parseMoney = (s) => { const m = String(s || "").match(/(\d[\d\s]*)(\s*млн)?/); return m ? Number(m[1].replace(/\s/g, "")) * (m[2] ? 1e6 : 1) : 0; };
    const months = (s) => { const m = String(s || "").match(/(\d+)\s*(ай|жыл)/); return m ? +m[1] * (m[2] === "жыл" ? 12 : 1) : 0; };
    const fmtTerm = (mo) => (mo % 12 === 0 ? `${mo / 12} жыл` : `${mo} ай`);

    const deps = banks.flatMap((b) => (b.deposits || []).map((d) => ({ ...d, bank: b.name })));
    const top = deps.filter((d) => d.rate != null).sort((x, y) => y.rate - x.rate)[0];
    if (top) {
      set("dep-max", pct(top.rate));
      const note = document.getElementById("dep-note");
      if (note) note.textContent = `${top.bank} · ${top.name}`;
    }
    const minTerm = deps.map((d) => months(d.term)).filter(Boolean).sort((x, y) => x - y)[0];
    if (minTerm) set("dep-term", fmtTerm(minTerm));
    const cur = ["KZT", "USD", "EUR", "RUB"].filter((c) => deps.some((d) => (d.currencies || []).includes(c)));
    if (cur.length) set("dep-cur", cur.join(", "));

    const cash = banks.flatMap((b) => (b.loans || []).filter((l) => l.type === "Кепілсіз қолма-қол несие"));
    const minRate = cash.map((l) => l.rateFrom).filter((r) => r != null).sort((x, y) => x - y)[0];
    if (minRate != null) set("loan-min", pct(minRate));
    const maxAmount = Math.max(0, ...cash.map((l) => parseMoney(l.maxAmount)));
    if (maxAmount) set("loan-amount", `${maxAmount.toLocaleString("ru-RU")} ₸`);
    const maxTerm = Math.max(0, ...cash.map((l) => months(l.maxTerm)));
    if (maxTerm) set("loan-term", fmtTerm(maxTerm));
  }

  // ---------- Rates ----------
  async function loadRates() {
    try {
      const data = await api("/api/rates");
      rates = { ...rates, ...data.rates };
      ratesDate = data.date;
      document.querySelectorAll("[data-rate]").forEach((el) => {
        const r = rates[el.dataset.rate];
        if (!r) return;
        const chg = r.change ? `<span class="chg">${r.change > 0 ? "▲" : "▼"} ${fmt(Math.abs(r.change))}</span>` : "";
        el.innerHTML = fmt(r.rate) + chg;
      });
      document.getElementById("rates-note").textContent = `ҚР Ұлттық Банкінің ресми бағамы · ${data.date}`;
    } catch {
      /* статикалық мәндер қалады */
    }
  }

  // ---------- Market modals ----------
  const BADGE_COLORS = ["#1a6b3c", "#0c4a8c", "#5b5bd6", "#d9481a", "#0e7490", "#9d174d", "#4d7c0f", "#7c3aed", "#b45309", "#334155"];
  const pct = (n) => (n == null || n === "" ? null : `${Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`);
  const initials = (name) => name.replace(/[«»"]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const badge = (b, i) => `<span class="bank-badge" style="background:${b.color || BADGE_COLORS[i % BADGE_COLORS.length]}">${esc(b.short || initials(b.name))}</span>`;
  const ext = (url, label, cls = "btn btn-green btn-sm", style = "") =>
    url ? `<a class="${cls}" ${style ? `style="${style}"` : ""} href="${esc(url)}" target="_blank" rel="noopener">${label} ${icon("external")}</a>` : "";

  let banksPromise, otbasyPromise, bankFxPromise;
  const loadBanks = () => (banksPromise ||= fetch("/data/banks.json").then((r) => (r.ok ? r.json() : { banks: [] })).catch(() => ({ banks: [] })));
  const fetchJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(url))));
  const loadOtbasy = () =>
    (otbasyPromise ||= (window.QZ.LANG === "ru" ? fetchJson("/data/otbasy.ru.json") : Promise.reject())
      .catch(() => fetchJson("/data/otbasy.json"))
      .catch(() => null));
  const loadBankFx = () => (bankFxPromise ||= api("/api/bank-rates").catch(() => null));

  function head(color, ic, title, sub) {
    return `<div class="modal-head" style="background:${color}">${icon(ic)}<div><h3>${title}</h3><p>${sub}</p></div></div>`;
  }
  const fine = `<p class="fine">Мөлшерлемелер банктердің ресми сайттарындағы ақпарат бойынша берілген және өзгеруі мүмкін. Шешім қабылдамас бұрын нақты шарттарды банктен тексеріңіз.</p>`;
  const intro = (text, updated) =>
    `<div class="portfolio-intro"><span>${text}</span>${updated ? `<span class="upd">${icon("clock")} ${esc(updated)}</span>` : ""}</div>`;
  const val = (v, fmtNum) => (v == null || v === "" ? null : typeof v === "number" ? fmtNum(v) : esc(v));

  function annuity(principal, yearRate, months) {
    const r = yearRate / 100 / 12;
    if (!r) return principal / months;
    return (principal * r) / (1 - Math.pow(1 + r, -months));
  }

  function loanCalc(defaults) {
    return `
      <div class="calc" data-calc="loan">
        <div class="calc-grid">
          <label>Сома, ₸<input type="number" name="amount" min="10000" step="10000" value="${defaults.amount}"></label>
          <label>Жылдық мөлшерлеме, %<input type="number" name="rate" min="0" max="60" step="0.1" value="${defaults.rate}"></label>
          <label>Мерзім, ай<input type="number" name="months" min="1" max="360" step="1" value="${defaults.months}"></label>
        </div>
        <div class="calc-out">
          <div><span>Ай сайынғы төлем</span><b data-out="pay">—</b></div>
          <div><span>Барлық төлем</span><b data-out="total">—</b></div>
          <div><span>Артық төлем</span><b data-out="over">—</b></div>
        </div>
      </div>`;
  }
  function bindLoan(modal) {
    const c = modal.querySelector('[data-calc="loan"]');
    const run = () => {
      const a = +c.querySelector("[name=amount]").value || 0;
      const r = +c.querySelector("[name=rate]").value || 0;
      const m = Math.max(1, +c.querySelector("[name=months]").value || 1);
      const pay = annuity(a, r, m);
      c.querySelector('[data-out="pay"]').textContent = money(pay);
      c.querySelector('[data-out="total"]').textContent = money(pay * m);
      c.querySelector('[data-out="over"]').textContent = money(pay * m - a);
    };
    c.addEventListener("input", run);
    run();
  }

  function depositCalc() {
    return `
      <div class="calc" data-calc="deposit">
        <div class="calc-grid">
          <label>Сома, ₸<input type="number" name="amount" min="1000" step="10000" value="500000"></label>
          <label>Жылдық мөлшерлеме, %<input type="number" name="rate" min="0" max="40" step="0.01" value="15"></label>
          <label>Мерзім, ай<input type="number" name="months" min="1" max="120" value="12"></label>
        </div>
        <div class="calc-out">
          <div><span>Мерзім соңында</span><b data-out="end">—</b></div>
          <div><span>Табыс</span><b data-out="profit">—</b></div>
          <div><span>Тиімді мөлшерлеме</span><b data-out="eff">—</b></div>
        </div>
      </div>`;
  }
  function bindDeposit(modal) {
    const c = modal.querySelector('[data-calc="deposit"]');
    const run = () => {
      const a = +c.querySelector("[name=amount]").value || 0;
      const r = +c.querySelector("[name=rate]").value || 0;
      const m = Math.max(1, +c.querySelector("[name=months]").value || 1);
      const end = a * Math.pow(1 + r / 100 / 12, m);
      c.querySelector('[data-out="end"]').textContent = money(end);
      c.querySelector('[data-out="profit"]').textContent = money(end - a);
      c.querySelector('[data-out="eff"]').textContent = `${fmt((Math.pow(1 + r / 100 / 12, 12) - 1) * 100)}%`;
    };
    c.addEventListener("input", run);
    run();
  }

  const prodName = (name, url) =>
    url ? `<a class="pn" href="${esc(url)}" target="_blank" rel="noopener">${esc(name)} ${icon("external")}</a>` : `<b>${esc(name)}</b>`;
  const bestOf = (items, key) => items.reduce((m, x) => (typeof x[key] === "number" && (m == null || x[key] > m) ? x[key] : m), null);
  const lowestOf = (items, key) => items.reduce((m, x) => (typeof x[key] === "number" && (m == null || x[key] < m) ? x[key] : m), null);

  const MARKET = {
    async deposit() {
      const { banks = [], updated } = await loadBanks();
      openModal(
        head("linear-gradient(135deg,#4fbf52,#1f8a36)", "piggy", "Депозиттер", "Банктердің депозиттік ұсыныстары") +
        `<div class="modal-body">
          ${intro(`${banks.length} банктің депозиттері. Банкті таңдап, оның ресми сайтындағы депозиттер бетіне өтіңіз.`, updated)}
          <div class="bank-grid">
            ${banks.map((b, i) => {
              const deps = b.deposits || [];
              const best = bestOf(deps, "rate");
              return `
              <article class="bank-card">
                <div class="bank-top">${badge(b, i)}<div><h5>${esc(b.name)}</h5><small>${deps.length ? `${deps.length} депозит` : "Депозиттер"}</small></div>${best != null ? `<span class="best">${pct(best)}-ға дейін</span>` : ""}</div>
                ${deps.length ? `<ul class="prod-list">${deps.map((d) => `
                  <li>${prodName(d.name, d.url)}<span class="r">${d.rate != null ? `${pct(d.rate)}-ға дейін` : d.gesv != null ? `ЖТСМ ${pct(d.gesv)}` : "—"}</span>
                  <span class="m">${[d.rate != null && d.gesv != null ? `ЖТСМ ${pct(d.gesv)}-ға дейін` : "", d.term ? esc(d.term) : "", (d.currencies || []).join(", ")].filter(Boolean).join(" · ")}</span></li>`).join("")}</ul>`
                  : `<p class="bank-empty">${esc(b.note || "Өнімдер мен мөлшерлемелер банктің сайтында.")}</p>`}
                ${ext(b.depositsUrl || b.site, "Депозиттерді көру")}
              </article>`;
            }).join("")}
          </div>
          <h4 style="margin-top:26px">Депозит калькуляторы (ай сайын капиталдандыру)</h4>
          ${depositCalc()}
          <h4>Депозит таңдағанда нені тексеру керек?</h4>
          <ul>
            <li>Жылдық тиімді сыйақы мөлшерлемесі (ЖТСМ) — нақты табысты көрсетеді.</li>
            <li>Мерзімінен бұрын алу және толықтыру шарттары.</li>
            <li>Салымның Қазақстанның депозиттерге кепілдік беру қорымен кепілдендірілуі.</li>
          </ul>
          <div class="links-row">
            <a class="btn btn-green btn-sm" href="/topic?c=life&t=zhinaq">Сабақ: Жинақ және депозит ${icon("arrow")}</a>
            ${ext("https://kdif.kz", "kdif.kz", "btn btn-outline btn-sm")}
          </div>
          ${fine}
        </div>`,
        bindDeposit,
        true
      );
    },

    async credit() {
      const { banks = [], updated } = await loadBanks();
      openModal(
        head("linear-gradient(135deg,#37a8d9,#135d99)", "certificate", "Несиелер", "Банктердің несие түрлері") +
        `<div class="modal-body">
          ${intro(`${banks.length} банктің несие өнімдері. Банкті таңдап, ресми сайттағы несиелер бетіне өтіңіз.`, updated)}
          <div class="bank-grid">
            ${banks.map((b, i) => {
              const loans = b.loans || [];
              // Серіктес/мемлекеттік/бөліп төлеу ұсыныстары «ең төменгі» белгісіне кірмейді
              const low = lowestOf(loans.filter((l) => !l.special), "rateFrom");
              return `
              <article class="bank-card">
                <div class="bank-top">${badge(b, i)}<div><h5>${esc(b.name)}</h5><small>${loans.length ? `${loans.length} несие түрі` : "Несиелер"}</small></div>${low != null ? `<span class="best blue">${pct(low)}-дан</span>` : ""}</div>
                ${loans.length ? `<ul class="prod-list">${loans.map((l) => `
                  <li>${prodName(l.brand ? `${l.type} — ${l.brand}` : l.type, l.url)}<span class="r" style="color:#135d99">${l.rateFrom != null ? `${pct(l.rateFrom)}-дан` : l.gesvFrom != null ? `ЖТСМ ${pct(l.gesvFrom)}` : "—"}</span>
                  <span class="m">${[l.rateFrom != null && l.gesvFrom != null ? `ЖТСМ ${pct(l.gesvFrom)}-дан` : "", l.maxAmount ? esc(l.maxAmount) : "", l.maxTerm ? esc(l.maxTerm) : "", l.special ? `<em class="special">${esc(l.special)}</em>` : ""].filter(Boolean).join(" · ")}</span></li>`).join("")}</ul>`
                  : `<p class="bank-empty">${esc(b.note || "Несие түрлері мен шарттары банктің сайтында.")}</p>`}
                ${ext(b.loansUrl || b.site, "Несиелерді көру", "btn btn-green btn-sm", "background:#135d99")}
              </article>`;
            }).join("")}
          </div>
          <h4 style="margin-top:26px">Несие калькуляторы (аннуитетті төлем)</h4>
          ${loanCalc({ amount: 2000000, rate: 20, months: 36 })}
          <h4>Несие алмас бұрын</h4>
          <ul>
            <li>Номиналды емес, жылдық тиімді сыйақы мөлшерлемесін (ЖТСМ) салыстырыңыз.</li>
            <li>Ай сайынғы төлем табысыңыздың 30–40%-ынан аспағаны жөн.</li>
            <li>Аннуитетті және сараланған төлем кестелерін салыстырыңыз.</li>
          </ul>
          <div class="links-row">
            <a class="btn btn-green btn-sm" href="/topic?c=life&t=nesie">Сабақ: Несие және қарызды басқару ${icon("arrow")}</a>
          </div>
          ${fine}
        </div>`,
        bindLoan,
        true
      );
    },

    async currency() {
      const [{ banks = [] }, live] = await Promise.all([loadBanks(), loadBankFx()]);
      const codes = ["USD", "EUR", "RUB"];
      const liveBy = (live && live.banks) || {};
      const cell = (r) => (r && (r.buy || r.sell) ? `${r.buy ? fmt(r.buy) : "—"} / ${r.sell ? fmt(r.sell) : "—"}` : "—");
      openModal(
        head("linear-gradient(135deg,#8b87f0,#4a47c2)", "exchange", "Валюта бағамдары", "Банктердегі сатып алу / сату бағамы") +
        `<div class="modal-body">
          ${intro("Әр банктің айырбастау бағамы (сатып алу / сату). Толық кесте — банктің ресми сайтында.", live?.updatedAt ? `Жаңартылды: ${live.updatedAt}` : ratesDate)}
          <div class="fx-wrap">
            <table class="fx-table">
              <thead><tr><th>Банк</th>${codes.map((c) => `<th>${c}<small style="display:block;font-weight:600;text-transform:none;letter-spacing:0">алу / сату</small></th>`).join("")}<th></th></tr></thead>
              <tbody>
                <tr class="nbk"><td>ҚР Ұлттық Банкі <small>ресми бағам</small></td>${codes.map((c) => `<td>${rates[c] ? fmt(rates[c].rate) : "—"}</td>`).join("")}<td>${ext("https://nationalbank.kz", "Сайт", "ext")}</td></tr>
                ${banks.map((b, i) => {
                  const r = liveBy[b.id] || {};
                  return `<tr><td><span class="bank-cell">${badge(b, i)}<span>${esc(b.name)}${r.note ? `<small>${esc(r.note)}</small>` : ""}</span></span></td>${codes.map((c) => `<td>${cell(r[c])}</td>`).join("")}<td>${ext(b.ratesUrl || b.site, "Бағамдар", "ext")}</td></tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
          <h4 style="margin-top:22px">Валюта айырбастау (ресми бағам бойынша)</h4>
          <div class="calc" data-calc="fx">
            <div class="calc-grid">
              <label>Сома<input type="number" name="amount" min="0" step="1" value="100"></label>
              <label>Валютадан<select name="from">${["KZT", ...codes, "CNY"].map((c) => `<option ${c === "USD" ? "selected" : ""}>${c}</option>`).join("")}</select></label>
              <label>Валютаға<select name="to">${["KZT", ...codes, "CNY"].map((c) => `<option ${c === "KZT" ? "selected" : ""}>${c}</option>`).join("")}</select></label>
            </div>
            <div class="calc-out" style="grid-template-columns:1fr">
              <div><span>Нәтиже</span><b data-out="res">—</b></div>
            </div>
          </div>
          <p class="fine">Банктердегі айырбастау бағамы ресми бағамнан өзгеше болады: банк валютаны арзанырақ сатып алып, қымбатырақ сатады (спред). Бағамдар күн ішінде өзгеруі мүмкін.</p>
        </div>`,
        (modal) => {
          const c = modal.querySelector('[data-calc="fx"]');
          const toKzt = (code) => (code === "KZT" ? 1 : rates[code]?.rate || 0);
          const run = () => {
            const a = +c.querySelector("[name=amount]").value || 0;
            const from = c.querySelector("[name=from]").value;
            const to = c.querySelector("[name=to]").value;
            const res = toKzt(to) ? (a * toKzt(from)) / toKzt(to) : 0;
            c.querySelector('[data-out="res"]').textContent = `${fmt(res)} ${to}`;
          };
          c.addEventListener("input", run);
          c.addEventListener("change", run);
          run();
        },
        true
      );
    },

    async mortgage() {
      const ot = await loadOtbasy();
      const programs = ot?.programs || [];
      const groups = ot?.groups || [];
      const zh = ot?.zhss || {};
      // «7% (...) / 9% (...); ...» → «7% / 9%»
      const shortRate = (r) => (r ? String(r).split(";")[0].replace(/\s*\([^)]*\)/g, "").trim() : null);
      const row = (label, v) => (v ? `<div><span>${label}</span><b>${esc(v)}</b></div>` : "");
      const card = (p) => `
        <article class="prog-card" data-group="${esc(p.group)}">
          <h5>${esc(p.name)}</h5>
          ${shortRate(p.rate) ? `<div class="prog-rate">${esc(shortRate(p.rate))}</div>` : ""}
          <div class="kv">
            ${row("Мөлшерлеме", p.rate && p.rate !== shortRate(p.rate) ? p.rate : null)}
            ${row("ЖТСМ", p.gesv)}
            ${row("Бастапқы жарна", p.downPayment)}
            ${row("Мерзім", p.maxTerm)}
            ${row("Сома", p.maxAmount)}
          </div>
          ${p.purpose || p.requirements?.length ? `
            <details>
              <summary>Кімге және не үшін?</summary>
              ${p.purpose ? `<p>${esc(p.purpose)}</p>` : ""}
              ${p.requirements?.length ? `<ul>${p.requirements.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
            </details>` : ""}
          ${ext(p.url || ot.infoSite, "Толығырақ", "btn btn-sm btn-orange")}
        </article>`;

      openModal(
        head("linear-gradient(135deg,#f58a2c,#d9481a)", "house", "Ипотекалық бағдарламалар", "Отбасы банк — тұрғын үй бағдарламалары мен заемдары") +
        `<div class="modal-body">
          ${intro(`Отбасы банктің ${programs.length} бағдарламасы. Әр бағдарламаның шарттары — банктің ресми сайтынан.`, ot?.checkedAt ? `Тексерілді: ${ot.checkedAt.split("-").reverse().join(".")}` : "")}
          ${zh.howItWorks ? `
            <div class="zhss">
              <b>${icon("bulb")} Тұрғын үй құрылыс жинақтары қалай жұмыс істейді?</b>
              <p>${esc(zh.howItWorks)}</p>
              ${zh.statePremium?.rate ? `<p><b>Мемлекет сыйлықақысы:</b> ${esc(zh.statePremium.rate)}.</p>` : ""}
              ${zh.depositBaspana?.rate ? `<p><b>«Баспана» депозиті:</b> ${esc(zh.depositBaspana.rate)}${zh.depositBaspana.effectiveRateWithPremium ? `, сыйлықақымен — ${esc(zh.depositBaspana.effectiveRateWithPremium)}` : ""}.</p>` : ""}
            </div>` : ""}
          ${groups.length ? `<div class="seg" role="tablist">${[{ id: "all", title: "Барлығы" }, ...groups].map((g, i) => `<button type="button" data-seg="${g.id}" class="${i ? "" : "is-active"}">${esc(g.title)}</button>`).join("")}</div>` : ""}
          <div class="prog-grid">
            ${programs.map(card).join("") || `<p class="bank-empty">Бағдарламалар тізімі Отбасы банктің сайтында.</p>`}
          </div>
          <h4 style="margin-top:26px">Ипотека калькуляторы</h4>
          ${loanCalc({ amount: 25000000, rate: 9, months: 228 })}
          <h4>Ипотека алмас бұрын</h4>
          <ul>
            <li>Бастапқы жарнаның мөлшерін және қатысушыға қойылатын талаптарды тексеріңіз.</li>
            <li>Мерзім ұзарған сайын ай сайынғы төлем азаяды, бірақ артық төлем өседі.</li>
            <li>«Наурыз», «Отау» сияқты бағдарламаларда іріктеу балдық жүйемен және кезеңмен өтеді — өтінім қабылдау мерзімін сайттан тексеріңіз.</li>
          </ul>
          <div class="links-row">
            ${ext(ot?.infoSite || "https://hcsbk.kz", "hcsbk.kz", "btn btn-outline btn-sm")}
            ${ext(ot?.site || "https://otbasybank.kz", "otbasybank.kz", "btn btn-outline btn-sm")}
          </div>
          ${fine}
        </div>`,
        (modal) => {
          bindLoan(modal);
          modal.querySelectorAll("[data-seg]").forEach((b) =>
            b.addEventListener("click", () => {
              modal.querySelectorAll("[data-seg]").forEach((x) => x.classList.toggle("is-active", x === b));
              modal.querySelectorAll(".prog-card").forEach((c) => (c.hidden = b.dataset.seg !== "all" && c.dataset.group !== b.dataset.seg));
            })
          );
        },
        true
      );
    },
  };

  // ---------- Illustrations ----------
  function coinStack(cx, baseY, n, rx = 52, ry = 12, h = 10) {
    let s = "";
    for (let i = 0; i < n; i++) {
      const yb = baseY - i * h;
      const yt = yb - h;
      s += `<path d="M${cx - rx} ${yt}V${yb}A${rx} ${ry} 0 0 0 ${cx + rx} ${yb}V${yt}z" fill="url(#coinSide)" stroke="#8a5d12" stroke-opacity=".35" stroke-width="1"/>`;
      s += `<ellipse cx="${cx}" cy="${yt}" rx="${rx}" ry="${ry}" fill="url(#coinTop)" stroke="#a87414" stroke-opacity=".5" stroke-width="1"/>`;
    }
    const top = baseY - n * h;
    s += `<ellipse cx="${cx}" cy="${top}" rx="${rx * 0.72}" ry="${ry * 0.62}" fill="none" stroke="#b37d1a" stroke-opacity=".45" stroke-width="1.5"/>`;
    return s;
  }

  function aboutArt() {
    const bokeh = [
      [60, 70, 40, 0.35], [150, 40, 26, 0.3], [390, 60, 50, 0.28], [300, 140, 30, 0.22], [430, 220, 36, 0.3],
      [40, 230, 34, 0.25], [120, 170, 18, 0.35], [360, 280, 22, 0.25], [220, 90, 16, 0.4],
    ].map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#cfe9a6" opacity="${o}"/>`).join("");
    return `
    <svg viewBox="0 0 480 540" role="img" aria-label="Тиын үстінде өсіп тұрған өскін">
      <defs>
        <radialGradient id="abBg" cx="50%" cy="35%" r="75%">
          <stop offset="0" stop-color="#5f9a3a"/><stop offset=".55" stop-color="#23502a"/><stop offset="1" stop-color="#0d2414"/>
        </radialGradient>
        <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#8a5a2e"/><stop offset="1" stop-color="#3d2412"/>
        </linearGradient>
        <linearGradient id="coinSide" x1="0" x2="1">
          <stop offset="0" stop-color="#8f6313"/><stop offset=".35" stop-color="#e2b54c"/><stop offset=".6" stop-color="#f5d57c"/><stop offset="1" stop-color="#9a6b16"/>
        </linearGradient>
        <radialGradient id="coinTop" cx="45%" cy="40%" r="70%">
          <stop offset="0" stop-color="#fbe7a6"/><stop offset=".6" stop-color="#e7bd57"/><stop offset="1" stop-color="#b98519"/>
        </radialGradient>
        <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#9be15d"/><stop offset="1" stop-color="#2f8f2a"/>
        </linearGradient>
        <filter id="blur"><feGaussianBlur stdDeviation="10"/></filter>
      </defs>
      <rect width="480" height="540" fill="url(#abBg)"/>
      <g filter="url(#blur)">${bokeh}</g>
      <path d="M0 410h480v130H0z" fill="url(#wood)"/>
      <path d="M0 410h480" stroke="#b07a42" stroke-width="3" opacity=".6"/>
      <ellipse cx="250" cy="452" rx="220" ry="26" fill="#000" opacity=".25"/>
      ${coinStack(110, 450, 6, 56)}
      ${coinStack(245, 440, 15, 58)}
      ${coinStack(362, 455, 8, 50)}
      ${coinStack(430, 470, 3, 40, 10, 9)}
      <g transform="translate(245 290)">
        <path d="M0 0C-2-30 4-60 0-110" stroke="#3f8f2c" stroke-width="7" fill="none" stroke-linecap="round"/>
        <path d="M0-40C-30-40-70-60-82-100-40-110-8-80 0-40z" fill="url(#leaf)"/>
        <path d="M0-40C-26-58-50-78-74-96" stroke="#e8f8c9" stroke-opacity=".6" stroke-width="2" fill="none"/>
        <path d="M1-72C28-70 66-92 78-132 36-140 6-110 1-72z" fill="url(#leaf)"/>
        <path d="M1-72C26-90 48-108 70-126" stroke="#e8f8c9" stroke-opacity=".6" stroke-width="2" fill="none"/>
        <path d="M0-108C-14-122-18-146-6-168 10-150 10-126 0-108z" fill="url(#leaf)"/>
        <path d="M-12 0c4-6 20-6 24 0" stroke="#5a3b16" stroke-width="6" fill="none" stroke-linecap="round"/>
      </g>
    </svg>`;
  }

  function worldArt() {
    return `
    <svg viewBox="0 0 400 290" role="img" aria-label="Банк ғимараты және тиындар">
      <defs>
        <linearGradient id="waBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eaf6e3"/><stop offset="1" stop-color="#cfe9c4"/></linearGradient>
        <linearGradient id="stone" x1="0" x2="1"><stop offset="0" stop-color="#cfd6d4"/><stop offset=".45" stop-color="#ffffff"/><stop offset="1" stop-color="#b8c2bf"/></linearGradient>
        <linearGradient id="roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fdfefe"/><stop offset="1" stop-color="#cdd6d3"/></linearGradient>
        <linearGradient id="coinSide" x1="0" x2="1">
          <stop offset="0" stop-color="#8f6313"/><stop offset=".35" stop-color="#e2b54c"/><stop offset=".6" stop-color="#f5d57c"/><stop offset="1" stop-color="#9a6b16"/>
        </linearGradient>
        <radialGradient id="coinTop" cx="45%" cy="40%" r="70%">
          <stop offset="0" stop-color="#fbe7a6"/><stop offset=".6" stop-color="#e7bd57"/><stop offset="1" stop-color="#b98519"/>
        </radialGradient>
        <linearGradient id="lf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8bd35a"/><stop offset="1" stop-color="#2c8a30"/></linearGradient>
      </defs>
      <path d="M40 40C110-6 300-10 360 40s50 170-10 214S70 300 30 240-30 86 40 40z" fill="url(#waBg)"/>
      <path d="M30 230c-20-40-6-80 18-96 6 30 0 64-18 96z" fill="url(#lf)"/>
      <path d="M52 238c-2-44 22-74 50-82-4 30-20 60-50 82z" fill="url(#lf)" opacity=".85"/>
      <path d="M372 150c20 26 20 64 0 90-12-28-12-62 0-90z" fill="url(#lf)"/>
      <g>
        <path d="M70 92 190 38l120 54z" fill="url(#roof)" stroke="#9aa7a3" stroke-width="2"/>
        <rect x="74" y="92" width="232" height="16" fill="#e7ecea" stroke="#9aa7a3" stroke-width="2"/>
        ${[96, 136, 176, 216, 256].map((x) => `<rect x="${x}" y="112" width="26" height="110" rx="3" fill="url(#stone)" stroke="#9aa7a3" stroke-width="1.5"/>`).join("")}
        <rect x="64" y="222" width="252" height="14" fill="#e7ecea" stroke="#9aa7a3" stroke-width="2"/>
        <rect x="52" y="236" width="276" height="14" fill="#d9e0de" stroke="#9aa7a3" stroke-width="2"/>
        <circle cx="190" cy="70" r="11" fill="#e2b54c" stroke="#a87414" stroke-width="2"/>
      </g>
      ${coinStack(300, 250, 9, 26, 7, 8)}
      ${coinStack(344, 256, 13, 24, 6.5, 8)}
      ${coinStack(262, 262, 4, 22, 6, 8)}
    </svg>`;
  }
})();
