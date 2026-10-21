import { createZip } from './zip-store.mjs?v=7';
// Entire sample collection is local and opt-in. No network/upload code.
const $=id=>document.getElementById(id);
const DB_NAME='even-voice-bilingual-local-v1', STORE='private-text';
const modes=['normal','soft','whisper'];
const names={normal:'보통 목소리',soft:'작은 목소리',whisper:'속삭임'};
let prompts=[],clips=new Map(),recorder=null,stream=null,recordStart=0;
let recordingKey='',recordingPrompt=null,recordingMode='',chunks=[],limitTimer=null;
let previousPreviewUrl=null;
const clean=text=>String(text||'').replace(/\s+/g,' ').trim();
function status(text,error=false){$('labStatus').textContent=text;$('labStatus').classList.toggle('error',error);}
function clipKey(mode,prompt){return mode+'|'+prompt.id;}
function selectPrompt(rows,count){
  const available=rows.filter(r=>r&&!r.heading&&typeof r.en==='string'&&
    clean(r.en).split(' ').length>=13&&['3','4'].includes(String(r.chapter)));
  const sampleFrom=(chapter,num)=>{
    const list=available.filter(r=>String(r.chapter)===chapter);
    if(!list.length)return [];
    const chosen=[];
    for(let i=0;i<num;i++){
      const idx=Math.floor((i+0.35)*list.length/num);
      const row=list[Math.min(list.length-1,idx)];
      if(!chosen.some(x=>x.id===row.id))chosen.push(row);
    }
    return chosen;
  };
  const a=sampleFrom('3',Math.ceil(count/2)),b=sampleFrom('4',Math.floor(count/2));
  const chosen=[];
  const seen=new Set();
  for(let i=0;i<Math.max(a.length,b.length);i++){
    for(const row of [a[i],b[i]]){
      if(!row)continue;
      const phrase=clean(row.en).split(' ').slice(0,12).join(' ');
      if(seen.has(phrase.toLowerCase()))continue;
      seen.add(phrase.toLowerCase());
      chosen.push({id:String(row.id),chapter:String(row.chapter),section:String(row.section||''),text:phrase});
    }
  }
  return chosen.slice(0,count);
}
function update() {
  $('counter').textContent=clips.size+' / '+(prompts.length*3||0);
  $('savedBadge').textContent=clips.size+'개 녹음';
  $('download').disabled=!clips.size||!!recorder;
  $('record').disabled=!prompts.length||!!recorder;
  $('stop').disabled=!recorder;
  $('next').disabled=!prompts.length||!!recorder;
  $('retry').disabled=!clips.size||!!recorder;
  const prompt=prompts[Number($('prompt').value)];
  const mode=$('style').value;
  if(prompt){
    $('promptMeta').textContent=prompt.chapter+'장 · '+prompt.section+' · 문장 '+(Number($('prompt').value)+1);
    $('promptText').textContent=prompt.text;
    $('progress').textContent=(clips.has(clipKey(mode,prompt))?'✓ 이 조건은 녹음 완료 · 다시 녹음하면 교체됩니다':'아직 녹음하지 않은 조건')+' · '+names[mode];
  }
  $('clipList').textContent=clips.size?[...clips.values()].map(c=>names[c.condition]+' · '+c.chapter+'장 · #'+c.promptIndex+' · '+(c.duration_ms/1000).toFixed(1)+'초').join('\n'):'아직 녹음한 문장이 없습니다.';
}
function populateSelect(){
  $('prompt').replaceChildren(...prompts.map((p,i)=>new Option((i+1)+'번 · '+p.chapter+'장',String(i))));
  $('prompt').value='0';
  update();
}
function installDb(data){
  if(!Array.isArray(data)||!data.every(x=>x&&typeof x.en==='string'&&typeof x.ko==='string'))throw Error('영한 쌍이 담긴 JSON 배열이어야 합니다.');
  if(clips.size)throw Error('녹음 자료가 있습니다. 먼저 ZIP으로 저장한 뒤 페이지를 새로 열어 주세요.');
  prompts=selectPrompt(data,Number($('promptCount').value));
  if(!prompts.length)throw Error('3·4장 영어 본문 문장을 선택할 수 없습니다.');
  $('dataBadge').textContent='준비 완료';
  $('dataStatus').textContent='원본 '+data.length.toLocaleString('ko-KR')+'개에서 '+prompts.length+'개 영어 구절 선정 · 업로드 없음';
  populateSelect();
  status('준비되었습니다. 녹음 시작을 누를 때만 마이크가 켜집니다.');
}
async function loadSaved(){
  if(!('indexedDB' in window))return;
  try {
    const cached=await new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>req.result.createObjectStore(STORE);
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{
        const db=req.result;
        const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get('rows');
        r.onsuccess=()=>{resolve(r.result);db.close();};
        r.onerror=()=>{reject(r.error);db.close();};
      };
    });
    if(cached?.data)installDb(cached.data);
    else{$('dataBadge').textContent='DB 불러오기 필요';$('dataStatus').textContent='기기에 저장된 DB가 없습니다. 위에서 개인 JSON을 선택해 주세요.';}
  } catch(e){$('dataStatus').textContent='자동 저장본을 읽지 못했습니다. 개인 JSON 파일을 직접 선택하세요.';}
}
$('labJson').addEventListener('change',async e=>{
  const file=e.target.files?.[0];
  if(!file)return;
  try{installDb(JSON.parse(await file.text()));}
  catch(err){status('DB 선택 실패: '+err.message,true);}
  finally{e.target.value='';}
});
$('promptCount').addEventListener('change',async()=>{
  if(clips.size){status('녹음을 이미 시작했습니다. 자료를 먼저 내보낸 다음 문장 수를 변경하세요.',true);return;}
  const current=$('labJson').files?.[0];
  // The cached database can be reloaded, or an explicitly imported dataset remains in-memory below.
  if(currentData){prompts=selectPrompt(currentData,Number($('promptCount').value));populateSelect();}
});
let currentData=null;
const oldInstall=installDb;
installDb=function(data){const result=oldInstall(data);currentData=data;return result;};
$('prompt').addEventListener('change',update);
$('style').addEventListener('change',update);
function chooseFormat(){
  if(!('MediaRecorder' in window))throw Error('이 Safari에서는 녹음 API를 지원하지 않습니다.');
  const types=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];
  return types.find(x=>MediaRecorder.isTypeSupported?.(x))||'';
}
function endTracks(){
  if(stream){for(const track of stream.getTracks())track.stop();stream=null;}
}
function clearTimer(){if(limitTimer!==null){clearTimeout(limitTimer);limitTimer=null;}}
async function startRecord(){
  if(recorder||!prompts.length)return;
  const prompt=prompts[Number($('prompt').value)];
  if(!prompt)return;
  try{
    stream=await navigator.mediaDevices.getUserMedia({
      audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1}
    });
    const requested=chooseFormat();
    recorder=requested?new MediaRecorder(stream,{mimeType:requested,audioBitsPerSecond:96000}):
      new MediaRecorder(stream,{audioBitsPerSecond:96000});
    const rec=recorder;
    recordingKey=clipKey($('style').value,prompt);
    recordingPrompt=prompt;recordingMode=$('style').value;
    chunks=[];recordStart=performance.now();
    const captureSettings=stream.getAudioTracks()[0]?.getSettings?.()||{};
    rec.ondataavailable=e=>{if(e.data?.size>0)chunks.push(e.data);};
    rec.onerror=e=>{status('녹음 오류: '+(e.error?.message||'알 수 없는 문제'),true);clearTimer();endTracks();recorder=null;update();};
    rec.onstop=()=>{
      clearTimer();
      endTracks();
      const ms=Math.round(performance.now()-recordStart);
      const mime=rec.mimeType||requested||chunks[0]?.type||'application/octet-stream';
      const blob=new Blob(chunks,{type:mime});
      recorder=null;chunks=[];
      if(!blob.size){status('빈 음성이 녹음되었습니다. 다시 시도해 주세요.',true);update();return;}
      const ext=mime.includes('mp4')?'m4a':mime.includes('webm')?'webm':mime.includes('ogg')?'ogg':'bin';
      const clip={
        id:recordingKey,prompt_id:recordingPrompt.id,chapter:recordingPrompt.chapter,
        section:recordingPrompt.section,expected_text:recordingPrompt.text,
        promptIndex:Number($('prompt').value)+1,condition:recordingMode,
        recorded_at:new Date().toISOString(),duration_ms:ms,
        mime_type:mime,file_extension:ext,recorder_settings:{
          echoCancellation:captureSettings.echoCancellation??null,
          noiseSuppression:captureSettings.noiseSuppression??null,
          autoGainControl:captureSettings.autoGainControl??null,
          sampleRate:captureSettings.sampleRate??null,
          channelCount:captureSettings.channelCount??null
        },blob
      };
      clips.set(recordingKey,clip);
      if(previousPreviewUrl)URL.revokeObjectURL(previousPreviewUrl);
      previousPreviewUrl=URL.createObjectURL(blob);
      $('playback').src=previousPreviewUrl;$('playback').hidden=false;
      status('녹음 '+(ms/1000).toFixed(1)+'초가 이 페이지에 저장되었습니다. 들어보고 다음 문장으로 이동하세요.');
      update();
    };
    rec.start();
    $('record').textContent='● 녹음 중…';
    $('record').disabled=true;$('stop').disabled=false;
    $('style').disabled=true;$('prompt').disabled=true;
    status('● 녹음 중입니다. 영어를 읽고 녹음 종료를 누르세요.');
    limitTimer=setTimeout(stopRecord,15000);
  }catch(err){
    clearTimer();endTracks();recorder=null;
    status('마이크 시작 실패: '+(err.message||err.name),true);
    update();
  }
}
function stopRecord(){
  clearTimer();
  if(recorder?.state==='recording'){
    try{recorder.stop();}catch(e){status('녹음을 종료하지 못했습니다: '+e.message,true);}
  }
  $('record').textContent='● 녹음 시작';
  $('style').disabled=false;$('prompt').disabled=false;
  $('stop').disabled=true;
}
$('record').addEventListener('click',startRecord);
$('stop').addEventListener('click',stopRecord);
$('next').addEventListener('click',()=>{
  const current=Number($('prompt').value),i=modes.indexOf($('style').value);
  const total=prompts.length*modes.length;
  for(let offset=1;offset<=total;offset++){
    const num=(i*prompts.length+current+offset)%total;
    const nextMode=modes[Math.floor(num/prompts.length)];
    const nextPrompt=num%prompts.length;
    if(!clips.has(clipKey(nextMode,prompts[nextPrompt]))){
      $('style').value=nextMode;$('prompt').value=String(nextPrompt);
      $('playback').hidden=true;update();return;
    }
  }
  status('모든 조건을 녹음했습니다. ZIP으로 저장하세요.');
});
$('retry').addEventListener('click',()=>{
  if(!clips.size)return;
  const key=[...clips.keys()].at(-1);
  const clip=clips.get(key);
  clips.delete(key);
  $('style').value=clip.condition;
  const idx=prompts.findIndex(x=>x.id===clip.prompt_id);
  if(idx>=0)$('prompt').value=String(idx);
  $('playback').hidden=true;update();
  status('마지막 녹음을 삭제했습니다. 원하는 음성으로 다시 녹음하세요.');
});
$('download').addEventListener('click',async()=>{
  if(!clips.size||recorder)return;
  $('download').disabled=true;
  status('ZIP을 만드는 중입니다. 화면을 유지해 주세요.');
  try{
    const saved=[...clips.values()];
    const used=new Map();
    const archiveFiles=[];
    const manifest={
      format:'even-whisper-lab-v1',created_at:new Date().toISOString(),
      notes:'Explicit opt-in recordings on user's device, no automatic upload. WAV conversion/training not yet performed.',
      device_user_agent:navigator.userAgent,
      clips:saved.map(c=>{
        const base='audio/'+c.condition+'_'+c.chapter+'_'+String(c.promptIndex).padStart(3,'0');
        const same=used.get(base)||0;used.set(base,same+1);
        const filename=base+(same?'_'+same:'')+'.'+c.file_extension;
        archiveFiles.push({name:filename,data:c.blob});
        const {blob,id,file_extension,...metadata}=c;
        return {...metadata,filename};
      })
    };
    archiveFiles.unshift({name:'manifest.json',data:JSON.stringify(manifest,null,2)});
    const zip=await createZip(archiveFiles);
    const url=URL.createObjectURL(zip);
    const link=document.createElement('a');
    link.href=url;
    link.download='even-whisper-lab-'+new Date().toISOString().slice(0,10)+'.zip';
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    status('ZIP 내보내기를 요청했습니다. Safari 다운로드 또는 파일 앱에서 저장 여부를 확인하세요.');
  }catch(err){status('ZIP 생성 실패: '+err.message,true);}
  finally{update();}
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'&&recorder?.state==='recording')stopRecord();
});
window.addEventListener('pagehide',()=>{
  if(recorder?.state==='recording')stopRecord();
  endTracks();
});
loadSaved();
