import assert from 'node:assert/strict';
import test from 'node:test';
import { readExpenses, wholeTenge, planBudget } from '../public/js/family-budget.js';

test('reads grouped tenge on each line and flags the original line number instead of silently omitting money', () => {
  const { rows } = readExpenses('Пәтерақы — 90 000 ₸\n\nАзық-түлік 85\u202f000 тг.\n№12 автобус: 20000');
  assert.deepEqual(rows.map(row=>row.amount), [90000,85000,20000]);
  assert.equal(rows[2].description,'№12 автобус');
  for (const line of ['Пәтерақы — -30','Продукты 1 23','Сколько?','Аптека — 1,5','— 150','Аптека — 0']) {
    assert.equal(readExpenses('Жол — 300\n\n'+line).errorLine,3);
  }
  assert.equal(wholeTenge(''),null);
  assert.equal(wholeTenge('0'),0);
  assert.equal(wholeTenge('1e6'),null);
});

test('budget accounts for every expense, even uncategorised ones, and preserves deficits', () => {
  const rows=[90000,85000,20000,15000,30000].map(amount=>({amount,category:null}));
  assert.deepEqual(planBudget(420000,360000,6,rows),{
    expenses:240000,balance:180000,monthlyGoal:60000,afterGoal:120000,monthsAtCapacity:2
  });
  const short=planBudget(100000,420000,12,[{amount:85000}]);
  assert.equal(short.afterGoal,-20000); assert.equal(short.monthsAtCapacity,28);
  const deficit=planBudget(0,100,3,[{amount:2500}]);
  assert.equal(deficit.monthlyGoal,34); assert.equal(deficit.afterGoal,-2534); assert.equal(deficit.monthsAtCapacity,null);
  assert.deepEqual(planBudget(0,0,1,[]),{expenses:0,balance:0,monthlyGoal:0,afterGoal:0,monthsAtCapacity:null});
  assert.throws(()=>planBudget(0,Number.MAX_SAFE_INTEGER,1,[{amount:1}]),RangeError);
});
