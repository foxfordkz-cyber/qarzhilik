import { trainGuide, maxLength } from './guide-model.js';
import { lessons } from './guide-lessons.js';

const copy = {
  kk: {
    heading: 'Қай қаржы сұрағын түсінгіңіз келеді?', intro: 'Жағдайды өз сөзіңізбен жазыңыз. ЖИ тақырыпты анықтап, қысқа сабақ пен жаттығу ұсынады.',
    question: 'Сұрағыңыз', placeholder: 'Мысалы, шәкіртақымды бір айға қалай жеткіземін?', privacy: 'Мәтін осы браузерде өңделеді. Аты-жөніңізді, карта нөмірін немесе құпия кодты енгізбеңіз.',
    submit: 'Жаттығу таңдау', example: 'Жеке қаржы мысалы', proExample: 'Кәсіби қаржы мысалы', sample: 'Алдағы алты айда ноутбукке ақша жинағым келеді.', proSample: 'Компанияның пайдасы мен шоттағы ақшасының айырмасы қандай?',
    life: 'Өмірге қажетті қаржы', pro: 'Кәсіби қаржы', review: 'ЖИ жауабы', unknown: 'Сұрақты нақтылай аласыз ба?', retry: 'Төмендегі тақырыптардың біріне қатысты жағдайды сипаттаңыз немесе дайын мысалды таңдаңыз.',
    correct: 'Дұрыс.', incorrect: 'Тағы бір рет байқап көріңіз.', full: 'Платформадағы толық сабақты оқу',
    scope: 'Қандай сұрақ қоюға болады?', topics: 'Бюджет, жинақ, несие немесе алаяқтық туралы сұраңыз. Кәсіби бағытта компанияның қаржылық есептілігі мен инвестициялық жобаларды бағалау тақырыптары бар.',
    home: 'QARZHЫ платформасы', blank: 'Сұрағыңызды жазыңыз.'
  },
  ru: {
    heading: 'В каком финансовом вопросе вы хотите разобраться?', intro: 'Опишите ситуацию своими словами. ИИ подберёт короткий урок и упражнение по вашему вопросу.',
    question: 'Ваш вопрос', placeholder: 'Например, как распределить стипендию на месяц?', privacy: 'Текст обрабатывается в этом браузере. Оставьте при себе имя, номер карты и секретные коды.',
    submit: 'Подобрать упражнение', example: 'Пример о личных финансах', proExample: 'Пример о финансах бизнеса', sample: 'Хочу накопить на ноутбук за ближайшие полгода.', proSample: 'Почему прибыль компании отличается от денег на счёте?',
    life: 'Финансы для жизни', pro: 'Профессиональные финансы', review: 'Ответ ИИ', unknown: 'Можете уточнить вопрос?', retry: 'Опишите ситуацию по одной из тем ниже или выберите готовый пример.',
    correct: 'Верно.', incorrect: 'Попробуйте ещё раз.', full: 'Открыть полный урок на платформе',
    scope: 'О чём можно спросить?', topics: 'Задайте вопрос о бюджете, накоплениях, кредите или мошенничестве. В профессиональном направлении доступны финансовая отчётность компании и оценка инвестиционных проектов.',
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
  feedback.textContent = correct ? copy[lang].correct + ' ' + item.why : item.hints[option] + ' ' + copy[lang].incorrect;
  for (const [index, button] of [...get('answers').children].entries()) button.setAttribute('aria-pressed', String(index === option));
}

function displayResult() {
  get('result').hidden = !attempted;
  if (!attempted) return;
  const ui = copy[lang];
  const lesson = lessons[currentTopic];
  const item = lesson?.[lang];
  get('result').dataset.course = lesson?.course || '';
  get('result-label').textContent = lesson ? ui[lesson.course] : ui.review;
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
  get('full-lesson').href = '/topic?' + new URLSearchParams({c: lesson.course, t: lesson.slug, lang});
  get('full-lesson').textContent = ui.full;
  if (selected !== null) displayFeedback(selected);
}

function render() {
  const ui = copy[lang];
  document.documentElement.lang = lang;
  document.title = 'QARZHЫ Guide · ' + ui.question;
  for (const [id, key] of Object.entries({heading:'heading', 'intro-text':'intro', 'question-label':'question', privacy:'privacy', recommend:'submit', example:'example', 'example-pro':'proExample', 'scope-title':'scope', 'scope-text':'topics'})) get(id).textContent = ui[key];
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
for (const [id, key] of [['example', 'sample'], ['example-pro', 'proSample']]) {
  get(id).onclick = () => { clearResult(); question.value = copy[lang][key]; question.focus(); };
}
get('question-form').onsubmit = event => {
  event.preventDefault();
  if (!question.value.trim()) { question.setCustomValidity(copy[lang].blank); question.reportValidity(); return; }
  currentTopic = predict(question.value); selected = null; attempted = true;
  displayResult();
  get('result').focus({ preventScroll: true }); get('result').scrollIntoView({block:'nearest'});
};
render();
