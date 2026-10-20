// Fast bilingual search: no translation generation, original paired text is returned.
// Cache document normalization to avoid repeating it after every speech update.
export const normalize = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const squash = s => normalize(s).replace(/\s+/g, '');
const stop = new Set('the and of to in a an for on is are was were be been that which it by from as with this those its their his her at than into not who what'.split(' '));
export const tokens = s => normalize(s).split(' ').filter(t => t.length > 1 && !stop.has(t));
function trigramSet(compact) {
  const set = new Set();
  for (let i = 0; i + 2 < compact.length; i++) set.add(compact.slice(i, i + 3));
  return set;
}
const cache = new WeakMap();
function indexed(row) {
  let value = cache.get(row);
  if (!value) {
    const en = normalize(row.en);
    const ko = normalize(row.ko);
    const compact = en.replace(/\s+/g, '');
    value = { en, ko, compact, ts: new Set(tokens(en)), trigrams: trigramSet(compact) };
    cache.set(row, value);
  }
  return value;
}
function prepareQuery(q) {
  const value = normalize(q);
  const compact = value.replace(/\s+/g, '');
  return { value, compact, tokens: tokens(value), trigrams: compact.length >= 5 ? trigramSet(compact) : null, isKorean: /[가-힣]/.test(value) };
}
function score(row, q) {
  const d = indexed(row);
  if (!q.value) return 0;
  if (q.isKorean && d.ko.includes(q.value)) return 1000 + Math.min(150, q.value.length * 3);
  const start = d.en.indexOf(q.value);
  if (start >= 0) return 1000 + Math.min(150, q.value.length * 3) - start * 0.1;
  if (q.compact.length >= 5 && d.compact.includes(q.compact)) return 800 + Math.min(140, q.compact.length * 2);
  let overlap = 0;
  for (const t of q.tokens) {
    if (d.ts.has(t)) { overlap++; continue; }
    // Tolerate incompletely recognized individual words.
    for (const z of d.ts) {
      if (z.startsWith(t) || (t.startsWith(z) && z.length >= 4)) { overlap += 0.55; break; }
    }
  }
  const tokenScore = q.tokens.length ? overlap / q.tokens.length : 0;
  let tri = 0;
  if (q.trigrams?.size) {
    let hits = 0;
    for (const t of q.trigrams) if (d.trigrams.has(t)) hits++;
    tri = hits / q.trigrams.size;
  }
  return 350 * tokenScore + 220 * tri + (q.tokens.length > 1 && overlap === q.tokens.length ? 90 : 0);
}
export function search(rows, query, { chapter = 'all', limit = 10 } = {}) {
  const q = prepareQuery(query);
  if (!q.value) return [];
  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (chapter !== 'all' && row.chapter !== chapter) continue;
    const value = score(row, q);
    if (value > 125) results.push({ row, score: value, index: i });
  }
  results.sort((a, b) => b.score - a.score || a.index - b.index);
  return results.slice(0, limit);
}
export function context(rows, row, offset) {
  const i = rows.findIndex(x => x.id === row.id);
  if (i < 0) return null;
  const j = i + offset;
  if (j < 0 || j >= rows.length || rows[j].chapter !== row.chapter) return null;
  return rows[j];
}
export function warmSearch(rows) {
  // Do the heavier document normalization once, at DB import time.
  for (const row of rows) indexed(row);
  return rows.length;
}
