// v0.6 hybrid search: exact phrase > ordered error-tolerant alignment.
// No generative translation: output is always a saved bilingual pair.
// Personal English/Korean text never leaves the browser via this matcher.
export const normalize = s => String(s ?? '').normalize('NFKC').toLowerCase()
  .replace(/[‘’]/g, "'").replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const squash = s => normalize(s).replace(/\s+/g, '');
const words = s => normalize(s).split(' ').filter(Boolean);
const common = new Set('the and of to in a an for on is are was were be been that which it by from as with this those its their his her at than into not who what they we you he she them can had has have may would could should do does did or if but'.split(' '));
export const tokens = s => words(s).filter(t => t.length > 1 && !common.has(t));
const docCache = new WeakMap();
const corpusCache = new WeakMap();
function indexed(row) {
  let doc = docCache.get(row);
  if (!doc) {
    const en = normalize(row.en);
    doc = { en, ko: normalize(row.ko), compact: en.replace(/\s+/g,''),
      words: en.split(' ').filter(Boolean) };
    doc.termSet=new Set(doc.words);
    docCache.set(row, doc);
  }
  return doc;
}
export function warmSearch(rows) {
  if (!corpusCache.has(rows)) {
    const frequency = new Map();
    for (const row of rows) {
      const doc=indexed(row);
      for(const term of new Set(doc.words.filter(x=>!common.has(x)))) {
        frequency.set(term, (frequency.get(term)||0)+1);
      }
    }
    corpusCache.set(rows, {frequency, size:rows.length});
  }
  return rows.length;
}
function termWeight(term, corpus) {
  if (common.has(term)) return 0.18;
  const df=corpus.frequency.get(term)||0;
  return 1.0 + Math.min(1.35, Math.log(1 + corpus.size/(df+1))/3.8);
}
// Bounded edit distance permits one or two ordinary speech recognition misspellings.
// Short common words are deliberately never fuzzy-matched.
function editWithin(a,b,limit) {
  if (Math.abs(a.length-b.length)>limit) return limit+1;
  let prev=Array.from({length:b.length+1},(_,j)=>j);
  let curr=new Array(b.length+1);
  for(let i=1;i<=a.length;i++){
    curr[0]=i;
    let min=curr[0];
    for(let j=1;j<=b.length;j++){
      curr[j]=Math.min(curr[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
      if(curr[j]<min)min=curr[j];
    }
    if(min>limit) return limit+1;
    const tmp=prev;prev=curr;curr=tmp;
  }
  return prev[b.length];
}
function similarity(a,b) {
  if(a===b)return 1;
  const max=Math.max(a.length,b.length);
  if(max<5 || common.has(a) || common.has(b))return 0;
  const limit=max>=9?2:1;
  if(Math.abs(a.length-b.length)>limit || a[0]!==b[0])return 0;
  const edits=editWithin(a,b,limit);
  if(edits>limit)return 0;
  return edits===1?0.78:0.61;
}
function aligned(query, document, corpus) {
  const q=query.words,d=document.words;
  const m=q.length,n=d.length;
  if(m<4||!n)return null;
  // Fast candidate screening: two meaningful words must plausibly anchor the phrase.
  const keyWords=[...new Set(q.filter(t=>!common.has(t)&&t.length>2))];
  if(keyWords.length<2)return null;
  let anchors=0;
  for(const w of keyWords)if(document.termSet.has(w))anchors++;
  if(anchors<2){
    for(const w of keyWords){
      if(document.termSet.has(w))continue;
      if(document.words.some(t=>similarity(w,t)>=0.6))anchors++;
      if(anchors>=2)break;
    }
    if(anchors<2)return null;
  }
  const w=q.map(t=>termWeight(t,corpus));
  const total=w.reduce((a,b)=>a+b,0);
  let prior=new Float32Array(n+1);
  let priorMatches=new Float32Array(n+1);
  let priorHits=new Uint16Array(n+1);
  let priorContent=new Uint16Array(n+1);
  let priorRun=new Uint16Array(n+1);
  let seenContent=0;
  for(let i=1;i<=m;i++){
    const current=new Float32Array(n+1);
    const currMatches=new Float32Array(n+1);
    const currHits=new Uint16Array(n+1);
    const currContent=new Uint16Array(n+1);
    const currRun=new Uint16Array(n+1);
    current[0]=prior[0]-0.62*w[i-1];
    for(let j=1;j<=n;j++){
      // Missing query word (speech omission); skipped document word (internal gap).
      let best=prior[j]-0.62*w[i-1], path=0;
      const skipDoc=current[j-1]-0.17;
      if(skipDoc>best){best=skipDoc;path=1;}
      const sim=similarity(q[i-1],d[j-1]);
      let candidate=-Infinity;
      if(sim>0)candidate=prior[j-1]+w[i-1]*1.28*sim + (priorRun[j-1]>0?0.12*w[i-1]:0);
      if(candidate>best){best=candidate;path=2;}
      current[j]=best;
      if(path===2){
        currMatches[j]=priorMatches[j-1]+w[i-1]*sim;
        currHits[j]=priorHits[j-1]+1;
        currContent[j]=priorContent[j-1]+(common.has(q[i-1])?0:1);
        currRun[j]=priorRun[j-1]+1;
      }else if(path===1){
        currMatches[j]=currMatches[j-1];
        currHits[j]=currHits[j-1];
        currContent[j]=currContent[j-1];
        currRun[j]=0;
      }else{
        currMatches[j]=priorMatches[j];
        currHits[j]=priorHits[j];
        currContent[j]=priorContent[j];
        currRun[j]=0;
      }
    }
    prior=current;priorMatches=currMatches;priorHits=currHits;priorContent=currContent;priorRun=currRun;
  }
  let best=-Infinity,pos=0;
  for(let j=0;j<=n;j++)if(prior[j]>best){best=prior[j];pos=j;}
  const coverage=Math.min(1,priorMatches[pos]/total);
  const quality=Math.max(0,Math.min(1,best/(total*1.36)));
  if(priorContent[pos]<2||priorHits[pos]<3||coverage<0.67||quality<0.56)return null;
  return {score:Math.round(150+850*quality),kind:'fuzzy',coverage,quality,hitCount:priorHits[pos]};
}
function rank(row, query, corpus) {
  const d=indexed(row);
  if(query.korean){
    return d.ko.includes(query.norm)
      ? {score:1600+Math.min(100,query.norm.length),kind:'exact',coverage:1,quality:1}
      : null;
  }
  if(query.words.length>=4){
    const index=d.en.indexOf(query.norm);
    if(index>=0)return {score:1600+Math.min(100,query.norm.length)-index*0.001,
      kind:'exact',coverage:1,quality:1};
    if(query.compact.length>=15&&d.compact.includes(query.compact)){
      return {score:1460+Math.min(100,query.compact.length),kind:'compact',coverage:1,quality:1};
    }
  }
  return aligned(query,d,corpus);
}
export function search(rows, query, {chapter='all',limit=10}={}) {
  const norm=normalize(query);
  if(!norm || !rows.length)return [];
  warmSearch(rows);
  const q={norm,words:words(norm),compact:norm.replace(/\s+/g,''),korean:/[가-힣]/.test(norm)};
  const corpus=corpusCache.get(rows);
  const matches=[];
  for(let i=0;i<rows.length;i++){
    const row=rows[i];
    if(chapter!=='all'&&row.chapter!==chapter)continue;
    const m=rank(row,q,corpus);
    if(m)matches.push({row,index:i,...m});
  }
  matches.sort((a,b)=>b.score-a.score||a.index-b.index);
  return matches.slice(0,limit);
}
export function searchSpeech(rows, alternatives,{chapter='all',limit=5}={}) {
  const phrases=[...new Set((alternatives||[]).filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean))].slice(0,3);
  const grouped=new Map();
  for(let i=0;i<phrases.length;i++){
    const candidate=search(rows,phrases[i],{chapter,limit:Math.max(limit,4)});
    for(const c of candidate){
      const scored={...c,score:c.score-i*32,spoken:phrases[i],alternativeIndex:i};
      const key=c.row.id;
      if(!grouped.has(key)||grouped.get(key).score<scored.score)grouped.set(key,scored);
    }
  }
  const results=[...grouped.values()].sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit);
  return {results,heard:phrases[0]||'',selected:results[0]?.spoken||phrases[0]||'',alternativeCount:phrases.length};
}
export function assess(results,query) {
  if(!results.length)return {state:'none',label:'검색 결과 없음',confident:false};
  const top=results[0], second=results[1];
  const wordCount=words(query).length;
  const gap=second?top.score-second.score:Infinity;
  const exact=['exact','compact'].includes(top.kind);
  if(exact&&wordCount>=4&&gap>=95)
    return {state:'exact',label:'원문 구절 일치',confident:true};
  if(exact&&gap<95)
    return {state:'ambiguous',label:'유사한 원문이 여러 곳에 있음',confident:false};
  // A fuzzy match is shown as a candidate, never falsely described as exact.
  if(top.kind==='fuzzy'&&wordCount>=5&&top.coverage>=0.83&&top.quality>=0.78&&gap>=115)
    return {state:'likely',label:'높은 유사도 · 원문 확인',confident:false};
  return {state:'ambiguous',label:'후보가 비슷함 · 더 길게 읽어주세요',confident:false};
}
export function context(rows,row,offset) {
  const i=rows.findIndex(x=>x.id===row.id),j=i+offset;
  if(i<0||j<0||j>=rows.length||rows[j].chapter!==row.chapter)return null;
  return rows[j];
}