import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { trainGuide, maxLength } from '../public/js/guide-model.js';
import { training } from '../public/js/guide-training.js';
import { lessons } from '../public/js/guide-lessons.js';
import { evaluate } from './guide-eval.mjs';

const predict = trainGuide();
test('the recommender accepts questions in either language and can abstain', () => {
  assert.equal(predict('Алдағы алты айда ноутбукке ақша жинағым келеді.'), 'savings');
  assert.equal(predict('Хочу накопить на ноутбук за ближайшие полгода.'), 'savings');
  assert.equal(predict('Компанияның пайдасы мен шоттағы ақшасының айырмасы қандай?'), 'reporting');
  assert.equal(predict('Почему прибыль компании отличается от денег на счёте?'), 'reporting');
  assert.equal(predict('NPV'), 'projects');
  assert.equal(predict('irr'), 'projects');
  for (const question of ['', null, '!!!', '🪐', 'я'.repeat(maxLength + 1)]) assert.equal(predict(question), null);
});

test('relative dates alone do not make an unrelated question financial', () => {
  for (const question of ['Какая сегодня погода?', 'Сегодняшняя погода', 'Бүгін ауа райы қандай?', 'Бүгінгі ауа райы қандай?']) {
    assert.equal(predict(question), null);
  }
  assert.equal(predict('Сегодня какая ставка по кредиту?'), 'credit');
  assert.equal(predict('Бүгін несие бойынша артық төлемді қалай есептеймін?'), 'credit');
});

test('every recommendation has a real bilingual lesson and a distinct hint for each mistake', () => {
  assert.deepEqual(Object.keys(training).sort(), Object.keys(lessons).sort());
  for (const lang of ['kk', 'ru']) {
    const courses = {};
    for (const id of ['life', 'pro']) {
      const file = id + (lang === 'ru' ? '.ru' : '') + '.json';
      courses[id] = JSON.parse(readFileSync(new URL('../public/data/' + file, import.meta.url)));
    }
    for (const lesson of Object.values(lessons)) {
      assert.ok(courses[lesson.course].topics.some(t => t.slug === lesson.slug));
      const { choices, answer, why, hints } = lesson[lang];
      assert.ok(choices[answer] && why);
      const wrong = choices.map((_, index) => index).filter(index => index !== answer);
      assert.deepEqual(Object.keys(hints).map(Number), wrong);
      assert.ok(wrong.every(i => hints[i]?.trim()));
      assert.equal(new Set(Object.values(hints)).size, wrong.length);
    }
  }
});

test('evaluation uses separate questions and records every prediction, including abstentions', () => {
  const known = new Set(Object.values(training).flatMap(langs => Object.values(langs).flat()).map(text => text.trim().toLowerCase()));
  const { rows } = evaluate();
  assert.equal(rows.length, 56);
  for (const r of rows) {
    assert.ok(!known.has(r.question.trim().toLowerCase()));
    assert.ok(r.actual === 'unknown' || Object.hasOwn(lessons, r.actual));
  }
  const pro = rows.filter(row => lessons[row.expected]?.course === 'pro');
  const original = rows.filter(row => lessons[row.expected]?.course !== 'pro');
  assert.equal(original.length, 40);
  assert.ok(original.filter(row => row.correct).length >= 34);
  assert.equal(pro.length, 16);
  for (const language of ['kk', 'ru']) {
    for (const topic of ['reporting', 'projects']) {
      const questions = pro.filter(row => row.language === language && row.expected === topic);
      assert.equal(questions.length, 4);
      assert.ok(questions.filter(row => row.correct).length >= 3);
    }
  }
});
