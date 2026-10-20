// Search original English, return exact paired Korean without translation or generation.
export const normalize = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[‘’]/g,"'").replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export const squash = (s) => normalize(s).replace(/\s+/g,'');
const stop = new Set('the and of to in a an for on is are was were be been that which it by from as with this those its their his her at than into not who what'.split(' '));
export const tokens = (s) => normalize(s).split(' ').filter(s=>s.length>1&&!stop.has(s));
function trigramSet(s){const compact=squash(s); const set=new Set();for(let i=0;i<compact.length-2;i++)set.add(compact.slice(i,i+3));return set;}
function score(row,q){
  const d=normalize(row.en), k=normalize(row.ko), nq=normalize(q), ds=squash(d), qs=squash(nq);
  if(!nq)return 0;
  if(d.includes(nq))return 1000 + Math.min(150,nq.length*3) - d.indexOf(nq)*0.1;
  if(qs.length>=5 && ds.includes(qs)) return 800 + Math.min(140,qs.length*2);
  const qt=tokens(nq), dt=new Set(tokens(d));
  let overlap=0;
  for(const t of qt){if(dt.has(t))overlap+=1;else if([...dt].some(z=>z.startsWith(t)||t.startsWith(z)&&z.length>=4))overlap+=0.55;}
  const tokenScore=qt.length?overlap/qt.length:0;
  let tri=0;if(qs.length>=5){const a=trigramSet(qs);const b=trigramSet(ds);let hits=0;for(const x of a)if(b.has(x))hits++;tri=a.size?hits/a.size:0;}
  const isKorean=/[가-힣]/.test(nq);
  if(isKorean && k.includes(nq))return 1000;
  return 350*tokenScore + 220*tri + (qt.length>1 && overlap===qt.length?90:0);
}
export function search(rows,query,{chapter='all',limit=10}={}){
  if(!normalize(query))return [];
  const s=rows.filter(row=>chapter==='all'||row.chapter===chapter)
    .map((row,index)=>({row,score:score(row,query),index}))
    .filter(r=>r.score>125)
    .sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit);
  return s;
}
export function context(rows,row,indexOffset){
  const i=rows.findIndex(x=>x.id===row.id);
  if(i<0)return null;
  const n=i+indexOffset;
  if(n<0||n>=rows.length||rows[n].chapter!==row.chapter)return null;
  return rows[n];
}
