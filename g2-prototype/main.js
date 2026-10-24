import { AudioInputSource, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

const status = document.getElementById('status');
const stats = document.getElementById('stats');
const button = document.getElementById('microphone');
const show = document.getElementById('show');
let bridge, unsubscribe;
let recording = false;
let packets = 0;
let bytes = 0;
let startedAt = 0;
let stopTimer;
let busy = false;

function page(content) {
  return {
    containerTotalNum: 1,
    textObject: [{
      xPosition: 0, yPosition: 0, width: 576, height: 288,
      containerID: 1, containerName: 'translation',
      content, isEventCapture: 1,
    }],
  };
}

async function display(content) {
  if (!bridge) return;
  return bridge.rebuildPageContainer(page(content));
}

function updateStats() {
  const seconds = recording ? Math.round((Date.now() - startedAt) / 1000) : 0;
  stats.textContent = '수신 패킷: ' + packets +
    ' · 데이터: ' + (bytes / 1024).toFixed(1) + ' KB' +
    (recording ? ' · 경과: ' + seconds + '초' : '');
}

async function connect() {
  try {
    bridge = await waitForEvenAppBridge();
    const result = await bridge.createStartUpPageContainer(page('G2 연결됨\n마이크 수신 테스트'));
    unsubscribe = bridge.onEvenHubEvent((event) => {
      if (!recording || !event.audioEvent?.audioPcm) return;
      packets += 1;
      bytes += event.audioEvent.audioPcm.byteLength ?? event.audioEvent.audioPcm.length ?? 0;
      updateStats();
    });
    status.textContent = '안경 연결 완료 · 시작 버튼을 눌러주세요 (연결 응답: ' + String(result) + ')';
    button.disabled = false;
    show.disabled = false;
  } catch (err) {
    status.textContent = '안경 연결 실패: ' + String(err?.message ?? err);
  }
}

async function stopRecording() {
  if (!recording || busy) return;
  busy = true;
  clearTimeout(stopTimer);
  try {
    await bridge.audioControl(false);
    recording = false;
    button.textContent = 'G2 마이크 12초 테스트 시작';
    status.textContent = bytes > 0
      ? 'G2 마이크 데이터 수신 성공'
      : '마이크 중지 · 수신 데이터 없음';
    updateStats();
    await display(bytes > 0
      ? 'G2 마이크 수신 성공\n패킷 ' + packets + '개\n데이터 ' + (bytes / 1024).toFixed(1) + ' KB'
      : 'G2 마이크 테스트 종료\n데이터 수신 없음');
  } catch (err) {
    recording = false;
    button.textContent = 'G2 마이크 12초 테스트 시작';
    status.textContent = '마이크 중지 오류: ' + String(err?.message ?? err);
  } finally {
    busy = false;
  }
}

async function startRecording() {
  if (!bridge || busy) return;
  if (recording) return stopRecording();
  busy = true;
  packets = 0;
  bytes = 0;
  startedAt = Date.now();
  updateStats();
  try {
    status.textContent = 'G2 마이크 시작 요청 중...';
    await display('G2 마이크 테스트\n지금 영어로 말해보세요');
    const enabled = await bridge.audioControl(true, AudioInputSource.Glasses);
    if (enabled !== true) {
      status.textContent = 'G2 마이크 활성화 실패: ' + String(enabled);
      await display('G2 마이크 실행 실패\n앱 권한을 확인하세요');
      return;
    }
    recording = true;
    button.textContent = '마이크 테스트 중지';
    status.textContent = 'G2 마이크 수신 중 · 12초 뒤 자동 종료';
    stopTimer = setTimeout(() => { void stopRecording(); }, 12000);
  } catch (err) {
    status.textContent = '마이크 시작 오류: ' + String(err?.message ?? err);
  } finally {
    busy = false;
  }
}

button.addEventListener('click', () => { void startRecording(); });
show.addEventListener('click', async () => {
  try {
    const result = await display('영한 검색기\n렌즈 표시 테스트');
    status.textContent = '렌즈 표시 요청: ' + String(result);
  } catch (err) {
    status.textContent = '렌즈 표시 실패: ' + String(err?.message ?? err);
  }
});
window.addEventListener('pagehide', () => {
  clearTimeout(stopTimer);
  if (bridge && recording) void bridge.audioControl(false);
  unsubscribe?.();
});
connect();
