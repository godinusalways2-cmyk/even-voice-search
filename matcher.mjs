// Offline bilingual retrieval (v0.5). Never synthesize, translate, or replace original source text.
// Favor English word ORDER and contiguous phrases over unordered lexical overlap.
// A non-unique or weak match is explicitly marked uncertain.
export const normalize = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const squash = s => normalize(s).replace(/\s+/g, '');
const stop = new Set('the and of to in a an for on is are was were be been that which it by from as with this those its their his her at than into not who what they we you he she them can had has have may would could should do does did or if but'.split(' '));
export const tokens = s => normalize(s).split(' ').filter(t => t.length > 1 && !stop.has(t));
const words = s => normalize(s).split(' ').filter(Boolean);
const weight = t => stop.has(t) ? 0.18 : (t.length <= 2 ? 0.6 : 1);
const docCache = new WeakMap();
function indexed(row) {
  let d = docCache.get(row);
  if (!d) {
    const en = normalize(row.en);
    d = { en, ko: normalize(row.ko), compact: en.replace(/\s+/g, ''), words: en.split(' ').filter(Boolean), content: new Set(tokens(en)) };
    docCache.set(row, d);
  }
  return d;
}
function lcsFeatures(queryWords, documentWords) {
  const m = queryWords.length, n = documentWords.length;
  if (!m || !n) return { coverage: 0, run: 0 };
  // Weighted ordered LCS: single speech recognition mistakes are tolerated;
  // random words appearing in an unrelated order are not treated as a phrase.
  const dp = new Float32Array(n + 1);
  const contiguous = new Uint16Array(n + 1);
  let longest = 0;
  let totalWeight = 0;
  for (const q of queryWords) {
    totalWeight += weight(q);
    let prev = 0, previousRun = 0;
    for (let j = 1; j <= n; j++) {
      const old = dp[j], oldRun = contiguous[j];
      if (q === documentWords[j - 1]) {
        dp[j] = prev + weight(q);
        contiguous[j] = previousRun + 1;
        if (contiguous[j] > longest) longest = contiguous[j];
      } else {
        dp[j] = Math.max(dp[j], dp[j - 1]);
        contiguous[j] = 0;
      }
      prev = old;
      previousRun = oldRun;
    }
  }
  return { coverage: totalWeight ? dp[n] / totalWeight : 0, run: longest / m };
}
function rank(row, query) {
  const d = indexed(row);
  if (!query.norm) return null;
  if (query.korean) {
    if (d.ko.includes(query.norm)) return { score: 1500 + Math.min(120, query.norm.length), kind: 'exact', coverage: 1 };
    return null;
  }
  const position = d.en.indexOf(query.norm);
  if (position >= 0 && query.fullWords.length >= 2) {
    return { score: 1500 + Math.min(130, query.norm.length) - position * 0.002, kind: 'exact', coverage: 1 };
  }
  if (query.compact.length >= 12 && d.compact.includes(query.compact) && query.fullWords.length >= 3) {
    return { score: 1320 + Math.min(120, query.compact.length), kind: 'compact', coverage: 1 };
  }
  if (query.fullWords.length < 3 || query.contentWords.length < 2) return null;
  const contentHits = query.contentWords.filter(t => d.content.has(t)).length;
  if (contentHits < 2) return null;
  const { coverage, run } = lcsFeatures(query.fullWords, d.words);
  // Coverage alone can be coincidental in a theological text; contiguous
  // order and at least two content words are essential.
  const contentFraction = contentHits / query.contentWords.length;
  const score = Math.round(120 + 590 * coverage + 290 * run + 50 * contentFraction);
  if (coverage < 0.46 || score < 465) return null;
  return { score, kind: 'ordered', coverage, run };
}
export function search(rows, query, { chapter = 'all', limit = 10 } = {}) {
  const norm = normalize(query);
  if (!norm) return [];
  const q = { norm, compact: norm.replace(/\s+/g,''), fullWords: words(norm), contentWords: tokens(norm), korean: /[가-힣]/.test(norm) };
  const candidates = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (chapter !== 'all' && row.chapter !== chapter) continue;
    const match = rank(row, q);
    if (match) candidates.push({ row, index: i, ...match });
  }
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates.slice(0, limit);
}
export function assess(results, query) {
  if (!results.length) return { state:'none', label:'검색 결과 없음', confident:false };
  const first=results[0], second=results[1];
  const gap=second ? first.score-second.score : Infinity;
  const wordsCount=words(query).length;
  const exact=['exact','compact'].includes(first.kind);
  const duplicate=second && ['exact','compact'].includes(second.kind) && gap < 160;
  if (exact && !duplicate && (gap >= 80 || !second)) return { state:'exact', label:'원문 구절 일치', confident:true };
  if (exact && duplicate) return { state:'ambiguous', label:'여러 문단에 같은 구절', confident:false };
  if (first.kind === 'ordered' && wordsCount >= 5 && first.coverage >= 0.76 && first.run >= 0.38 && first.score >= 760 && gap >= 110) {
    return { state:'likely', label:'유력한 후보 · 확인 필요', confident:false };
  }
  return { state:'ambiguous', label:'후보가 비슷함 · 더 읽어주세요', confident:false };
}
export function context(rows, row, offset) {
  const i = rows.findIndex(x => x.id === row.id);
  if (i < 0) return null;
  const j = i + offset;
  if (j < 0 || j >= rows.length || rows[j].chapter !== row.chapter) return null;
  return rows[j];
}
export function warmSearch(rows) {
  for (const row of rows) indexed(row);
  return rows.length;
}
