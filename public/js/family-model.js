import { familyTraining } from './family-training.js';

export const familyModelVersion = 'QARZHY Family Expense 1.0';

function features(description) {
  const terms = new Set();
  const words = description.normalize('NFKC').toLowerCase().replaceAll('ё', 'е').match(/\p{L}+/gu) || [];
  for (const word of words) {
    if (word.length < 2) continue;
    terms.add('word:' + word);
    const padded = '^' + word + '$';
    for (const size of [3, 4]) {
      for (let start = 0; start + size <= padded.length; start++) terms.add(padded.slice(start, start + size));
    }
  }
  return terms;
}

// Instance-based learning. Fit the vocabulary, inverse document frequencies and
// labelled vectors once; household inputs never change or leave the local model.
function fit(corpus) {
  const examples = [];
  const documentCounts = new Map();
  for (const [category, languages] of Object.entries(corpus)) {
    for (const descriptions of Object.values(languages)) {
      for (const description of descriptions) {
        const terms = features(description);
        for (const term of terms) documentCounts.set(term, (documentCounts.get(term) || 0) + 1);
        examples.push({ category, terms });
      }
    }
  }
  const squaredIdf = new Map();
  for (const [term, count] of documentCounts) {
    squaredIdf.set(term, (1 + Math.log((examples.length + 1) / (count + 1))) ** 2);
  }
  function norm(terms) {
    let sum = 0;
    for (const term of terms) sum += squaredIdf.get(term) || 0;
    return Math.sqrt(sum);
  }
  for (const example of examples) example.norm = norm(example.terms);

  return function classify(description) {
    if (typeof description !== 'string' || description.length > 400) return null;
    const terms = features(description);
    const known = [...terms].filter(term => squaredIdf.has(term));
    if (known.length < 3 || known.length / terms.size < 0.40) return null;
    const queryNorm = norm(known);
    const neighbors = new Map();
    for (const example of examples) {
      let dot = 0;
      for (const term of known) if (example.terms.has(term)) dot += squaredIdf.get(term);
      const cosine = dot / (queryNorm * example.norm);
      if (!neighbors.has(example.category)) neighbors.set(example.category, []);
      neighbors.get(example.category).push(cosine);
    }
    // The strongest matching example leads; two more support a consistent category.
    const ranked = [...neighbors].map(([category, similarities]) => {
      const [first, second, third] = similarities.sort((a, b) => b - a);
      return { category, score: 0.7 * first + 0.2 * second + 0.1 * third };
    }).sort((a, b) => b.score - a.score);
    const [best, next] = ranked;
    if (best.score < 0.23 || best.score - next.score < 0.07) return null;
    return best.category;
  };
}

export const classifyExpense = fit(familyTraining);
