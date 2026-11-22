import { trainGuide, maxLength } from './guide-model.js';
import { lessons } from './guide-lessons.js';

const copy = {
  kk: {
    heading: 'Қай қаржы сұрағын түсінгіңіз келеді?', intro: 'Жағдайды өз сөзіңізбен жазыңыз. ЖИ тақырыпты анықтап, қысқа сабақ пен жаттығу ұсынады.',
    question: 'Сұрағыңыз', placeholder: 'Мысалы, шәкіртақымды бір айға қалай жеткіземін?', privacy: 'Мәтін осы браузерде өңделеді. Аты-жөніңізді, карта нөмірін немесе құпия кодты енгізбеңіз.',
    submit: 'Жаттығу таңдау', example: 'Мысал енгізу', sample: 'Алдағы алты айда ноутбукке ақша жинағым келеді.',
    result: 'ЖИ таңдаған сабақ', review: 'ЖИ жауабы', unknown: 'Сұрақты нақтылай аласыз ба?', retry: 'Бір ғана жағдайды сипаттаңыз. Модель бюджет, жинақ, несие және алаяқтық тақырыптарын ажыратады.',
    correct: 'Дұрыс.', incorrect: 'Тағы бір рет байқап көріңіз.', full: 'Платформадағы толық сабақты оқу',
    scope: 'Модель қандай тақырыптарды таниды?', topics: 'Бюджет, жинақ, несие және қаржылық алаяқтық. Нәтиже оқу тақырыбын таңдауға арналған.',
    home: 'QARZHЫ платформасы', blank: 'Сұрағыңызды жазыңыз.'
  },
  ru: {
    heading: 'В каком финансовом вопросе вы хотите разобраться?', intro: 'Опишите ситуацию своими словами. ИИ подберёт короткий урок и упражнение по вашему вопросу.',
    question: 'Ваш вопрос', placeholder: 'Например, как распределить стипендию на месяц?', privacy: 'Текст обрабатывается в этом браузере. Оставьте при себе имя, номер карты и секретные коды.',
    submit: 'Подобрать упражнение', example: 'Вставить пример', sample: 'Хочу накопить на ноутбук за ближайшие полгода.',
    result: 'Урок подобрал ИИ', review: 'Ответ ИИ', unknown: 'Можете уточнить вопрос?', retry: 'Опишите одну ситуацию. Модель различает бюджет, накопления, кредит и финансовое мошенничество.',
    correct: 'Верно.', incorrect: 'Попробуйте ещё раз.', full: 'Открыть полный урок на платформе',
    scope: 'Какие темы распознаёт модель?', topics: 'Бюджет, накопления, кредиты и финансовое мошенничество. Рекомендация помогает выбрать учебную тему.',
    home: 'Платформа QARZHЫ', blank: 'Введите свой вопрос.'
  }
};
const get = id => document.getElementById(id);
const question = get('question');
const predict = trainGuide();
const fileMode = location.protocol === 'file:';
let lang = new URLSearchParams(location.search).get('lang');
if (lang !== 'ru' && lang !== 'kk') {
  try { lang = localStorage.getItem('qz_lang'); } catch { /* Storage is optional. */ }
  if (lang !== 'ru') lang = 'kk';
}
let currentTopic;
let attempted = false;
let selected = null;
question.maxLength = maxLength;

function displayFeedback(option) {
  const item = lessons[currentTopic][lang];
  const correct = option === item.answer;
  const feedback = get('feedback');
  feedback.hidden = false;
  feedback.dataset.correct = String(correct);
  feedback.textContent = correct ? copy[lang].correct + ' ' + item.why : copy[lang].incorrect + ' ' + item.note;
  for (const [index, button] of [...get('answers').children].entries()) button.setAttribute('aria-pressed', String(index === option));
}

function displayResult() {
  get('result').hidden = !attempted;
  if (!attempted) return;
  const ui = copy[lang];
  const item = lessons[currentTopic]?.[lang];
  get('result-label').textContent = item ? ui.result : ui.review;
  get('result-title').textContent = item?.title || ui.unknown;
  get('lesson-note').textContent = item?.note || ui.retry;
  get('practice').hidden = !item;
  get('full-lesson').hidden = !item || fileMode;
  get('feedback').hidden = true;
  get('answers').replaceChildren();
  if (!item) return;
  get('exercise').textContent = item.question;
  item.choices.forEach((choice, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'option'; button.textContent = choice;
    button.setAttribute('aria-pressed', 'false');
    button.onclick = () => { selected = index; displayFeedback(index); };
    get('answers').append(button);
  });
  get('full-lesson').href = '/topic?c=life&t=' + lessons[currentTopic].slug + '&lang=' + lang;
  get('full-lesson').textContent = ui.full;
  if (selected !== null) displayFeedback(selected);
}

function render() {
  const ui = copy[lang];
  document.documentElement.lang = lang;
  document.title = 'QARZHЫ Guide · ' + ui.question;
  for (const [id, key] of Object.entries({heading:'heading', 'intro-text':'intro', 'question-label':'question', privacy:'privacy', recommend:'submit', example:'example', 'scope-title':'scope', 'scope-text':'topics'})) get(id).textContent = ui[key];
  get('brand').href = fileMode ? '#' : '/?lang=' + lang;
  get('brand').setAttribute('aria-label', fileMode ? 'QARZHЫ Guide' : ui.home);
  question.placeholder = ui.placeholder;
  for (const button of document.querySelectorAll('[data-lang]')) button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  displayResult();
}
for (const button of document.querySelectorAll('[data-lang]')) button.onclick = () => {
  lang = button.dataset.lang;
  if (!fileMode) {
    try { localStorage.setItem('qz_lang', lang); } catch { /* Query string also carries language. */ }
    const url = new URL(location.href); url.searchParams.set('lang', lang); history.replaceState(null, '', url);
  }
  question.setCustomValidity(''); render();
};
function clearResult() { attempted = false; selected = null; question.setCustomValidity(''); get('result').hidden = true; }
question.addEventListener('input', clearResult);
get('example').onclick = () => { clearResult(); question.value = copy[lang].sample; question.focus(); };
get('question-form').onsubmit = event => {
  event.preventDefault();
  if (!question.value.trim()) { question.setCustomValidity(copy[lang].blank); question.reportValidity(); return; }
  currentTopic = predict(question.value); selected = null; attempted = true;
  displayResult();
  get('result').focus({ preventScroll: true }); get('result').scrollIntoView({block:'nearest'});
};
render();
