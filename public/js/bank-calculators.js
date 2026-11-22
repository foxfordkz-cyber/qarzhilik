const LIMITS = {
  amount: { min: 1, max: 10_000_000_000 },
  contribution: { min: 0, max: 100_000_000 },
  rate: { min: 0, max: 100 },
  months: { min: 1, max: 360 },
};

function valid(key, value) {
  const { min, max } = LIMITS[key];
  return Number.isFinite(value) && value >= min && value <= max && (key !== "months" || Number.isInteger(value));
}

export function calculateBankScenario(kind, { amount, rate, months, contribution = 0 }) {
  if (!valid("amount", amount) || !valid("rate", rate) || !valid("months", months)) return null;
  const monthlyRate = rate / 1200;

  if (kind === "loan") {
    const payment = monthlyRate === 0 ? amount / months : amount * monthlyRate / -Math.expm1(-months * Math.log1p(monthlyRate));
    const total = payment * months;
    return { payment, total, interest: Math.max(0, total - amount) };
  }

  if (kind !== "deposit" || !valid("contribution", contribution)) return null;
  let balance = amount;
  for (let month = 0; month < months; month++) {
    balance += balance * monthlyRate + contribution;
  }
  const invested = amount + months * contribution;
  const effective = 100 * Math.expm1(12 * Math.log1p(monthlyRate));
  return { balance, invested, interest: balance - invested, effective };
}

// Each scenario uses the same principal. Deposit top-ups are made after interest is credited.
export function bankCalculator(kind, defaults) {
  const t = (kk, ru) => window.QZ.LANG === "ru" ? ru : kk;
  const deposit = kind === "deposit";
  const locale = window.QZ.LANG === "ru" ? ["ru-KZ"] : ["kk-KZ", "ru-KZ"];
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const formatRate = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  function field(key, label, value) {
    const { min, max } = LIMITS[key];
    const step = key === "months" ? "1" : "any";
    return `<label class="bc-field"><span>${label}</span><input type="number" name="${key}" min="${min}" max="${max}" step="${step}" required value="${value}"></label>`;
  }

  const outputs = deposit ? [
    ["balance", t("Мерзім соңындағы жинақ", "Накопления к концу срока")],
    ["invested", t("Салған ақшаңыз", "Ваши взносы")],
    ["interest", t("Пайыздық табыс", "Доход по процентам")],
    ["effective", t("Тиімді жылдық мөлшерлеме", "Эффективная годовая ставка")],
  ] : [
    ["payment", t("Ай сайынғы төлем", "Ежемесячный платёж")],
    ["total", t("Барлық төлем", "Всего к выплате")],
    ["interest", t("Артық төлем", "Переплата")],
  ];
  const comparisonLabel = t("Екі нұсқаны салыстыру", "Сравнить два варианта");
  const scenario = (variant, rate, months) => `
    <fieldset class="bc-scenario" data-variant="${variant}"${variant === "B" ? " hidden" : ""}>
      <legend>${t(`${variant} нұсқасы`, `Вариант ${variant}`)}</legend>
      <div class="bc-inputs">
        ${field("rate", t("Номиналды мөлшерлеме, %", "Номинальная ставка, %"), rate)}
        ${field("months", t("Мерзім, ай", "Срок, мес."), months)}
      </div>
      <dl class="bc-totals">${outputs.map(([key, label]) => `<div><dt>${label}</dt><dd data-result="${key}">—</dd></div>`).join("")}</dl>
    </fieldset>`;

  const html = `<section class="bc-panel bc-${kind}" aria-labelledby="bc-title">
    <h4 id="bc-title">${defaults.heading || (deposit ? t("Депозит калькуляторы", "Калькулятор депозита") : t("Несие калькуляторы", "Кредитный калькулятор"))}</h4>
    <p class="bc-note">${deposit
      ? t("Мысал үшін алынған жылдық мөлшерлемені өзгерте аласыз. Пайыз ай сайын есептеледі, толықтыру ай соңында қосылады.", "Годовую ставку из примера можно изменить. Проценты начисляются ежемесячно, пополнение вносится в конце месяца.")
      : t("Мысал үшін алынған жылдық мөлшерлемені өзгерте аласыз. Ай сайынғы төлем бірдей. Есепке комиссия мен сақтандыру кірмейді.", "Годовую ставку из примера можно изменить. Платежи равные каждый месяц. Расчёт без комиссий и страховки.")}</p>
    <div class="bc-shared">
      ${field("amount", deposit ? t("Бастапқы салым, ₸", "Начальный вклад, ₸") : t("Несие сомасы, ₸", "Сумма кредита, ₸"), defaults.amount)}
      ${deposit ? field("contribution", t("Ай сайынғы толықтыру, ₸", "Пополнение в месяц, ₸"), 0) : ""}
    </div>
    <div class="bc-scenarios">
      ${scenario("A", defaults.rate, defaults.months)}
      ${scenario("B", defaults.rate, defaults.compareMonths)}
    </div>
    <button type="button" class="bc-toggle" aria-controls="bc-comparison" aria-expanded="false">${comparisonLabel}</button>
    <p class="bc-difference" aria-live="polite" hidden></p>
    <p class="bc-invalid" role="status" hidden></p>
  </section>`;

  function bind(modal) {
    const panel = modal.querySelector(".bc-panel");
    const variants = [...panel.querySelectorAll("[data-variant]")];
    const toggle = panel.querySelector(".bc-toggle");
    const difference = panel.querySelector(".bc-difference");
    const error = panel.querySelector(".bc-invalid");
    variants[1].id = "bc-comparison";
    function update() {
      const shared = panel.querySelector(".bc-shared");
      const amount = shared.querySelector("[name=amount]").valueAsNumber;
      const contribution = shared.querySelector("[name=contribution]")?.valueAsNumber ?? 0;
      const results = variants.filter((card) => !card.hidden).map((card) => {
        const rate = card.querySelector("[name=rate]").valueAsNumber;
        const months = card.querySelector("[name=months]").valueAsNumber;
        const result = calculateBankScenario(kind, { amount, contribution, rate, months });
        for (const [key] of outputs) {
          let display = "—";
          if (result) display = key === "effective" ? `${formatRate.format(result[key])}%` : `${format.format(result[key])} ₸`;
          card.querySelector(`[data-result="${key}"]`).textContent = display;
        }
        return result;
      });
      const bad = [...panel.querySelectorAll("input")].find((input) => !input.closest("[hidden]") && !input.validity.valid);
      error.hidden = !bad;
      if (bad) error.textContent = t(
        `«${bad.labels[0].textContent}» өрісіне ${format.format(bad.min)}–${format.format(bad.max)} аралығындағы ${bad.name === "months" ? "бүтін " : ""}санды енгізіңіз.`,
        `В поле «${bad.labels[0].textContent}» введите ${bad.name === "months" ? "целое " : ""}число от ${format.format(bad.min)} до ${format.format(bad.max)}.`
      );
      difference.hidden = results.length !== 2 || results.some((result) => !result);
      if (!difference.hidden) {
        const delta = Math.round(results[1].interest) - Math.round(results[0].interest);
        const label = deposit ? t("Пайыздық табыс айырмасы", "Разница в доходе") : t("Артық төлем айырмасы", "Разница в переплате");
        difference.textContent = `${label} (B − A) · ${delta > 0 ? "+" : ""}${format.format(delta)} ₸`;
      }
    }
    toggle.addEventListener("click", () => {
      const second = variants[1];
      second.hidden = !second.hidden;
      toggle.setAttribute("aria-expanded", String(!second.hidden));
      toggle.textContent = second.hidden ? comparisonLabel : t("Салыстыруды жабу", "Скрыть сравнение");
      update();
      if (!second.hidden) second.querySelector("input").focus();
    });
    panel.addEventListener("input", update);
    update();
  }
  return { html, bind };
}
