// QARZHЫ — оқу бағыты беті (тақырыптар тізімі)
(function () {
  "use strict";
  const { COURSES, MOOC_URL, icon, esc, qs, loadCourse, me, api, toast, videoBlock, initReveal } = window.QZ;

  document.addEventListener("DOMContentLoaded", async () => {
    const id = COURSES[qs("c")] ? qs("c") : "life";
    const meta = COURSES[id];

    document.title = `${meta.title} — QARZHЫ`;
    document.getElementById("course-hero").classList.add(id);
    document.getElementById("crumb-title").textContent = meta.title;
    document.getElementById("course-title").textContent = meta.heading;
    document.getElementById("course-lead").textContent = meta.tagline;
    document.getElementById("course-icon").innerHTML = icon(meta.icon);
    document.getElementById("video-slot").innerHTML = videoBlock(`${meta.title} — бейнесабақтар`);
    initReveal();

    let data;
    try {
      data = await loadCourse(id);
    } catch {
      document.getElementById("topic-grid").innerHTML = `<p>Деректерді жүктеу мүмкін болмады. Бетті жаңартып көріңіз.</p>`;
      return;
    }
    const topics = data.topics;
    const minutes = topics.reduce((s, t) => s + (t.minutes || 0), 0);
    const questions = topics.reduce((s, t) => s + (t.quiz?.length || 0), 0);

    document.getElementById("course-stats").innerHTML = `
      <span>${icon("list")} ${topics.length} тақырып</span>
      <span>${icon("clock")} ≈ ${(Math.round(minutes / 6) / 10).toLocaleString("ru-RU")} сағат</span>
      <span>${icon("quiz")} ${questions} тест сұрағы</span>
      <span>${icon("play")} MOOC бейнесабақтар</span>`;

    const { user, enrollments = [], progress = [] } = await me();
    const done = new Set(progress.filter((p) => p.course === id).map((p) => p.topic));

    renderGrid(id, topics, done);
    renderActions(id, topics, user, enrollments.includes(id), done);
    initReveal();
  });

  function renderGrid(id, topics, done) {
    const icons = COURSES[id].icons;
    document.getElementById("topic-grid").innerHTML = topics.map((t, i) => `
      <article class="topic-card ${id} reveal ${done.has(t.slug) ? "is-done" : ""}">
        <span class="num">${String(i + 1).padStart(2, "0")}</span>
        <span class="done-badge">${icon("check")} Өтті</span>
        <div class="tc-ic">${icon(icons[t.slug] || "book")}</div>
        <h3><a class="stretched" href="${MOOC_URL}" target="_blank" rel="noopener" title="MOOC платформасында сабаққа кіру">${esc(t.title)}</a></h3>
        <p>${esc(t.summary)}</p>
        <div class="tc-meta"><span class="meta-inline">${icon("clock")} ${t.minutes} мин</span><span class="meta-inline">${icon("quiz")} ${t.quiz.length} сұрақ</span></div>
        <div class="tc-foot">
          <span class="go">Сабаққа кіру ${icon("external")}</span>
          <a class="notes" href="/topic?c=${id}&t=${t.slug}">${icon("book")} Конспект · Тест</a>
        </div>
      </article>`).join("");
  }

  function renderActions(id, topics, user, enrolled, done) {
    const box = document.getElementById("course-actions");
    const next = topics.find((t) => !done.has(t.slug)) || topics[0];
    const here = `/course?c=${id}`;

    if (!user) {
      box.innerHTML = `
        <a class="btn btn-orange btn-lg" href="/start?next=${encodeURIComponent(here)}">Курсты алу ${icon("arrow")}</a>
        <a class="btn btn-ghost btn-lg" href="${MOOC_URL}" target="_blank" rel="noopener">${icon("play")} Бейнекурс</a>`;
      return;
    }
    if (!enrolled) {
      box.innerHTML = `
        <button class="btn btn-orange btn-lg" type="button" id="enroll-btn">Курсты алу ${icon("arrow")}</button>
        <a class="btn btn-ghost btn-lg" href="${MOOC_URL}" target="_blank" rel="noopener">${icon("play")} Бейнекурс</a>`;
      const btn = document.getElementById("enroll-btn");
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await api("/api/enroll", { course: id });
          toast("Курс жеке кабинетке қосылды!");
          await me(true);
          renderActions(id, topics, user, true, done);
        } catch (err) {
          toast(err.message, true);
          btn.disabled = false;
        }
      });
      return;
    }
    const pct = Math.round((done.size / topics.length) * 100);
    box.innerHTML = `
      <div class="progress-box">
        <small><span>Прогресс</span><span>${done.size} / ${topics.length}</span></small>
        <div class="progress"><i style="width:${pct}%"></i></div>
      </div>
      <a class="btn btn-white btn-lg" href="/topic?c=${id}&t=${next.slug}">${done.size ? "Жалғастыру" : "Бастау"} ${icon("arrow")}</a>`;
  }
})();
