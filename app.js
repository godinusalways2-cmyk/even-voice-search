import { search, searchSpeech, assess, context, warmSearch } from './matcher.mjs?v=6';
const $=id=>document.getElementById(id);
let rows=[], ranked=[], active=null, recognition=null, listening=false;
let startedAt=0, lastDuration=null, lastTranscript='', lastMatched=false, logs=[], finalReceived=false;
let lastDiagnostics={options:'',candidates:'',confidence:''};
const DB_NAME='even-voice-bilingual-local-v1', STORE='private-text';
function setStatus(msg,warning=false){$('status').textContent=msg;$('status').classList.toggle('warn',warning)}
function getStore(mode='readonly'){
 return new Promise((resolve,reject)=>{
  const r=indexedDB.open(DB_NAME,1);
  r.onupgradeneeded=()=>r.result.createObjectStore(STORE);
  r.onerror=()=>reject(r.error);
  r.onsuccess=()=>{const db=r.result;try{const tx=db.transaction(STORE,mode);resolve({store:tx.objectStore(STORE),db,tx})}catch(e){db.close();reject(e)}};
 });
}
async function cachedRead(){const {store,db}=await getStore();try{return await new Promise((res,rej)=>{const r=store.get('rows');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}finally{db.close()}}
async function cachedWrite(value){const {store,db,tx}=await getStore('readwrite');return new Promise((resolve,reject)=>{tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>{db.close();reject(tx.error)};store.put(value,'rows')})}
async function cachedClear(){const {store,db,tx}=await getStore('readwrite');return new Promise((resolve,reject)=>{tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>{db.close();reject(tx.error)};store.delete('rows')})}
function setRows(data,label='개인 자료'){
 if(!Array.isArray(data)||!data.length||data.length>10000||data.some(x=>!x||typeof x.en!=='string'||typeof x.ko!=='string'))throw Error('영어(en)·한국어(ko) 쌍이 포함된 JSON 배열이어야 합니다.');
 rows=data.map((x,i)=>({id:String(x.id??'para-'+i),chapter:String(x.chapter??'미지정'),en:x.en,ko:x.ko,section:String(x.section??''),n:Number(x.n??i+1),heading:Boolean(x.heading)}));
 warmSearch(rows);
 const chapters=[...new Set(rows.map(r=>r.chapter))].sort();$('chapter').replaceChildren(new Option('전체 장','all'),...chapters.map(x=>new Option(x==='sample'?'샘플':x+'장',x)));
 $('db-chip').textContent=rows.length.toLocaleString('ko-KR')+'개';$('dbName').textContent=label+' · '+rows.length.toLocaleString('ko-KR')+'개 문단';
 setStatus('준비 완료. 영어 문장 5~10단어를 말하거나 입력해 보세요.');runSearch();
 const prompts=$('voicePrompts');
 if(prompts){
   prompts.replaceChildren();
   const c4=rows.filter(x=>x.chapter==='4'&&x.en.split(/\s+/).length>9);
   const c3=rows.filter(x=>x.chapter==='3'&&x.en.split(/\s+/).length>9);
   const chosen=[c4[0],c4[Math.min(15,c4.length-1)],c3[0]].filter((x,i,a)=>x&&a.indexOf(x)===i);
   for(const [i,row] of chosen.entries()){
     const p=document.createElement('p');
     p.textContent=(i+1)+' · '+row.en.trim().split(/\s+/).slice(0,10).join(' ');
     prompts.append(p);
   }
   if(!chosen.length)prompts.textContent='영어 원문이 10단어 이상인 문단을 찾지 못했습니다.';
 }
}
function setActive(row,meta=''){
 active=row;$('previous').disabled=!row;$('next').disabled=!row;
 if(!row){$('reference').textContent='결과 없음';$('translation').textContent=rows.length?'검색어를 조금 더 길게 입력해 보세요.':'먼저 개인 DB를 불러오세요.';$('english').textContent='';return}
 $('reference').textContent=`${row.chapter==='sample'?'샘플':row.chapter+'장'} · ${row.section||'서론'} · 문단 #${row.n}${meta?' · '+meta:''}`;
 $('translation').textContent=row.ko;
 $('english').textContent=row.en;
}
function runSearch(override=null, voiceQuery=null){
 const q=(voiceQuery ?? $('q').value).trim();
 const alt=$('alternatives');
 if(!q||!rows.length){
   ranked=[];lastMatched=false;setActive(null);
   $('confidence').textContent='미검색';alt.replaceChildren();return;
 }
 ranked=override ?? search(rows,q,{chapter:$('chapter').value,limit:5});
 const verdict=assess(ranked,q);
 lastMatched=verdict.confident;
 $('confidence').textContent=verdict.label;
 const canShow=verdict.state==='exact'||verdict.state==='likely';
 setActive(canShow ? ranked[0]?.row||null : null);
 if(verdict.state==='ambiguous'){
   $('reference').textContent='자동 선택 보류 · 후보를 확인하세요';
   $('translation').textContent='비슷한 문단이 여럿 있습니다. 영어 구절을 조금 더 길게 말하거나 아래 후보를 선택해 주세요.';
 }
 alt.replaceChildren();
 ranked.forEach((r,i)=>{
   const b=document.createElement('button');
   b.type='button';
   b.textContent=(i+1)+'순위 · '+r.row.chapter+'장 #'+r.row.n+' · '+r.row.en.slice(0,66)+(r.row.en.length>66?'…':'');
   if(canShow&&i===0)b.classList.add('active');
   b.addEventListener('click',()=>{
     setActive(r.row,'직접 선택한 후보');
     $('confidence').textContent='직접 선택한 후보 · 원문 확인';
     alt.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
     b.classList.add('active');
   });
   alt.append(b);
 });
}
function onRecognized(s,interim=false,alternatives=[]){
 $('heard').textContent=(interim?'인식 중: ':'인식 완료: ')+s;
 if(interim)return;
 lastTranscript=s;
 $('q').value=s;
 if(alternatives.length){
   const result=searchSpeech(rows,[s,...alternatives],{chapter:$('chapter').value,limit:5});
   runSearch(result.results,result.selected||s);
   if(result.selected && result.selected!==s)
     $('heard').textContent='인식 완료: '+s+'\nDB와 비교한 다른 음성 후보: '+result.selected;
 }else{
   runSearch();
 }
 $('heard').style.whiteSpace='pre-line';
 lastDiagnostics={options:[s,...alternatives].join(' | '),candidates:ranked.slice(0,3).map(x=>x.row.id+':'+Math.round(x.score)).join(' | '),confidence:$('confidence').textContent};
 lastDuration=startedAt?Math.round(performance.now()-startedAt):null;
 $('latency').textContent=lastDuration!==null?(lastDuration/1000).toFixed(1)+'초':'';
 setStatus('검색 완료. 아래 번역문과 인식된 영어를 확인해 보세요.');
}
function setupSpeech(){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){$('mic').disabled=true;setStatus('이 브라우저에서는 음성 인식이 지원되지 않습니다. 안드로이드 Chrome 또는 아이폰 Safari에서 HTTPS로 열어 보세요.',true);return}
 recognition=new SR();recognition.lang='en-US';recognition.continuous=false;recognition.interimResults=true;recognition.maxAlternatives=3;
 recognition.onstart=()=>{listening=true;finalReceived=false;$('mic').classList.add('recording');$('micLabel').textContent='듣는 중 · 끝내려면 누르세요';$('micHint').textContent='한 번에 영어 한 문장만 읽어 보세요';setStatus('음성 듣는 중…')};
 recognition.onresult=e=>{let final='',partial='';for(let i=0;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)final+=' '+t;else partial+=' '+t}
  if(final.trim()){
    finalReceived=true;
    const lastFinal=Array.from(e.results).filter(r=>r.isFinal).at(-1);
    const alts=lastFinal?Array.from(lastFinal).map(x=>x?.transcript?.trim()).filter(Boolean).slice(1):[];
    onRecognized(final.trim(),false,alts);
  }else if(partial.trim())onRecognized(partial.trim(),true);
 };
 recognition.onend=()=>{listening=false;$('mic').classList.remove('recording');$('micLabel').textContent='마이크 눌러 말하기';$('micHint').textContent='영어 5~10단어부터 시험하세요';if(!finalReceived && !lastTranscript)setStatus('음성이 인식되지 않았습니다. 다시 시도해 보세요.',true)};
 recognition.onerror=e=>{setStatus(`음성 인식 오류(${e.error}). 권한·인터넷·브라우저를 확인하세요.`,true)};
}
$('mic').addEventListener('click',()=>{if(!recognition)return;if(listening){recognition.stop();return}if(!rows.length){setStatus('먼저 개인 DB를 불러오거나 샘플 체험을 누르세요.',true);return}lastTranscript='';lastDuration=null;$('latency').textContent='';$('heard').textContent='듣는 중…';startedAt=performance.now();try{recognition.start()}catch(e){setStatus(e.message,true)}});
$('q').addEventListener('input',()=>{lastTranscript='';runSearch()});$('chapter').addEventListener('change',runSearch);
$('clearSearch').addEventListener('click',()=>{$('q').value='';$('heard').textContent='검색어를 지웠습니다.';runSearch()});
$('previous').addEventListener('click',()=>{const target=active&&context(rows,active,-1);if(target)setActive(target,'앞 문단')});
$('next').addEventListener('click',()=>{const target=active&&context(rows,active,1);if(target)setActive(target,'다음 문단')});
$('database').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());setRows(data,file.name);if($('remember').checked){await cachedWrite({data,label:file.name});setStatus('자료를 이 기기에 저장했습니다. 검색해 보세요.')}}catch(err){setStatus('파일을 읽지 못했습니다: '+err.message,true)}});
$('sample').addEventListener('click',async()=>{try{const r=await fetch('./sample_pairs.json');if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();setRows(data,'가상 샘플 3개');$('remember').checked=false}catch(e){setStatus('샘플 불러오기 실패: '+e.message,true)}});
$('clearCache').addEventListener('click',async()=>{try{await cachedClear();$('remember').checked=false;setStatus('이 기기에 저장된 번역 자료를 삭제했습니다. 현재 화면의 자료는 새로고침 전까지 남아 있습니다.')}catch(e){setStatus('저장된 자료를 삭제할 수 없습니다: '+e.message,true)}});
function refreshLogs(){
 $('trialCount').textContent = logs.length + '회';
 $('logs').textContent = logs.length ? logs.slice(-7).reverse().map((r,i) => (logs.length-i) + '회 · '+r.volume+' · '+(r.correct?'정답':'오답')+' · '+(r.seconds??'-')+'초 · '+r.text.slice(0,55)).join('\n') : '아직 기록 없음';
 $('logs').style.whiteSpace='pre-line';
 const summary=$('testSummary');
 if(summary){
   const groups=['보통 목소리','작은 목소리','속삭임'];
   summary.textContent=groups.map(v=>{const data=logs.filter(x=>x.volume===v);const wins=data.filter(x=>x.correct).length;return v+': '+wins+'/'+data.length+' 정답'+(data.length?' ('+Math.round(wins/data.length*100)+'%)':'')}).join(' · ');
 }
}
function record(correct){if(!lastTranscript && correct){setStatus('먼저 마이크로 영어를 읽어 인식 결과를 만드세요.',true);return}logs.push({timestamp:new Date().toISOString(),volume:$('volumeLabel').value,correct,seconds:lastDuration!==null?Number((lastDuration/1000).toFixed(2)):null,text:lastTranscript||'(인식 없음)',options:lastDiagnostics.options,candidates:lastDiagnostics.candidates,confidence:lastDiagnostics.confidence,chapter:active?.chapter??'',paragraph:active?.n??''});refreshLogs();setStatus('실험 기록 저장됨. 다른 발화 조건도 시험해 보세요.')}
$('recordSuccess').addEventListener('click',()=>record(true));$('recordFail').addEventListener('click',()=>record(false));$('resetLog').addEventListener('click',()=>{logs=[];refreshLogs()});
$('exportLog').addEventListener('click',()=>{if(!logs.length){setStatus('저장할 기록이 없습니다.',true);return}const h=['timestamp','volume','correct','seconds','text','options','candidates','confidence','chapter','paragraph'];const csv='\ufeff'+[h.join(','),...logs.map(r=>h.map(k=>'"'+String(r[k]??'').replaceAll('"','""')+'"').join(','))].join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='voice-test-results.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)});
(async()=>{setupSpeech();try{const saved=await cachedRead();if(saved?.data)setRows(saved.data,(saved.label||'이전에 저장한 DB')+' (기기 저장본)');else if(recognition)setStatus('개인 DB 파일을 선택하거나 샘플 체험을 누르세요.')}catch(e){if(recognition)setStatus('개인 DB를 선택해 주세요. 브라우저에 저장하지 못할 수 있습니다.')}refreshLogs()})();


// Read-only bridge for the optional continuous listening module.
// A preview never modifies the search box or recorded final transcript.
window.evenContinuousBridge = {
  hasDb: () => rows.length > 0,
  isOnceListening: () => listening,
  lookup: (phrase, { preview = false, alternatives = [] } = {}) => {
    const start = performance.now();
    if (!rows.length) return { matched: false, searchMs: 0 };
    if (preview) {
      const candidates = search(rows, phrase, { chapter: $('chapter').value, limit: 3 });
      const ms = performance.now() - start;
      const best = candidates[0];
      const verdict = assess(candidates, phrase);
      // Interim display must be an exact match; final recognition will re-rank.
      if (!best || verdict.state !== 'exact')
        return { matched: false, uncertain: verdict.state === 'ambiguous', searchMs: ms, preview: true };
      return {
        matched: true, preview: true, searchMs: ms,
        reference: best.row.chapter + '장 · ' + (best.row.section || '서론') + ' · 문단 #' + best.row.n,
        confidence: '원문 구절 일치 · 임시 인식', translation: best.row.ko
      };
    }
    const distinct = [phrase, ...alternatives].filter(Boolean);
    const found = searchSpeech(rows, distinct, { chapter: $('chapter').value, limit: 5 });
    const selected = found.selected || phrase;
    $('q').value = phrase;
    $('heard').textContent = '인식한 영어: ' + phrase +
      (selected !== phrase ? '\nDB 비교로 선택한 다른 음성 후보: ' + selected : '');
    $('heard').style.whiteSpace = 'pre-line';
    lastTranscript = phrase;
    lastDuration = null;
    $('latency').textContent = '';
    runSearch(found.results, selected);
    lastDiagnostics={options:distinct.join(' | '),candidates:ranked.slice(0,3).map(x=>x.row.id+':'+Math.round(x.score)).join(' | '),confidence:$('confidence').textContent};
    const verdict = assess(found.results, selected);
    const ms = performance.now() - start;
    const chosen = found.results[0];
    return {
      matched: !!active,
      uncertain: found.results.length > 0 && !active,
      searchMs: ms, preview: false,
      reference: $('reference').textContent,
      confidence: verdict.label + (selected !== phrase ? ' · 다른 인식 후보 사용' : ''),
      translation: active?.ko || '',
      alternativesChecked: found.alternativeCount
    };
  }
};
