// QARZHЫ — тақырып беті: конспект, тест, прогресс
(function () {
  "use strict";
  const { COURSES, LANG, MOOC_URL, icon, esc, qs, loadCourse, me, api, toast, videoBlock, initReveal } = window.QZ;

  let state = { id: null, topic: null, topics: [], user: null, done: new Set(), quizScore: null };

  document.addEventListener("DOMContentLoaded", async () => {
    const id = COURSES[qs("c")] ? qs("c") : "life";
    const meta = COURSES[id];
    document.getElementById("topic-hero").classList.add(id);
    document.getElementById("topic-root").classList.toggle("pro-theme", id === "pro");

    let data;
    try {
      data = await loadCourse(id);
    } catch {
      document.getElementById("article").innerHTML = `<div class="block"><p>Деректерді жүктеу мүмкін болмады. Бетті жаңартып көріңіз.</p></div>`;
      return;
    }
    const topics = data.topics;
    const index = Math.max(0, topics.findIndex((t) => t.slug === qs("t")));
    const topic = topics[index];

    const { user, progress = [] } = await me();
    state = {
      id, topic, topics, user,
      done: new Set(progress.filter((p) => p.course === id).map((p) => p.topic)),
      quizScore: null,
    };

    document.title = `${topic.title} — QARZHЫ`;
    document.getElementById("topic-crumbs").insertAdjacentHTML(
      "beforeend",
      `<span class="sep">/</span><a href="/course?c=${id}">${esc(meta.title)}</a>`
    );
    document.getElementById("topic-title").textContent = topic.title;
    document.getElementById("topic-lead").textContent = topic.summary;
    document.getElementById("topic-icon").innerHTML = icon(meta.icons[topic.slug] || "book");
    document.getElementById("topic-stats").innerHTML = `
      <span>${icon("list")} ${index + 1}-тақырып / ${topics.length}</span>
      <span>${icon("clock")} ${topic.minutes} мин</span>
      <span>${icon("quiz")} ${topic.quiz.length} сұрақ</span>`;
    document.getElementById("topic-actions").innerHTML = `
      <a class="btn btn-orange btn-lg" href="${MOOC_URL}" target="_blank" rel="noopener">${icon("play")} Сабаққа кіру (MOOC)</a>
      <a class="btn btn-ghost btn-lg" href="#quiz">Тест тапсыру</a>`;

    renderArticle(index);
    renderSidebar();
    document.getElementById("video-slot").innerHTML = videoBlock(`Бейнесабақ: ${topic.title}`);
    initReveal();
  });

  function renderArticle(index) {
    const { id, topic, topics } = state;
    const prev = topics[index - 1];
    const next = topics[index + 1];
    const tools = {
      nesie: { market: "credit", kk: "Несие төлемдерін салыстыру", ru: "Сравнить платежи по кредитам" },
      zhinaq: { market: "deposit", kk: "Депозит кірісін салыстыру", ru: "Сравнить доход по депозитам" },
    };
    const tool = id === "life" && tools[topic.slug];

    document.getElementById("article").innerHTML = `
      <div class="block reveal">
        <h2 class="block-title"><span class="bt-ic">${icon("target")}</span>Сабақ мақсаты</h2>
        <ul class="goals">${topic.goals.map((g) => `<li>${icon("check-circle")}<span>${esc(g)}</span></li>`).join("")}</ul>
      </div>

      <div class="block reveal">
        <h2 class="block-title"><span class="bt-ic">${icon("book")}</span>Конспект</h2>
        ${topic.sections.map((s) => `
          <div class="lesson-section">
            <h3>${esc(s.heading)}</h3>
            <p>${esc(s.text)}</p>
            ${s.points?.length ? `<ul>${s.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
          </div>`).join("")}
      </div>

      <div class="block reveal">
        <h2 class="block-title"><span class="bt-ic">${icon("tag")}</span>Негізгі ұғымдар</h2>
        <div class="terms">${topic.terms.map((t) => `<div class="term"><b>${esc(t.term)}</b><span>${esc(t.def)}</span></div>`).join("")}</div>
      </div>

      <div class="block example reveal">
        <h2 class="block-title"><span class="bt-ic">${icon("calculator")}</span>Мысал: ${esc(topic.example.title)}</h2>
        <p>${esc(topic.example.text)}</p>
      </div>

      <div class="block reveal">
        <h2 class="block-title"><span class="bt-ic">${icon("bulb")}</span>Пайдалы кеңестер</h2>
        <ol class="tips">${topic.tips.map((t) => `<li><span>${esc(t)}</span></li>`).join("")}</ol>
      </div>

      <div class="block practice reveal">
        <h2 class="block-title"><span class="bt-ic">${icon("pencil")}</span>Практикалық тапсырма</h2>
        <p>${esc(topic.practice)}</p>
        ${tool ? `<a class="btn btn-green practice-tool" href="/?lang=${LANG}&amp;market=${tool.market}#world">${icon("calculator")}${tool[LANG]}</a>` : ""}
      </div>

      <div class="block reveal" id="quiz">
        <h2 class="block-title"><span class="bt-ic">${icon("quiz")}</span>Өзіңді тексер</h2>
        <form class="quiz" id="quiz-form">
          ${topic.quiz.map((q, qi) => `
            <fieldset class="quiz-q" style="border:0;margin:0;padding-left:0;padding-right:0">
              <b>${qi + 1}. ${esc(q.q)}</b>
              <div class="quiz-opts">
                ${q.options.map((o, oi) => `
                  <label class="quiz-opt" data-q="${qi}" data-o="${oi}">
                    <input type="radio" name="q${qi}" value="${oi}" required>
                    <span>${esc(o)}</span>
                  </label>`).join("")}
              </div>
              <div class="quiz-explain">${esc(q.explain)}</div>
            </fieldset>`).join("")}
          <div class="quiz-result" id="quiz-result" role="status"></div>
          <div class="quiz-actions">
            <button class="btn btn-green" type="submit">${icon("check")} Тексеру</button>
            <button class="btn btn-outline" type="button" id="quiz-reset" hidden>Қайта тапсыру</button>
          </div>
        </form>
      </div>

      <div class="block reveal" id="complete-block"></div>

      <nav class="pager" aria-label="Тақырыптар">
        ${prev ? `<a class="prev" href="/topic?c=${id}&t=${prev.slug}"><small>← Алдыңғы тақырып</small><b>${esc(prev.title)}</b></a>` : ""}
        ${next ? `<a class="next" href="/topic?c=${id}&t=${next.slug}"><small>Келесі тақырып →</small><b>${esc(next.title)}</b></a>`
               : `<a class="next" href="/course?c=${id}"><small>Барлық тақырыптар →</small><b>${esc(COURSES[id].title)}</b></a>`}
      </nav>`;

    bindQuiz();
    renderComplete();
  }

  function bindQuiz() {
    const form = document.getElementById("quiz-form");
    const result = document.getElementById("quiz-result");
    const reset = document.getElementById("quiz-reset");
    const quiz = state.topic.quiz;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (form.classList.contains("is-checked")) return;
      let score = 0;
      quiz.forEach((q, qi) => {
        const picked = form.querySelector(`input[name="q${qi}"]:checked`);
        const pickedIdx = picked ? Number(picked.value) : -1;
        if (pickedIdx === q.answer) score++;
        form.querySelectorAll(`.quiz-opt[data-q="${qi}"]`).forEach((opt) => {
          const oi = Number(opt.dataset.o);
          opt.classList.toggle("is-correct", oi === q.answer);
          opt.classList.toggle("is-wrong", oi === pickedIdx && oi !== q.answer);
        });
      });
      form.querySelectorAll("input").forEach((i) => (i.disabled = true));
      form.classList.add("is-checked");
      state.quizScore = score;

      const pct = Math.round((score / quiz.length) * 100);
      const msg = pct === 100 ? "Керемет! Барлық жауап дұрыс." : pct >= 50 ? "Жақсы нәтиже! Түсіндірмелерді қарап шығыңыз." : "Конспектіні тағы бір рет оқып, қайта тапсырып көріңіз.";
      result.innerHTML = `<span class="score">${score}/${quiz.length}</span><span>${msg}</span>`;
      result.classList.add("is-show");
      form.querySelector('[type="submit"]').hidden = true;
      reset.hidden = false;

      if (state.user && pct >= 50) saveProgress();
      else renderComplete();
    });

    reset.addEventListener("click", () => {
      form.reset();
      form.classList.remove("is-checked");
      form.querySelectorAll("input").forEach((i) => (i.disabled = false));
      form.querySelectorAll(".quiz-opt").forEach((o) => o.classList.remove("is-correct", "is-wrong"));
      result.classList.remove("is-show");
      form.querySelector('[type="submit"]').hidden = false;
      reset.hidden = true;
    });
  }

  function renderComplete() {
    const { id, topic, user, done } = state;
    const box = document.getElementById("complete-block");
    const isDone = done.has(topic.slug);
    const here = `/topic?c=${id}&t=${topic.slug}`;

    if (!user) {
      box.innerHTML = `
        <div class="complete-box">
          <div><h2 class="block-title" style="margin-bottom:6px"><span class="bt-ic">${icon("user")}</span>Прогресті сақтау</h2>
          <p>Тақырыпты аяқтап, тест нәтижесін жеке кабинетте сақтау үшін жүйеге кіріңіз.</p></div>
          <a class="btn btn-orange" href="/start?next=${encodeURIComponent(here)}">Кіру / Тіркелу ${icon("arrow")}</a>
        </div>`;
      return;
    }
    box.innerHTML = `
      <div class="complete-box ${isDone ? "is-done" : ""}">
        <div><h2 class="block-title" style="margin-bottom:6px"><span class="bt-ic">${icon(isDone ? "check-circle" : "doc-check")}</span>${isDone ? "Тақырып аяқталды" : "Тақырыпты аяқтау"}</h2>
        <p>${isDone ? "Жарайсыз! Нәтиже жеке кабинетте сақталды. Келесі тақырыпқа өтіңіз." : "Тестті 50%-дан жоғары тапсырсаңыз, тақырып автоматты түрде аяқталады. Немесе төмендегі батырманы басыңыз."}</p></div>
        ${isDone ? `<a class="btn btn-outline" href="/cabinet">Жеке кабинет ${icon("arrow")}</a>` : `<button class="btn btn-green" type="button" id="complete-btn">${icon("check")} Аяқтадым</button>`}
      </div>`;
    const btn = document.getElementById("complete-btn");
    if (btn) btn.addEventListener("click", () => { btn.disabled = true; saveProgress().finally(() => (btn.disabled = false)); });
  }

  async function saveProgress() {
    const { id, topic } = state;
    try {
      await api("/api/progress", {
        course: id,
        topic: topic.slug,
        quizScore: state.quizScore,
        quizTotal: state.quizScore == null ? null : topic.quiz.length,
      });
      state.done.add(topic.slug);
      await me(true);
      toast("Прогресс сақталды ✓");
      renderComplete();
      renderSidebar();
    } catch (err) {
      toast(err.message, true);
    }
  }

  function renderSidebar() {
    const { id, topic, topics, user, done } = state;
    const count = topics.filter((t) => done.has(t.slug)).length;
    const pct = Math.round((count / topics.length) * 100);
    document.getElementById("sidebar").innerHTML = `
      <div class="side-card">
        <h4>${esc(COURSES[id].title)}</h4>
        ${user ? `<div class="side-progress" style="margin-bottom:14px"><small><span>Прогресс</span><span>${count}/${topics.length}</span></small><div class="progress light"><i style="width:${pct}%"></i></div></div>` : ""}
        <ul class="side-list">
          ${topics.map((t, i) => `<li><a href="/topic?c=${id}&t=${t.slug}" class="${t.slug === topic.slug ? "is-current" : ""} ${done.has(t.slug) ? "is-done" : ""}"><span class="n">${done.has(t.slug) ? "✓" : i + 1}</span><span>${esc(t.title)}</span></a></li>`).join("")}
        </ul>
      </div>
      <div class="side-card">
        <h4>Бейнесабақ</h4>
        <p style="font-size:14px;color:var(--muted);margin-bottom:14px">Осы тақырып бойынша толық бейнесабақ MOOC платформасында.</p>
        <a class="btn btn-orange btn-sm" style="width:100%" href="${MOOC_URL}" target="_blank" rel="noopener">${icon("play")} Сабаққа кіру</a>
      </div>`;
  }
})();
