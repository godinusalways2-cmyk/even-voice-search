import { AudioInputSource, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { pcmToWav, MAX_AUDIO_BYTES } from './wav.mjs';
import { search, assess, warmSearch } from '../matcher.mjs';
import { shortSearch, shortAssessment, warmShort } from '../short-search.mjs';
import samplePairs from '../sample_pairs.json';

const $ = (id) => document.getElementById(id);
const STORAGE_DB = 'g2-voice-personal-corpus-v1';
const STORAGE_ROWS = 'pairs';
const PCM_LIMIT_MS = 10000;
let bridge, unsubscribe, recording = false, busy = false, stopTimer;
let audioChunks = [], audioBytes = 0, packetCount = 0, rows = [];
let results = [], chosen = 0, lastEnglish = '';

function setStatus(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}

function glassesPage(content) {
  return {
    containerTotalNum: 1,
    textObject: [{
      xPosition: 0, yPosition: 0, width: 576, height: 288,
      containerID: 1, containerName: 'translation',
      content, isEventCapture: 1,
    }],
  };
}
async function glasses(content) {
  if (!bridge) return;
  return bridge.rebuildPageContainer(glassesPage(String(content).slice(0, 240)));
}
function preview(s, limit = 120) {
  return String(s || '').length > limit ? String(s).slice(0, limit - 1) + '…' : String(s || '');
}
function outputLens(row, label) {
  const ref = row.chapter + '장 · 문단 ' + row.n;
  void glasses(label + '\n' + ref + '\n' + preview(row.ko, 125));
}
function updateMicStats() {
  $('micStats').textContent = '마이크 수신: ' + packetCount + '패킷 · ' +
    (audioBytes / 1024).toFixed(1) + 'KB';
}
function jsonValidated(input) {
  if (!Array.isArray(input) || !input.length || input.length > 10000
      || input.some(x => !x || typeof x.en !== 'string' || typeof x.ko !== 'string')) {
    throw new Error('영어 en / 한국어 ko 필드를 가진 JSON 배열이 필요합니다.');
  }
  return input.map((x, i) => ({
    id: String(x.id ?? ('pair-' + i)),
    chapter: String(x.chapter ?? '미분류'),
    n: Number.isFinite(Number(x.n)) ? Number(x.n) : i + 1,
    section: String(x.section ?? ''),
    en: x.en, ko: x.ko,
  }));
}

async function readDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORAGE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORAGE_ROWS);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORAGE_ROWS, 'readonly');
      const get = tx.objectStore(STORAGE_ROWS).get('rows');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
      tx.oncomplete = tx.onabort = tx.onerror = () => db.close();
    };
  });
}
async function writeDb(value) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORAGE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORAGE_ROWS);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORAGE_ROWS, 'readwrite');
      tx.objectStore(STORAGE_ROWS).put(value, 'rows');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}
async function clearDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORAGE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORAGE_ROWS);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORAGE_ROWS, 'readwrite');
      tx.objectStore(STORAGE_ROWS).delete('rows');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}
function loadRows(input, label) {
  rows = jsonValidated(input);
  warmSearch(rows);
  warmShort(rows);
  $('dbStatus').textContent = label + ': ' + rows.length.toLocaleString('ko-KR') + '개 문단';
  $('corpusHint').textContent = '영한 자료는 이 휴대전화 앱 안에서만 검색합니다. 음성만 인식 서비스로 전송됩니다.';
  const chapters = [...new Set(rows.map(x => x.chapter))].sort();
  $('chapter').replaceChildren(
    new Option('전체 장', 'all'),
    ...chapters.map(x => new Option(x === 'sample' ? '샘플' : x + '장', x))
  );
  if (lastEnglish) lookup(lastEnglish);
}
function normalizeSettings() {
  const origin = $('endpoint').value.trim().replace(/\/+$/, '');
  if (origin && (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin) || origin.includes('@'))) {
    throw new Error('https://...workers.dev 형식의 서버 주소를 입력해 주세요.');
  }
  if (origin && !origin.endsWith('.workers.dev')) {
    throw new Error('이번 시험에서는 본인이 만든 workers.dev 서버만 연결할 수 있습니다.');
  }
  return origin;
}
function saveSettings() {
  try {
    const endpoint = normalizeSettings();
    sessionStorage.setItem('g2_stt_endpoint', endpoint);
    sessionStorage.setItem('g2_stt_access_token', $('accessToken').value.trim());
    setStatus('음성 인식 서버 설정을 이 실행 세션에 저장했습니다.');
  } catch (error) {
    setStatus(error.message, true);
  }
}
function lookup(english) {
  lastEnglish = String(english || '').trim();
  $('heard').textContent = lastEnglish || '아직 인식된 문장이 없습니다.';
  $('searchText').value = lastEnglish;
  if (!lastEnglish) return;
  if (!rows.length) {
    results = [];
    $('matchStatus').textContent = 'DB가 없습니다. 개인 JSON 파일을 가져오세요.';
    $('korean').textContent = '';
    $('englishOriginal').textContent = '';
    void glasses('영어 인식 완료\n' + preview(lastEnglish, 175));
    return;
  }
  const count = lastEnglish.split(/\s+/).filter(Boolean).length;
  const short = count >= 2 && count <= 5 && !/[가-힣]/.test(lastEnglish);
  const chapter = $('chapter').value;
  results = short
    ? shortSearch(rows, lastEnglish, { chapter, limit: 5 })
    : search(rows, lastEnglish, { chapter, limit: 5 });
  const verdict = short ? shortAssessment(results, lastEnglish) : assess(results, lastEnglish);
  chosen = 0;
  $('matchStatus').textContent = verdict.label;
  const select = $('choices');
  select.replaceChildren();
  results.forEach((r, i) => select.append(new Option(
    (i + 1) + '순위 · ' + r.row.chapter + '장 #' + r.row.n, String(i)
  )));
  if (!results.length) {
    $('korean').textContent = '해당 문단을 찾지 못했습니다.';
    $('englishOriginal').textContent = '';
    void glasses('검색 결과 없음\n' + preview(lastEnglish, 165));
    return;
  }
  showCandidate(0, verdict);
}
function showCandidate(index, verdict = null) {
  const item = results[index];
  if (!item) return;
  chosen = index;
  $('choices').value = String(index);
  const isCertain = verdict?.confident && index === 0;
  const label = isCertain ? '원문 일치' : '후보 · 원문 확인 필요';
  $('matchStatus').textContent = label + ' · ' + item.row.chapter + '장 #' + item.row.n;
  $('korean').textContent = item.row.ko;
  $('englishOriginal').textContent = item.row.en;
  outputLens(item.row, label);
}
async function connectGlasses() {
  try {
    bridge = await waitForEvenAppBridge();
    await bridge.createStartUpPageContainer(glassesPage('G2 영한검색\n음성 인식 준비'));
    unsubscribe = bridge.onEvenHubEvent(event => {
      if (!recording || !event.audioEvent?.audioPcm) return;
      const chunk = event.audioEvent.audioPcm;
      const array = chunk instanceof Uint8Array ? chunk : Uint8Array.from(chunk);
      if (audioBytes + array.byteLength > MAX_AUDIO_BYTES) return;
      audioChunks.push(array.slice());
      audioBytes += array.byteLength;
      packetCount++;
      if (packetCount % 10 === 0) updateMicStats();
    });
    $('record').disabled = false;
    $('lensCheck').disabled = false;
    setStatus('G2 안경 연결됨 · 마이크 테스트 준비 완료');
  } catch (error) {
    setStatus('G2 안경 연결 실패: ' + (error?.message || error), true);
  }
}
async function transcribe(wav) {
  const endpoint = normalizeSettings();
  const token = $('accessToken').value.trim();
  if (!endpoint || !token) {
    throw new Error('음성은 수신됐습니다. 인식하려면 개인 STT 서버 주소와 접근 토큰이 필요합니다.');
  }
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 45000);
  try {
    const response = await fetch(endpoint + '/transcribe', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'audio/wav' },
      body: wav,
      signal: abort.signal,
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'STT HTTP ' + response.status);
    if (!result.text || !result.text.trim()) throw new Error('음성을 글자로 인식하지 못했습니다.');
    return result.text.trim();
  } finally {
    clearTimeout(timer);
  }
}
async function finishRecording() {
  if (!recording || busy) return;
  busy = true;
  clearTimeout(stopTimer);
  try {
    await bridge.audioControl(false);
    recording = false;
    $('record').textContent = 'G2 마이크로 영어 듣기 (10초)';
    updateMicStats();
    if (audioBytes < 16000) {
      setStatus('음성 데이터가 충분하지 않습니다. 다시 말해보세요.', true);
      await glasses('음성 수신 부족\n다시 시도해 주세요');
      return;
    }
    const wav = pcmToWav(audioChunks);
    audioChunks = [];
    setStatus('G2 오디오 수신 완료 · 영어 인식 중…');
    await glasses('영어 음성 인식 중…');
    const text = await transcribe(wav);
    setStatus('영어 인식 완료 · 일치 문단 검색');
    lookup(text);
  } catch (error) {
    setStatus('음성 인식: ' + String(error?.message || error), true);
    await glasses('마이크 데이터 수신: ' + packetCount + '개\n음성 인식은 아직 미완료');
  } finally {
    recording = false;
    audioChunks = [];
    busy = false;
  }
}
async function startRecording() {
  if (!bridge || busy) return;
  if (recording) { await finishRecording(); return; }
  busy = true;
  audioChunks = [];
  audioBytes = 0;
  packetCount = 0;
  updateMicStats();
  try {
    await glasses('G2 마이크 듣는 중\n영어 문장을 읽으세요');
    const enabled = await bridge.audioControl(true, AudioInputSource.Glasses);
    if (enabled !== true) throw new Error('마이크 활성화 실패: ' + String(enabled));
    recording = true;
    $('record').textContent = '녹음 중지 · 인식 요청';
    setStatus('10초간 듣고 있습니다. 문장을 읽은 뒤 중지를 눌러도 됩니다.');
    stopTimer = setTimeout(() => { void finishRecording(); }, PCM_LIMIT_MS);
  } catch (error) {
    setStatus('마이크 시작 실패: ' + (error?.message || error), true);
  } finally { busy = false; }
}

$('record').addEventListener('click', () => { void startRecording(); });
$('saveSettings').addEventListener('click', saveSettings);
$('lensCheck').addEventListener('click', () => { void glasses('G2 렌즈 연결 성공\n영한 검색기 v0.2.0'); });
$('loadSample').addEventListener('click', () => {
  loadRows(samplePairs, '공개 테스트 자료');
  setStatus('샘플 문단 3개를 불러왔습니다. 원문을 입력해 검색해보세요.');
});
$('database').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) { setStatus('12MB 이하 JSON 파일만 사용할 수 있습니다.', true); return; }
  try {
    const input = JSON.parse(await file.text());
    loadRows(input, file.name);
    try { await writeDb({ rows, label: file.name }); }
    catch { setStatus('DB를 불러왔지만 저장은 지원되지 않습니다. 다음 실행 시 재선택해 주세요.', true); return; }
    setStatus('개인 DB가 이 앱의 로컬 저장 공간에 보관됐습니다. 서버로 전송하지 않았습니다.');
  } catch (error) {
    setStatus('DB 불러오기 실패: ' + error.message, true);
  }
});
$('forgetDb').addEventListener('click', async () => {
  try {
    await clearDb();
    rows = [];
    results = [];
    $('choices').replaceChildren();
    $('dbStatus').textContent = '개인 DB 없음';
    $('korean').textContent = '';
    $('englishOriginal').textContent = '';
    setStatus('이 앱의 저장된 개인 DB를 삭제했습니다.');
  } catch (error) {
    setStatus('DB 삭제 실패: ' + error.message, true);
  }
});
$('manualSearch').addEventListener('click', () => lookup($('searchText').value));
$('searchText').addEventListener('keydown', e => { if (e.key === 'Enter') lookup($('searchText').value); });
$('choices').addEventListener('change', e => showCandidate(Number(e.target.value)));
$('chapter').addEventListener('change', () => { if (lastEnglish) lookup(lastEnglish); });
window.addEventListener('pagehide', () => {
  clearTimeout(stopTimer);
  if (recording && bridge) void bridge.audioControl(false);
  unsubscribe?.();
});
try {
  $('endpoint').value = sessionStorage.getItem('g2_stt_endpoint') || '';
  $('accessToken').value = sessionStorage.getItem('g2_stt_access_token') || '';
} catch { /* a restrictive WebView may disable session storage */ }
readDb().then(saved => {
  if (saved?.rows) loadRows(saved.rows, (saved.label || '개인 자료') + ' (로컬 복원)');
}).catch(() => { /* private mode may not support IndexedDB */ });
connectGlasses();
