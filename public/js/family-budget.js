// The planner accepts whole tenge. In particular, do not turn "12,50" into 1250.
export function wholeTenge(source) {
  const value = String(source).trim().replace(/[\u00a0\u202f]/g, ' ');
  if (!/^(?:\d+|\d{1,3}(?: \d{3})+)$/.test(value)) return null;
  const number = Number(value.replaceAll(' ', ''));
  return Number.isSafeInteger(number) ? number : null;
}

export function readExpenses(text) {
  const rows = [];
  let total = 0;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const cleaned = line.trim().replace(/\s*(?:₸|тг\.?|тенге|теңге|KZT)$/iu, '').trim();
    if (!line.trim()) continue;
    // Prefer an explicit separator to avoid absorbing part of a malformed sum into the name.
    const explicit = cleaned.match(/^(.+?)\s*(?:[—–:;]|\s-\s)\s*(.*)$/u);
    const parts = explicit || cleaned.match(/^(.*?)\s+(\d[\d\s]*)$/u);
    const description = parts?.[1].trim();
    const amount = parts ? wholeTenge(parts[2]) : null;
    if (!description || !/\p{L}/u.test(description) || amount === null || amount === 0 ||
        /[—–:\-;,]\s*$/u.test(description) || !Number.isSafeInteger(total + amount)) {
      return { errorLine: index + 1 };
    }
    total += amount;
    rows.push({ description, amount });
  }
  return { rows };
}

export function planBudget(income, target, months, rows) {
  const expenses = rows.reduce((sum, row) => sum + row.amount, 0);
  const balance = income - expenses;
  const monthlyGoal = Math.ceil(target / months);
  const afterGoal = balance - monthlyGoal;
  if (!Number.isSafeInteger(afterGoal)) throw new RangeError('budget exceeds safe arithmetic');
  return {
    expenses, balance, monthlyGoal, afterGoal,
    monthsAtCapacity: target && balance > 0 ? Math.ceil(target / balance) : null
  };
}
