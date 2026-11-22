import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { classifyExpense, familyModelVersion } from '../public/js/family-model.js';
import { familyTraining } from '../public/js/family-training.js';

const holdout = JSON.parse(await readFile(new URL('./family-cases.json', import.meta.url), 'utf8'));

export function evaluateFamily() {
  const rows = [];
  for (const [language, categories] of Object.entries(holdout)) {
    for (const [expected, descriptions] of Object.entries(categories)) {
      for (const description of descriptions) {
        const predicted = classifyExpense(description) ?? 'unknown';
        rows.push({ language, description, expected, predicted, correct: expected === predicted });
      }
    }
  }
  function count(cases) {
    return { correct: cases.filter(row => row.correct).length, total: cases.length };
  }
  const known = rows.filter(row => row.expected !== 'unknown');
  const unknown = rows.filter(row => row.expected === 'unknown');
  const trainingExamples = Object.values(familyTraining).flatMap(languages => Object.values(languages).flat());
  return {
    model: familyModelVersion,
    dataset: 'Synthetic bilingual descriptions, held out from training. unknown means manual review.',
    trainingTotal: trainingExamples.length,
    metrics: {
      all: count(rows), known: count(known), unknown: count(unknown),
      byLanguage: Object.fromEntries(Object.keys(holdout).map(lang => [lang, count(rows.filter(row => row.language === lang))])),
      byCategory: Object.fromEntries([...Object.keys(familyTraining), 'unknown'].map(category => [category, count(rows.filter(row => row.expected === category))])),
      knownSentToReview: known.filter(row => row.predicted === 'unknown').length,
      knownMisclassified: known.filter(row => row.predicted !== 'unknown' && !row.correct).length,
      unknownAssignedCategory: unknown.filter(row => row.predicted !== 'unknown').length
    },
    rows
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = evaluateFamily();
  const json = JSON.stringify(report, null, 2) + '\n';
  if (process.argv.includes('--write')) {
    const directory = new URL('../outputs/ITFEST-Family-2026/', import.meta.url);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL('model-evaluation.json', directory), json);
    console.log(JSON.stringify(report.metrics));
  } else {
    process.stdout.write(json);
  }
}
