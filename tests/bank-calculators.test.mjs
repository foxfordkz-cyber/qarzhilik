import assert from "node:assert/strict";
import test from "node:test";
import { calculateBankScenario } from "../public/js/bank-calculators.js";

test("кредит с нулевой ставкой погашается равными платежами", () => {
  assert.deepEqual(calculateBankScenario("loan", { amount: 120000, rate: 0, months: 12 }), {
    payment: 10000, total: 120000, interest: 0,
  });
});

test("при сравнении сроков более долгий кредит снижает платёж и увеличивает переплату", () => {
  const scenario = { amount: 1000000, rate: 12, months: 12 };
  const year = calculateBankScenario("loan", scenario);
  const twoYears = calculateBankScenario("loan", { ...scenario, months: 24 });
  assert.equal(Math.round(year.payment), 88849);
  assert.equal(Math.round(year.interest), 66185);
  assert.ok(twoYears.payment < year.payment);
  assert.ok(twoYears.interest > year.interest);
});

test("вклад получает проценты до пополнения в конце каждого месяца", () => {
  const result = calculateBankScenario("deposit", { amount: 100000, rate: 12, months: 2, contribution: 10000 });
  assert.equal(result.balance, 122110);
  assert.equal(result.invested, 120000);
  assert.equal(result.interest, 2110);
  assert.equal(result.effective.toFixed(2), "12.68");
});

test("при нулевой ставке вклад растёт только на сумму пополнений", () => {
  assert.deepEqual(calculateBankScenario("deposit", { amount: 100, rate: 0, months: 3, contribution: 50 }), {
    balance: 250, invested: 250, interest: 0, effective: 0,
  });
});

test("неполные и недопустимые значения не дают финансовый результат", () => {
  const valid = { amount: 300000, rate: 12, months: 12 };
  for (const invalid of [{ amount: NaN }, { amount: -1 }, { months: 0 }, { months: 12.5 }, { rate: NaN }, { rate: -1 }]) {
    assert.equal(calculateBankScenario("loan", { ...valid, ...invalid }), null);
  }
  assert.equal(calculateBankScenario("deposit", { ...valid, contribution: -1 }), null);
});
