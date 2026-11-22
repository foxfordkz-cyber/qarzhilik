import { training } from './guide-training.js';

export const version = 'QARZHY Guide 1.1';
export const maxLength = 400;

// Grammatical words add little evidence for a specific topic. Filter before
// building character n-grams so question phrasing cannot dominate short inputs.
const stopWords = new Set((
  'в во и на за по из к от у с со о об или а но ли же бы до при для это этом эти как что какой какая какие чем почему ' +
  'сколько когда где можно нужно хочу мне меня если чтобы есть будет через ' +
  'мен пен бен және не немесе да де та те ма ме ба бе па пе ол бұл осы сол бір үшін қалай қандай қанша ' +
  'неше қашан қай қайда неге неден деген болады керек келеді егер тұрады неде нені білдіреді ' +
  'значит означает состоит'
).split(' '));

function features(text) {
  const words = text.normalize('NFKC').toLowerCase().replace(/ё/g, 'е').match(/\p{L}+/gu) || [];
  const terms = new Map();
  function count(term) { terms.set(term, (terms.get(term) || 0) + 1); }
  for (const word of words) {
    if (word.length < 2 || stopWords.has(word)) continue;
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

function similarity(query, weights) {
  let score = 0;
  for (const [term, value] of query) score += value * (weights.get(term) || 0);
  return score;
}

// Combine a topic's general vocabulary with the closest labelled example,
// so a specialised question can still match a narrow part of a broad lesson.
export function trainGuide(corpus = training) {
  const documents = [];
  const frequencies = new Map();
  const abbreviations = new Map();
  for (const [topic, languages] of Object.entries(corpus)) {
    for (const [lang, questions] of Object.entries(languages)) {
      for (const text of questions) {
        for (const word of new Set(text.match(/\p{L}+/gu) || [])) {
          if (!/^\p{Lu}{3,}$/u.test(word)) continue;
          const key = word.toLowerCase();
          if (!abbreviations.has(key)) abbreviations.set(key, { topic, count: 0 });
          const entry = abbreviations.get(key);
          entry.count++;
          if (topic !== entry.topic) entry.topic = null;
        }
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
    if (!centers.has(key)) centers.set(key, { topic, weights: new Map(), examples: [] });
    const { weights, examples } = centers.get(key);
    const example = vectorize(terms);
    examples.push(example);
    for (const [term, value] of example) weights.set(term, (weights.get(term) || 0) + value);
  }
  for (const { weights } of centers.values()) unit(weights);

  return function recommend(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > maxLength) return null;
    // Boost short acronyms that occur in multiple examples of just one topic.
    const acronymTopics = new Set();
    for (const word of text.normalize('NFKC').toLowerCase().match(/\p{L}+/gu) || []) {
      const entry = abbreviations.get(word);
      if (entry?.topic && entry.count >= 2) acronymTopics.add(entry.topic);
    }
    const terms = features(text);
    const query = vectorize(terms);
    // Require enough recognised language evidence and agreement over the runner-up.
    if (query.size < 5 || query.size / terms.size < 0.17) return null;
    const scores = new Map();
    for (const { topic, weights, examples } of centers.values()) {
      const closest = Math.max(...examples.map(example => similarity(query, example)));
      const score = 0.6 * similarity(query, weights) + 0.4 * closest + (acronymTopics.has(topic) ? 0.2 : 0);
      scores.set(topic, Math.max(scores.get(topic) || 0, score));
    }
    const [best, second] = [...scores].sort((a, b) => b[1] - a[1]);
    if (!best || best[1] < 0.19 || best[1] - (second?.[1] || 0) < 0.045) return null;
    return best[0];
  };
}
