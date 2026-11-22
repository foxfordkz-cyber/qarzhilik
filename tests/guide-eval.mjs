import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { trainGuide, version } from '../public/js/guide-model.js';

export const cases = JSON.parse(readFileSync(new URL('./guide-cases.json', import.meta.url), 'utf8'));

export function evaluate() {
  const predict = trainGuide();
  const rows = [];
  for (const [language, classes] of Object.entries(cases)) {
    for (const [expected, questions] of Object.entries(classes)) {
      for (const question of questions) {
        const actual = predict(question) || 'unknown';
        rows.push({ language, question, expected, actual, correct: actual === expected });
      }
    }
  }
  return { version, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(evaluate(), null, 2));
}
