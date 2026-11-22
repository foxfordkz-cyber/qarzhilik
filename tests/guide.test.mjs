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
  for (const question of ['', null, '!!!', '🪐', 'я'.repeat(maxLength + 1)]) assert.equal(predict(question), null);
});

test('every recommended lesson exists in both source courses and has an answer', () => {
  assert.deepEqual(Object.keys(training).sort(), Object.keys(lessons).sort());
  for (const lang of ['kk', 'ru']) {
    const file = lang === 'ru' ? 'life.ru.json' : 'life.json';
    const course = JSON.parse(readFileSync(new URL('../public/data/' + file, import.meta.url)));
    for (const lesson of Object.values(lessons)) {
      assert.ok(course.topics.some(t => t.slug === lesson.slug));
      assert.ok(lesson[lang].choices[lesson[lang].answer]);
    }
  }
});

test('evaluation uses separate questions and records every prediction, including abstentions', () => {
  const known = new Set(Object.values(training).flatMap(langs => Object.values(langs).flat()).map(text => text.trim().toLowerCase()));
  const { rows } = evaluate();
  assert.equal(rows.length, 40);
  for (const r of rows) {
    assert.ok(!known.has(r.question.trim().toLowerCase()));
    assert.ok(r.actual === 'unknown' || Object.hasOwn(lessons, r.actual));
  }
  assert.ok(rows.filter(row => row.correct).length >= 34);
});
