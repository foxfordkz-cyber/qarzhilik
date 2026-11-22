import { classifyExpense } from './family-model.js';
import { wholeTenge, readExpenses, planBudget } from './family-budget.js';

const labels = {
  kk: {
    home: 'Басты бет',
    title: 'Отбасы бюджеті', intro: 'Бір айға кіріс пен шығынды жоспарлаңыз. ЖИ шығындарды санаттарға бөледі, ал жоспар мақсатыңызға қанша ақша қалатынын көрсетеді.',
    planHeading:'Айлық жоспар', income:'Отбасының айлық кірісі', goal:'Мақсатқа әлі қажет сома', months:'Мақсатқа дейінгі ай саны', monthUnit:'ай',
    expensesHeading:'Жоспарланған шығындар', hint:'Әр жолға атауын және сомасын бүтін теңгемен жазыңыз. Шығын болмаса, бос қалдырыңыз.',
    privacy:'Есептеу осы құрылғыда жүреді. Енгізген қаржы деректеріңіз сақталмайды.',
    sample:'Отбасы мысалын енгізу', calculate:'Жоспарды есептеу', resultTitle:'Бір айға арналған нәтиже', expenseTotal:'Барлық шығын', balance:'Шығыннан кейін', monthly:'Мақсатқа ай сайын', after:'Мақсаттан кейінгі қалдық',
    classTitle:'ЖИ ұсынған санаттар', classHint:'Әр санатты тексеріп, қажет болса өзгертіңіз. Санат таңдалмаған шығын да жалпы сомаға кіреді.', byCategory:'Санаттар бойынша',
    unknown:'Санат таңдаңыз', unassigned:'Санаты белгісіз', manual:'Қолмен таңдалды', noRows:'Бұл жоспарға шығын енгізілмеді.',
    categories:{food:'Азық-түлік',housing:'Тұрғын үй',transport:'Көлік',health:'Денсаулық',education:'Білім',other:'Басқа'},
    examples:['Пәтерақы — 90 000','Азық-түлік — 85 000','Автобус билеті — 20 000','Дәріхана — 15 000','Оқу ақысы — 30 000'],
    badIncome:'Айлық кірісті нөл немесе одан үлкен бүтін теңгемен енгізіңіз.', badGoal:'Мақсатқа қажет соманы бүтін теңгемен енгізіңіз немесе бос қалдырыңыз.', badMonths:'Мақсатқа дейін кемінде бір толық ай көрсетіңіз.',
    badLine:n=>n+'-жолды тексеріңіз. Мысалы, «Пәтерақы — 90 000». Сома нөлден үлкен бүтін теңгемен беріледі.',
    tooBig:'Сома дәл есептеу шегінен асты. Енгізілген сандарды тексеріңіз.',
    fit:n=>'Осы жоспар бойынша айлық шығын мен жинаққа ақша жетеді. Одан кейін '+n+' қалады.',
    gap:n=>'Мақсатты көрсетілген мерзімде орындау үшін айлық жоспарда '+n+' жетіспейді.',
    slower:n=>'Шығыннан қалған соманың бәрін жинасаңыз, мақсатқа '+n+' айда жетесіз.',
    deficit:n=>'Жинақты есептемегенде де, жоспарланған шығын кірістен '+n+' артық.',
    noGoal:'Жинақ мақсаты қойылмады. Қалдыққа қол жеткізу үшін кіріс пен шығын жоспарын ұстану қажет.',
    atLimit:'Айлық кіріс жоспарланған шығын мен жинақты дәл жабады.'
  },
  ru: {
    home: 'На главную',
    title:'Семейный бюджет',intro:'Спланируйте доходы и расходы на месяц. ИИ разнесёт траты по категориям, а расчёт покажет, сколько семья сможет отложить на цель.',
    planHeading:'План на месяц', income:'Доход семьи за месяц', goal:'Сколько ещё нужно накопить', months:'Месяцев до цели', monthUnit:'мес.',
    expensesHeading:'Планируемые расходы',hint:'На каждой строке укажите название и сумму в целых тенге. Если расходов нет, оставьте поле пустым.',
    privacy:'Расчёт выполняется на вашем устройстве. Введённые финансовые данные не сохраняются.',
    sample:'Подставить пример семьи',calculate:'Рассчитать план',resultTitle:'Результат за месяц',expenseTotal:'Все расходы',balance:'После расходов',monthly:'На цель в месяц',after:'Остаток после цели',
    classTitle:'Категории от ИИ',classHint:'Проверьте и при необходимости измените категорию. Расход без категории тоже включён в общий итог.',byCategory:'Расходы по категориям',
    unknown:'Выберите категорию',unassigned:'Без категории',manual:'Выбрано вручную',noRows:'В этом плане пока нет расходов.',
    categories:{food:'Продукты',housing:'Жильё',transport:'Транспорт',health:'Здоровье',education:'Образование',other:'Другое'},
    examples:['Аренда квартиры — 90 000','Продукты — 85 000','Билет на автобус — 20 000','Аптека — 15 000','Оплата учёбы — 30 000'],
    badIncome:'Введите доход в целых тенге. При отсутствии дохода укажите 0.',badGoal:'Введите сумму цели в целых тенге или оставьте поле пустым.',badMonths:'Укажите целое количество месяцев до цели, минимум один.',
    badLine:n=>'Проверьте строку '+n+'. Пример записи — «Аренда квартиры — 90 000». Сумма должна быть больше нуля, в целых тенге.',
    tooBig:'Сумма превышает предел точного расчёта. Проверьте введённые значения.',
    fit:n=>'Дохода хватает на запланированные расходы и взнос на цель. Останется '+n+'.',
    gap:n=>'Чтобы достичь цели в указанный срок, в месячном плане не хватает '+n+'.',
    slower:n=>'Если направлять весь остаток после расходов на цель, потребуется месяцев: '+n+'.',
    deficit:n=>'Планируемые расходы превышают доход на '+n+' ещё до взноса на цель.',
    noGoal:'Цель накоплений пока не задана. Остаток рассчитан по указанным доходам и расходам.',
    atLimit:'Доход в точности покрывает запланированные расходы и взнос на цель.'
  }
};
const get = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + ' ₸';
const form = get('planner');
const fileMode = location.protocol === 'file:';
let lang = new URLSearchParams(location.search).get('lang');
if (lang !== 'ru' && lang !== 'kk') {
  try { lang = localStorage.getItem('qz_lang'); } catch { /* Language storage is optional. */ }
  lang = lang === 'ru' ? 'ru' : 'kk';
}
let plan = null;
let overrides = new Map();

function showError(field, message) {
  field.setAttribute('aria-invalid','true');
  field.setAttribute('aria-errormessage','error');
  get('error').textContent = message;
  get('error').hidden = false;
  field.focus();
}

function clearError() {
  get('error').hidden = true;
  for (const field of form.querySelectorAll('[aria-invalid]')) {
    field.removeAttribute('aria-invalid'); field.removeAttribute('aria-errormessage');
  }
}

function clearResult() {
  clearError();
  plan = null;
  get('results').hidden = true;
}

function describeOutcome() {
  const ui = labels[lang], result = plan.totals;
  if (result.balance < 0) {
    const deficit = ui.deficit(money(-result.balance));
    return plan.target ? deficit + ' ' + ui.gap(money(-result.afterGoal)) : deficit;
  }
  if (plan.target === 0) return ui.noGoal;
  if (result.afterGoal < 0) return ui.gap(money(-result.afterGoal)) + (result.monthsAtCapacity ? ' ' + ui.slower(result.monthsAtCapacity) : '');
  return result.afterGoal === 0 ? ui.atLimit : ui.fit(money(result.afterGoal));
}

function drawSummary() {
  const ui = labels[lang], summary = get('summary');
  const sums = new Map();
  for (const row of plan.rows) sums.set(row.category, (sums.get(row.category) || 0) + row.amount);
  summary.replaceChildren();
  if (!sums.size) { summary.textContent = ui.noRows; return; }
  for (const [category, total] of [...sums].sort((a,b)=>b[1]-a[1])) {
    const entry = document.createElement('div');
    entry.className = category ? 'category-row' : 'category-row unknown';
    const line = document.createElement('div'); line.className = 'category-line';
    const label = document.createElement('span'); label.textContent = ui.categories[category] || ui.unassigned;
    const value = document.createElement('strong'); value.textContent = money(total);
    line.append(label,value);
    const track = document.createElement('div'); track.className='track'; track.setAttribute('aria-hidden','true');
    const fill = document.createElement('span'); fill.style.width = (100 * total / plan.totals.expenses) + '%';
    track.append(fill); entry.append(line,track); summary.append(entry);
  }
}

function showExpenses() {
  const ui = labels[lang], host = get('classified');
  host.replaceChildren();
  if (!plan.rows.length) { host.textContent = ui.noRows; return; }
  for (const row of plan.rows) {
    const entry = document.createElement('div'); entry.className='entry';
    const info = document.createElement('div');
    const text = document.createElement('strong'); text.textContent = row.description;
    const amount = document.createElement('small');
    const select = document.createElement('select'); select.className='category-select';
    select.setAttribute('aria-label', ui.classTitle + ' · ' + row.description);
    select.add(new Option(ui.unknown,''));
    for (const [key,name] of Object.entries(ui.categories)) select.add(new Option(name,key));
    function update() {
      select.value = row.category || '';
      select.classList.toggle('attention',!row.category);
      amount.textContent = money(row.amount) + (overrides.has(row.key) ? ' · ' + ui.manual : '');
    }
    select.onchange = () => {
      row.category = select.value || null;
      if (row.category === row.prediction) overrides.delete(row.key);
      else overrides.set(row.key,row.category);
      update(); drawSummary();
    };
    update(); info.append(text,amount); entry.append(info,select); host.append(entry);
  }
}

function drawPlan() {
  get('results').hidden = false;
  for (const [id,key] of Object.entries({'total-expenses':'expenses',balance:'balance','monthly-goal':'monthlyGoal','after-goal':'afterGoal'})) {
    get(id).textContent = money(plan.totals[key]);
  }
  get('after-goal').parentElement.classList.toggle('negative',plan.totals.afterGoal<0);
  get('insight').textContent = describeOutcome();
  showExpenses(); drawSummary();
}

function readPlan(event) {
  event.preventDefault(); clearResult();
  const ui = labels[lang];
  const income = wholeTenge(get('income').value);
  const target = wholeTenge(get('goal').value.trim() || '0');
  const months = target ? wholeTenge(get('months').value) : 1;
  if (income === null) return showError(get('income'),ui.badIncome);
  if (target === null) return showError(get('goal'),ui.badGoal);
  if (!months) return showError(get('months'),ui.badMonths);
  const parsed = readExpenses(get('expenses').value);
  if (parsed.errorLine) return showError(get('expenses'),ui.badLine(parsed.errorLine));
  const occurrences = new Map();
  const rows = parsed.rows.map(row => {
    const name = row.description.normalize('NFKC').toLowerCase().trim();
    const count = (occurrences.get(name) || 0) + 1;
    occurrences.set(name,count);
    const key = JSON.stringify([name,count]);
    const prediction = classifyExpense(row.description);
    return { ...row, key, prediction, category: overrides.has(key) ? overrides.get(key) : prediction };
  });
  let totals;
  try { totals = planBudget(income,target,months,rows); }
  catch (error) { if (!(error instanceof RangeError)) throw error; return showError(get('expenses'),ui.tooBig); }
  const activeKeys = new Set(rows.map(row=>row.key));
  for (const key of overrides.keys()) if (!activeKeys.has(key)) overrides.delete(key);
  plan = {target, totals, rows}; drawPlan();
  get('results').focus({preventScroll:true}); get('results').scrollIntoView({block:'start'});
}

function translate() {
  const ui = labels[lang];
  document.documentElement.lang=lang; document.title=ui.title+' · QARZHЫ';
  for (const node of document.querySelectorAll('[data-t]')) node.textContent = ui[node.dataset.t];
  for (const node of document.querySelectorAll('[data-lang]')) node.setAttribute('aria-pressed',String(node.dataset.lang===lang));
  get('expenses').placeholder = ui.examples.slice(0,2).join('\n');
  get('brand').href = fileMode ? '#planner' : '/?lang='+lang;
  get('portal-back').hidden = fileMode;
  clearError(); if (plan) drawPlan();
}
for (const node of document.querySelectorAll('[data-lang]')) node.onclick = () => {
  lang = node.dataset.lang;
  if (!fileMode) {
    try { localStorage.setItem('qz_lang',lang); } catch { /* Keep the language in the URL. */ }
    const url = new URL(location.href); url.searchParams.set('lang',lang); history.replaceState(null,'',url);
  }
  translate();
};
form.addEventListener('input',clearResult);
form.addEventListener('submit',readPlan);
get('sample').onclick = () => {
  clearResult(); overrides.clear();
  get('income').value='420 000'; get('goal').value='360 000'; get('months').value='6';
  get('expenses').value=labels[lang].examples.join('\n');
};
translate();
if (new URLSearchParams(location.search).get('example') === '1') get('sample').click();
