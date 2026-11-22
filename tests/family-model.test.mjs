import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyExpense } from '../public/js/family-model.js';
import { familyTraining } from '../public/js/family-training.js';
import { evaluateFamily } from './family-eval.mjs';

test('ordinary budget expense descriptions round-trip in both languages', () => {
  for (const [category, kk, ru] of [
    ['food', 'Азық-түлік', 'Продукты'],
    ['housing', 'Пәтерақы', 'Аренда'],
    ['transport', 'Қоғамдық көлік', 'Проезд'],
    ['health', 'Дәрі-дәрмек', 'Аптека'],
    ['education', 'Оқу ақысы', 'Учёба']
  ]) {
    assert.equal(classifyExpense(kk), category);
    assert.equal(classifyExpense(ru), category);
  }
});

test('missing, unsupported and oversized descriptions require manual review', () => {
  for (const value of [undefined, null, {}, 1000, '', '   ', '012345', '🎁', 'к'.repeat(401)]) {
    assert.equal(classifyExpense(value), null);
  }
});

test('the synthetic evaluation is disjoint and every result is accounted for', () => {
  const evaluation = evaluateFamily();
  const normalize = value => value.toLowerCase().normalize('NFKC').replace(/[^\p{L}]/gu, '');
  const train = new Set(Object.values(familyTraining).flatMap(languages => Object.values(languages).flat()).map(normalize));
  const held = new Set(evaluation.rows.map(row => normalize(row.description)));
  assert.equal(train.size, 120);
  assert.equal(held.size, 60);
  assert.equal([...held].filter(q => train.has(q)).length, 0);
  assert.equal(evaluation.metrics.known.total, 50);
  assert.equal(evaluation.metrics.unknown.total, 10);
  assert.equal(evaluation.metrics.all.correct, evaluation.rows.filter(row => row.correct).length);
});
