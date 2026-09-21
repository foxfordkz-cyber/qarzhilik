// QARZHЫ — жеке кабинет
(function () {
  "use strict";
  const { COURSES, icon, esc, loadCourse, me, api, toast, logout, videoBlock, renderIcons, initReveal } = window.QZ;

  document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("logout-btn").addEventListener("click", logout);
    document.getElementById("video-slot").innerHTML = videoBlock();
    initReveal();

    const { user } = await me();
    if (!user) {
      location.replace(`/start?next=${encodeURIComponent("/cabinet")}`);
      return;
    }
    document.getElementById("cab-avatar").textContent = user.name.trim().charAt(0).toUpperCase();
    document.getElementById("cab-title").textContent = `Сәлем, ${user.name.split(" ")[0]}!`;
    document.getElementById("cab-sub").textContent = user.email;

    const data = {};
    await Promise.all(Object.keys(COURSES).map(async (id) => { data[id] = await loadCourse(id).catch(() => ({ topics: [] })); }));
    render(data);
  });

  async function render(data) {
    const { enrollments = [], progress = [] } = await me();

    document.getElementById("cab-courses").innerHTML = Object.values(COURSES).map((c) => {
      const topics = data[c.id].topics;
      const done = new Set(progress.filter((p) => p.course === c.id).map((p) => p.topic));
      const enrolled = enrollments.includes(c.id);
      const count = topics.filter((t) => done.has(t.slug)).length;
      const pct = topics.length ? Math.round((count / topics.length) * 100) : 0;
      const next = topics.find((t) => !done.has(t.slug)) || topics[0];
      return `
        <article class="cab-course ${c.id}">
          <div class="cc-top">
            <span class="cc-ic">${icon(c.icon)}</span>
            <div>
              <h3>${esc(c.title)}</h3>
              <span class="status ${enrolled ? "on" : ""}">${enrolled ? `${icon("check")} Курс алынды` : "Курс алынбаған"}</span>
            </div>
          </div>
          <p class="cc-desc">${esc(c.desc)}</p>
          <div>
            <div class="prog-row"><span>Прогресс</span><span>${count} / ${topics.length} тақырып · ${pct}%</span></div>
            <div class="progress light"><i style="width:${pct}%"></i></div>
          </div>
          <div class="actions">
            ${enrolled
              ? `${next ? `<a class="btn btn-green" href="/topic?c=${c.id}&t=${next.slug}">${count ? "Жалғастыру" : "Бастау"} ${icon("arrow")}</a>` : ""}`
              : `<button class="btn btn-green" type="button" data-enroll="${c.id}">Курсты алу ${icon("arrow")}</button>`}
            <a class="btn btn-outline" href="/course?c=${c.id}">Тақырыптар</a>
          </div>
        </article>`;
    }).join("");

    document.querySelectorAll("[data-enroll]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await api("/api/enroll", { course: btn.dataset.enroll });
          await me(true);
          toast("Курс қосылды! Сәттілік!");
          render(data);
        } catch (err) {
          toast(err.message, true);
          btn.disabled = false;
        }
      })
    );

    const titleOf = (course, slug) => data[course]?.topics.find((t) => t.slug === slug)?.title || slug;
    const rows = [...progress].sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
    document.getElementById("cab-activity").innerHTML = rows.length
      ? `<table>
          <thead><tr><th>Тақырып</th><th class="hide-sm">Бағыт</th><th>Тест</th></tr></thead>
          <tbody>${rows.map((p) => `
            <tr>
              <td><a href="/topic?c=${p.course}&t=${p.topic}" style="font-weight:600">${esc(titleOf(p.course, p.topic))}</a></td>
              <td class="hide-sm">${esc(COURSES[p.course]?.title || p.course)}</td>
              <td>${p.quizTotal ? `<span class="score-pill">${p.quizScore}/${p.quizTotal}</span>` : "—"}</td>
            </tr>`).join("")}
          </tbody>
        </table>`
      : `<p class="empty">Әзірге аяқталған тақырып жоқ. Курсты алып, алғашқы сабақтан бастаңыз!</p>`;
    renderIcons();
  }
})();
