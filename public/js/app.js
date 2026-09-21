// QARZHЫ — ортақ скрипт: иконкалар, header/footer, API, auth күйі
(function () {
  "use strict";

  const MOOC_URL = "https://mooc.enu.kz/course/view.php?id=1485";

  // ---------- Тіл (ҚАЗ / РУС) ----------
  const LANG = (() => {
    try {
      const q = new URLSearchParams(location.search).get("lang");
      if (q === "ru" || q === "kk") { localStorage.setItem("qz_lang", q); return q; }
      return localStorage.getItem("qz_lang") === "ru" ? "ru" : "kk";
    } catch {
      return new URLSearchParams(location.search).get("lang") === "ru" ? "ru" : "kk";
    }
  })();
  document.documentElement.lang = LANG === "ru" ? "ru" : "kk";

  const RU = window.QZ_RU;
  const CYR = /[Ѐ-ӿ]/;
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // Қазақша мәтінді орысшаға аудару (сөздік → үлгілер → « · » бөлшектері → жол ішіндегі үлгілер)
  function tr(text) {
    if (LANG !== "ru" || !RU || typeof text !== "string" || !CYR.test(text)) return text;
    const lead = text.match(/^\s*/)[0];
    const trail = text.slice(lead.length).match(/\s*$/)[0];
    const core = text.slice(lead.length, text.length - trail.length).replace(/\s+/g, " ");
    const out = trCore(core);
    return out == null ? text : lead + out + trail;
  }
  function trCore(core) {
    if (hasOwn(RU.dict, core)) return RU.dict[core];
    for (const [re, fn] of RU.rules) {
      const m = core.match(re);
      if (!m) continue;
      const out = typeof fn === "function" ? fn(...m, tr) : core.replace(re, fn);
      if (out != null) return out;
    }
    if (core.includes(" · ")) {
      const parts = core.split(" · ");
      const done = parts.map((p) => tr(p));
      if (done.some((p, i) => p !== parts[i])) return done.join(" · ");
    }
    let t = core;
    for (const [re, rep] of RU.tokens) t = t.replace(re, rep);
    return t !== core ? t : null;
  }

  const I18N_ATTRS = ["placeholder", "title", "aria-label", "alt"];
  function translateNode(node) {
    if (node.nodeType === 3) {
      const v = node.nodeValue;
      const n = tr(v);
      if (n !== v) node.nodeValue = n;
      return;
    }
    if (node.nodeType !== 1 || node.tagName === "SCRIPT" || node.tagName === "STYLE") return;
    const els = [node, ...node.querySelectorAll("*")];
    for (const el of els) {
      if (el.hasAttribute("data-ru")) { el.textContent = el.getAttribute("data-ru"); el.removeAttribute("data-ru"); }
      for (const a of I18N_ATTRS) {
        const v = el.getAttribute(a);
        if (v && CYR.test(v)) { const n = tr(v); if (n !== v) el.setAttribute(a, n); }
      }
    }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (t) => (t.parentNode && /^(SCRIPT|STYLE)$/.test(t.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const v = t.nodeValue;
      if (!CYR.test(v)) continue;
      const n = tr(v);
      if (n !== v) t.nodeValue = n;
    }
  }
  if (LANG === "ru" && RU) {
    translateNode(document.documentElement);
    new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach(translateNode)))
      .observe(document.documentElement, { childList: true, subtree: true });
  }

  function setLang(lang) {
    try { localStorage.setItem("qz_lang", lang); } catch { /* localStorage жабық болса — URL арқылы */ }
    const url = new URL(location.href);
    url.searchParams.set("lang", lang);
    location.replace(url);
  }
  function langSwitch() {
    return `<div class="lang-switch" role="group" aria-label="Тіл">
      <button type="button" data-lang="kk" class="${LANG === "kk" ? "is-active" : ""}" aria-pressed="${LANG === "kk"}">ҚАЗ</button>
      <button type="button" data-lang="ru" class="${LANG === "ru" ? "is-active" : ""}" aria-pressed="${LANG === "ru"}">РУС</button>
    </div>`;
  }
  function bindLangSwitch(root = document) {
    root.querySelectorAll("[data-lang]").forEach((b) =>
      b.addEventListener("click", () => { if (b.dataset.lang !== LANG) setLang(b.dataset.lang); })
    );
  }

  // ---------- Icons (64×64, контурлы) ----------
  const D = "M15.5 7.5c-.8-1.2-2.2-2-3.9-2-2.2 0-3.9 1.3-3.9 3 0 4.2 8.2 2.3 8.2 6.6 0 1.8-1.8 3.2-4.2 3.2-1.9 0-3.5-.8-4.4-2.1M11.8 3v18";
  const dollar = (cx, cy, s) =>
    `<path d="${D}" transform="translate(${cx - 11.8 * s} ${cy - 12 * s}) scale(${s})" vector-effect="non-scaling-stroke"/>`;

  const ICONS = {
    "doc-dollar": `<path d="M16 6h22l12 12v40H16z"/><path d="M38 6v12h12"/><circle cx="33" cy="37" r="11"/>${dollar(33, 37, 0.72)}`,
    wallet: `<rect x="8" y="20" width="48" height="34" rx="3"/><path d="M13 20l23-11 5 11"/><path d="M28 20l17-7 3 7"/><path d="M44 31h12v12H44a6 6 0 0 1 0-12z"/><circle cx="45" cy="37" r="1.6" fill="currentColor"/>`,
    bank: `<path d="M6 22 32 8l26 14z"/><path d="M14 28v18M26 28v18M38 28v18M50 28v18"/><path d="M10 50h44M6 57h52"/>`,
    calculator: `<rect x="14" y="6" width="36" height="52" rx="3"/><rect x="20" y="12" width="24" height="10" rx="1.5"/><path d="M20 31h5v5h-5zM29.5 31h5v5h-5zM39 31h5v5h-5zM20 43h5v5h-5zM29.5 43h5v5h-5zM39 43h5v5h-5z"/>`,
    "umbrella-dollar": `<path d="M5 30C5 15 17 5 32 5s27 10 27 25z"/><path d="M32 5c-7 6-9 15-9 25M32 5c7 6 9 15 9 25"/><path d="M32 30v21a5 5 0 0 1-10 0"/>${dollar(47, 47, 0.62)}`,
    coins: `<ellipse cx="26" cy="14" rx="17" ry="6"/><path d="M9 14v31c0 3.3 7.6 6 17 6M43 14v9"/><path d="M9 24.5c0 3.3 7.6 6 17 6s17-2.7 17-6M9 35c0 3.3 7.6 6 17 6"/><ellipse cx="45" cy="42" rx="8" ry="14" transform="rotate(-28 45 42)"/><ellipse cx="42" cy="44" rx="8" ry="14" transform="rotate(-28 42 44)"/>`,
    "doc-stamp": `<path d="M36 25V6H10v50h16"/><path d="M16 15h14M16 22h10M16 29h6"/><circle cx="44" cy="30" r="7"/><path d="M40.5 36.5 40 44M47.5 36.5 48 44"/><rect x="30" y="44" width="28" height="7" rx="2"/><path d="M28 57h32"/>`,
    "coin-growth": `<circle cx="24" cy="21" r="14"/>${dollar(24, 21, 0.85)}<path d="M6 57l13-11 8 6 13-15 8 5 11-15"/><path d="M50 27h9v9"/>`,
    "shield-lock": `<path d="M32 5l21 8v16c0 14-9 24-21 30C20 53 11 43 11 29V13z"/><rect x="22" y="29" width="20" height="14" rx="2.5"/><path d="M25.5 29v-4.5a6.5 6.5 0 0 1 13 0V29"/>`,
    "monitor-check": `<rect x="12" y="8" width="46" height="34" rx="3"/><path d="M35 42v10M24 54h22"/><path d="M28 19h22M28 26h22M28 33h16"/><path d="M4 23l7 7 12-14"/>`,
    "network-dollar": `<circle cx="13" cy="13" r="7"/><circle cx="51" cy="13" r="7"/><circle cx="13" cy="51" r="7"/><circle cx="51" cy="51" r="7"/><path d="M18 18l6 6M46 18l-6 6M18 46l6-6M46 46l-6-6"/>${dollar(32, 32, 1)}`,
    "shield-dollar": `<path d="M32 5l21 8v16c0 14-9 24-21 30C20 53 11 43 11 29V13z"/>${dollar(32, 30, 1.05)}`,
    scroll: `<path d="M18 8h32v38"/><path d="M18 8a5 5 0 0 0-10 0v5h10"/><path d="M18 8v42a7 7 0 0 0 7 7h26a7 7 0 0 0 7-7v-4H32v4a7 7 0 0 1-7 7"/><path d="M26 19h16M26 27h16M26 35h10"/>`,
    exchange: `<path d="M10 24V11h30"/><path d="M34 5l6 6-6 6"/><path d="M54 40v13H24"/><path d="M30 59l-6-6 6-6"/>${dollar(18, 42, 0.75)}<path d="M55 15.5a8 8 0 1 0 0 11"/><path d="M42 19h10M42 23h10"/>`,
    target: `<circle cx="28" cy="36" r="22"/><circle cx="28" cy="36" r="14"/><circle cx="28" cy="36" r="5"/><path d="M28 36 52 12"/><path d="M52 12l-1-9M52 12l9 1M47 17l-1-9M47 17l9 1"/>`,
    "grad-cap": `<path d="M32 10 4 24l28 14 28-14z"/><path d="M15 30v11c0 4 7.6 9 17 9s17-5 17-9V30"/><path d="M56 26v15"/><path d="M53 48l3-7 3 7z"/>`,
    "phone-dollar": `<rect x="17" y="4" width="30" height="56" rx="4"/><path d="M17 12h30M17 50h30"/>${dollar(32, 31, 1)}<circle cx="32" cy="55" r="1.4" fill="currentColor"/>`,
    books: `<path d="M8 28 32 16l24 12-24 12z"/><path d="M8 28v8l24 12 24-12v-8"/><path d="M8 36v8l24 12 24-12v-8"/><path d="M27 23l13 6"/>`,
    "doc-check": `<path d="M46 26V8H12v48h24"/><path d="M19 18h20M19 26h14"/><circle cx="23" cy="42" r="5"/><path d="M36 42l7 7 15-17"/>`,
    student: `<path d="M32 5 12 13l20 8 20-8z"/><path d="M52 13v10"/><path d="M52 23l-2 5h4z"/><circle cx="32" cy="31" r="9"/><path d="M12 58a20 20 0 0 1 40 0z"/>`,
    piggy: `<path d="M51 31c0-9-9.4-16-21-16S9 22 9 31c0 6 3 10.5 8 13.5V52h8v-4h10v4h8v-7.5c2-1.3 3.5-3 4.5-5H53V29h-4c-.7-2-2-3.8-3.5-5.3l2-6.2c-3 0-5.8 1.2-7.3 3"/><circle cx="42" cy="28" r="1.6" fill="currentColor"/><path d="M24 22h10"/>`,
    certificate: `<rect x="8" y="8" width="48" height="36" rx="2"/><path d="M16 18h32M16 26h14"/><circle cx="41" cy="35" r="7"/><path d="M37 41l-3 14 7-4 7 4-3-14"/>`,
    house: `<path d="M8 32 32 12l24 20"/><path d="M14 27v27h36V27"/><path d="M27 54V40h10v14"/><path d="M50 6l1.8 4.2L56 12l-4.2 1.8L50 18l-1.8-4.2L44 12l4.2-1.8z"/>`,
    scales: `<path d="M32 8v48M20 56h24M10 16h44"/><path d="M10 16 3 33a7 7 0 0 0 14 0z"/><path d="M54 16l-7 17a7 7 0 0 0 14 0z"/>`,
    "chart-up": `<path d="M6 57h52"/><path d="M12 57V41h8v16M28 57V31h8v16M44 57V21h8v36"/><path d="M8 32 22 19l10 6L52 7"/><path d="M44 7h8v8"/>`,
    rocket: `<path d="M24 40 17 33C23 17 36 7 57 7c0 21-10 34-26 40z"/><circle cx="41" cy="23" r="5"/><path d="M17 33l-9 1 6-10 10-2M31 47l-1 9 10-6 2-10"/><path d="M19 45l-9 9M15 41l-6 6M23 49l-6 6"/>`,
    play: `<circle cx="32" cy="32" r="26"/><path d="M26 21l17 11-17 11z"/>`,
    check: `<path d="M12 33l13 13 27-28"/>`,
    "check-circle": `<circle cx="32" cy="32" r="24"/><path d="M21 33l8 8 15-17"/>`,
    clock: `<circle cx="32" cy="32" r="24"/><path d="M32 18v14l10 6"/>`,
    arrow: `<path d="M12 32h40M38 18l14 14-14 14"/>`,
    "arrow-left": `<path d="M52 32H12M26 18 12 32l14 14"/>`,
    external: `<path d="M36 10h18v18"/><path d="M54 10 28 36"/><path d="M46 38v14a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V24a4 4 0 0 1 4-4h14"/>`,
    user: `<circle cx="32" cy="22" r="11"/><path d="M11 57a21 21 0 0 1 42 0"/>`,
    logout: `<path d="M26 10H14a4 4 0 0 0-4 4v36a4 4 0 0 0 4 4h12"/><path d="M42 20l12 12-12 12M54 32H24"/>`,
    menu: `<path d="M10 18h44M10 32h44M10 46h44"/>`,
    close: `<path d="M16 16l32 32M48 16 16 48"/>`,
    sprout: `<path d="M32 58V30"/><path d="M32 36c-13 0-20-8-20-20 13 0 20 8 20 20z"/><path d="M32 30c0-12 7-20 20-20 0 12-7 20-20 20z"/>`,
    book: `<path d="M32 16C26 11 16 10 8 12v38c8-2 18-1 24 4 6-5 16-6 24-4V12c-8-2-18-1-24 4z"/><path d="M32 16v38"/>`,
    list: `<path d="M24 16h30M24 32h30M24 48h30"/><circle cx="12" cy="16" r="3"/><circle cx="12" cy="32" r="3"/><circle cx="12" cy="48" r="3"/>`,
    bulb: `<path d="M24 46h16M26 54h12"/><path d="M24 46c0-6-10-10-10-22a18 18 0 0 1 36 0c0 12-10 16-10 22"/>`,
    pencil: `<path d="M42 8l14 14-32 32H10V40z"/><path d="M36 14l14 14"/>`,
    quiz: `<circle cx="32" cy="32" r="24"/><path d="M25 25a7 7 0 1 1 10 6.3c-2 1-3 2.5-3 4.7v2"/><circle cx="32" cy="45" r="1.6" fill="currentColor"/>`,
    tag: `<path d="M8 8h22l26 26-22 22L8 30z"/><circle cx="20" cy="20" r="4"/>`,
    mail: `<rect x="6" y="14" width="52" height="36" rx="4"/><path d="M6 18l26 18 26-18"/>`,
    phone: `<path d="M22 8H14a4 4 0 0 0-4 4c0 23 19 42 42 42a4 4 0 0 0 4-4v-8l-11-5-6 6c-7-3-13-9-16-16l6-6z"/>`,
  };

  function icon(name, cls = "") {
    const body = ICONS[name] || ICONS.tag;
    return `<svg class="icon ${cls}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  // ---------- Course metadata ----------
  const COURSES = {
    life: {
      id: "life",
      title: "Өмірге қажетті қаржы",
      heading: "Өмірге қажетті қаржы бөлімі",
      tagline: "Қаржылық білім — саналы шешімдердің негізі.",
      desc: "Күнделікті өмірге қажет болатын қаржылық дағдылар мен білім",
      icon: "target",
      icons: {
        negizder: "doc-dollar", "tabys-shygys": "wallet", bank: "bank", nesie: "calculator", zhinaq: "umbrella-dollar",
        saqtandyru: "coins", salyq: "doc-stamp", investitsiya: "coin-growth", qauipsizdik: "shield-lock",
      },
    },
    pro: {
      id: "pro",
      title: "Кәсіби қаржы",
      heading: "Кәсіби қаржы",
      tagline: "Компаниялар мен қаржы нарықтарындағы күрделі қаржылық шешімдерді түсінуге арналған білім.",
      desc: "Қаржы саласының негізгі бағыттарын және мамандықтарын зерттеңіз",
      icon: "grad-cap",
      icons: {
        "qarzhy-zhuiesi": "monitor-check", eseptilik: "network-dollar", zhosparlau: "shield-dollar", zhobalar: "scroll",
        kapital: "exchange", korporativtik: "coins", tauekel: "doc-stamp", investitsiya: "coin-growth", "baghaly-qaghazdar": "shield-lock",
      },
    },
  };

  const courseCache = {};
  function loadCourse(id) {
    if (!COURSES[id]) return Promise.reject(new Error("course"));
    const get = (file) => fetch(`/data/${file}.json`).then((r) => {
      if (!r.ok) throw new Error("data");
      return r.json();
    });
    courseCache[id] ||= LANG === "ru" ? get(`${id}.ru`).catch(() => get(id)) : get(id);
    return courseCache[id];
  }

  // ---------- API ----------
  async function api(path, body) {
    const opts = body === undefined
      ? { credentials: "same-origin" }
      : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const res = await fetch(path, opts);
    let data = {};
    try { data = await res.json(); } catch { /* бос жауап */ }
    if (!res.ok) throw Object.assign(new Error(data.error || "Қате орын алды"), { status: res.status });
    return data;
  }

  let mePromise = null;
  function me(force) {
    if (force || !mePromise) {
      mePromise = api("/api/me").catch(() => ({ user: null }));
    }
    return mePromise;
  }

  async function logout() {
    try { await api("/api/logout", {}); } catch { /* ignore */ }
    location.href = "/";
  }

  // ---------- Helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const qs = (k) => new URLSearchParams(location.search).get(k);

  let toastTimer;
  function toast(msg, isError) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.toggle("is-error", !!isError);
    el.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-show"), 3200);
  }

  function renderIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach((el) => {
      el.innerHTML = icon(el.dataset.icon, el.dataset.iconClass || "");
      el.removeAttribute("data-icon");
    });
  }

  function videoBlock(title) {
    return `
      <section class="video-block reveal" aria-label="Бейнесабақ">
        <div class="vb-ic">${icon("play")}</div>
        <div>
          <h3>${esc(title || "Бейнесабақтар — MOOC курсы")}</h3>
          <p>Тақырыптар бойынша толық бейнесабақтар Л.Н. Гумилев атындағы ЕҰУ-дың MOOC платформасында.</p>
          <a class="url" href="${MOOC_URL}" target="_blank" rel="noopener">${MOOC_URL.replace("https://", "")}</a>
        </div>
        <a class="btn btn-orange" href="${MOOC_URL}" target="_blank" rel="noopener">${icon("play")} Бейнесабақты көру</a>
      </section>`;
  }

  // ---------- Header / Footer ----------
  const NAV = [
    { href: "/#home", id: "home", label: "Басты бет" },
    { href: "/#learn", id: "learn", label: "Қаржыны үйрену" },
    { href: "/#world", id: "world", label: "Қаржы әлемі" },
    { href: "/#about", id: "about", label: "QARZHЫ туралы" },
  ];

  function logoHtml() {
    return `<a class="logo" href="/" aria-label="QARZHЫ — басты бет"><img class="logo-mark" src="/img/logo-mark.png" alt="" width="202" height="192"><img class="logo-word" src="/img/logo-word.png" alt="QARZHЫ" width="518" height="96"></a>`;
  }

  function renderHeader() {
    const host = document.getElementById("site-header");
    if (!host) return;
    const page = document.body.dataset.page || "";
    host.className = "site-header";
    host.innerHTML = `
      <div class="container">
        <nav class="nav-shell" aria-label="Негізгі мәзір">
          ${logoHtml()}
          <ul class="nav-links" id="nav-links">
            ${NAV.map((n) => `<li><a href="${n.href}" data-nav="${n.id}" class="${page === "course" && n.id === "learn" ? "is-active" : ""}">${n.label}</a></li>`).join("")}
            <li class="nav-lang-mobile">${langSwitch()}</li>
          </ul>
          <div class="nav-actions">
            <span class="nav-lang">${langSwitch()}</span>
            <span id="nav-actions"><a class="btn btn-orange btn-dot" href="/start">Бастау</a></span>
          </div>
          <button class="nav-toggle" type="button" aria-label="Мәзір" aria-expanded="false" aria-controls="nav-links">${icon("menu")}</button>
        </nav>
      </div>`;

    bindLangSwitch(host);
    const toggle = host.querySelector(".nav-toggle");
    toggle.addEventListener("click", () => {
      const open = host.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.innerHTML = icon(open ? "close" : "menu");
    });
    host.querySelectorAll(".nav-links a").forEach((a) =>
      a.addEventListener("click", () => {
        host.classList.remove("is-open");
        toggle.innerHTML = icon("menu");
      })
    );

    const onScroll = () => host.classList.toggle("is-scrolled", window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    me().then(({ user }) => {
      if (!user) return;
      const initial = esc(user.name.trim().charAt(0).toUpperCase());
      document.getElementById("nav-actions").innerHTML = `
        <a class="nav-user" href="/cabinet" title="Жеке кабинет"><span class="avatar">${initial}</span><span>Кабинет</span></a>`;
    });
  }

  function renderFooter() {
    const host = document.getElementById("site-footer");
    if (!host) return;
    host.className = "site-footer";
    host.innerHTML = `
      <div class="container">
        <div class="footer-grid">
          <div>
            ${logoHtml()}
            <p>Қаржылық сауаттылық пен кәсіби бағыттауға арналған цифрлық білім беру платформасы.</p>
          </div>
          <div>
            <h5>Бөлімдер</h5>
            <ul>${NAV.map((n) => `<li><a href="${n.href}">${n.label}</a></li>`).join("")}<li><a href="/#team">Жоба құрастырушылары</a></li><li><a href="/start">Бастау</a></li></ul>
          </div>
          <div>
            <h5>Оқу бағыттары</h5>
            <ul>
              <li><a href="/course?c=life">Өмірге қажетті қаржы</a></li>
              <li><a href="/course?c=pro">Кәсіби қаржы</a></li>
              <li><a href="/cabinet">Жеке кабинет</a></li>
            </ul>
          </div>
          <div>
            <h5>Бейнекурс</h5>
            <a class="footer-video" href="${MOOC_URL}" target="_blank" rel="noopener">${icon("play")} MOOC — ЕҰУ</a>
            <h5 style="margin-top:26px">Байланыс</h5>
            <ul>
              <li><a href="tel:+77023256999">8 702 325 69 99</a></li>
              <li><a href="tel:+77089110529">8 708 911 05 29</a></li>
              <li><a href="tel:+77054865127">8 705 486 51 27</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} QARZHЫ. Қаржылық білім — жақсы болашақ кепілі.</span>
          <span>Сайттағы ақпарат білім беру мақсатында берілген және қаржылық кеңес болып табылмайды.</span>
        </div>
      </div>`;
  }

  // ---------- Reveal on scroll ----------
  function initReveal(root = document) {
    const els = root.querySelectorAll(".reveal:not(.is-visible)");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      }),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => io.observe(el));
  }

  // ---------- Modal ----------
  function openModal(html, onReady, wide) {
    let modal = document.getElementById("modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modal";
      modal.className = "modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      document.body.appendChild(modal);
      modal.addEventListener("click", (e) => { if (e.target === modal || e.target.closest(".modal-close")) closeModal(); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
    }
    modal.innerHTML = `<div class="modal-box ${wide ? "wide" : ""}">${html}<button class="modal-close" type="button" aria-label="Жабу">${icon("close")}</button></div>`;
    requestAnimationFrame(() => modal.classList.add("is-open"));
    document.body.style.overflow = "hidden";
    onReady && onReady(modal);
    modal.querySelector(".modal-close").focus({ preventScroll: true });
  }
  function closeModal() {
    const modal = document.getElementById("modal");
    if (!modal) return;
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  window.QZ = { LANG, tr, MOOC_URL, COURSES, icon, loadCourse, api, me, logout, esc, qs, toast, renderIcons, videoBlock, initReveal, openModal, closeModal };

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-lang-switch]").forEach((el) => { el.innerHTML = langSwitch(); bindLangSwitch(el); });
    renderHeader();
    renderFooter();
    renderIcons();
    initReveal();
  });
})();
