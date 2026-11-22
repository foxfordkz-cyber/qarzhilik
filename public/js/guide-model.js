import { training } from './guide-training.js';

export const version = 'QARZHY Guide 1.0';
export const maxLength = 400;

function features(text) {
  const words = text.normalize('NFKC').toLowerCase().replace(/ё/g, 'е').match(/\p{L}+/gu) || [];
  const terms = new Map();
  function count(term) { terms.set(term, (terms.get(term) || 0) + 1); }
  for (const word of words) {
    if (word.length < 2) continue;
    count('w:' + word);
    const padded = '^' + word + '$';
    for (const size of [3, 4, 5]) {
      for (let i = 0; i <= padded.length - size; i++) count(padded.slice(i, i + size));
    }
  }
  return terms;
}

function unit(vector) {
  const length = Math.sqrt([...vector.values()].reduce((sum, v) => sum + v * v, 0)) || 1;
  for (const [key, value] of vector) vector.set(key, value / length);
  return vector;
}

// One learned centroid per topic and language. All statistics come from training examples.
export function trainGuide(corpus = training) {
  const documents = [];
  const frequencies = new Map();
  for (const [topic, languages] of Object.entries(corpus)) {
    for (const [lang, questions] of Object.entries(languages)) {
      for (const text of questions) {
        const terms = features(text);
        documents.push({ topic, lang, terms });
        for (const term of terms.keys()) frequencies.set(term, (frequencies.get(term) || 0) + 1);
      }
    }
  }
  const idf = new Map();
  for (const [term, n] of frequencies) idf.set(term, 1 + Math.log((1 + documents.length) / (1 + n)));
  function vectorize(terms) {
    const vector = new Map();
    for (const [term, count] of terms) {
      if (idf.has(term)) vector.set(term, (1 + Math.log(count)) * idf.get(term));
    }
    return unit(vector);
  }
  const centers = new Map();
  for (const { topic, lang, terms } of documents) {
    const key = topic + '/' + lang;
    if (!centers.has(key)) centers.set(key, { topic, weights: new Map() });
    const { weights } = centers.get(key);
    for (const [term, value] of vectorize(terms)) weights.set(term, (weights.get(term) || 0) + value);
  }
  for (const { weights } of centers.values()) unit(weights);

  return function recommend(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > maxLength) return null;
    const terms = features(text);
    const query = vectorize(terms);
    // Require enough recognised language evidence and agreement over the runner-up.
    if (query.size < 5 || query.size / terms.size < 0.17) return null;
    const scores = new Map();
    for (const { topic, weights } of centers.values()) {
      let score = 0;
      for (const [term, value] of query) score += value * (weights.get(term) || 0);
      scores.set(topic, Math.max(scores.get(topic) || 0, score));
    }
    const [best, second] = [...scores].sort((a, b) => b[1] - a[1]);
    if (!best || best[1] < 0.19 || best[1] - (second?.[1] || 0) < 0.045) return null;
    return best[0];
  };
}
