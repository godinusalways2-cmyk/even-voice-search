// Opt-in continuous voice search; private DB remains on the user's device.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const byId = id => document.getElementById(id);
const button = byId('autoListen');
const indicator = byId('autoStatus');
const preview = byId('autoPreview');
const previewHeading = byId('autoPreviewHeading');
const previewBody = byId('autoPreviewBody');
const onceButton = byId('mic');
let recognizer = null;
let wanted = false;
let running = false;
let retryTimer = null;
let failures = 0;
let heardInSession = false;
let seenFinals = new Map();
let lastPhrase = '';
let lastPhraseTime = 0;

function show(message, isWarning = false) {
  indicator.textContent = message;
  indicator.classList.toggle('warn', isWarning);
}
function paint() {
  button.classList.toggle('is-listening', wanted);
  button.textContent = wanted ? '■ 연속 듣기 종료' : '▶ 연속 듣기 시작';
  button.setAttribute('aria-pressed', wanted ? 'true' : 'false');
  if (onceButton && SR) onceButton.disabled = wanted;
}
function clearRetry() {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}
function halt(message, isWarning = false) {
  wanted = false;
  clearRetry();
  const old = recognizer;
  recognizer = null;
  running = false;
  if (old) {
    old.onend = null;
    old.onerror = null;
    old.onresult = null;
    try { old.stop(); } catch (_) { /* already ended */ }
  }
  paint();
  show(message, isWarning);
}
function handlePhrase(phrase) {
  phrase = phrase.trim();
  const wordCount = phrase.split(/\s+/).filter(Boolean).length;
  if (wordCount < 3) {
    show('너무 짧은 구절입니다. 영어를 5~10단어 정도 읽어보세요.');
    return;
  }
  const now = Date.now();
  if (phrase.toLowerCase() === lastPhrase.toLowerCase() && now - lastPhraseTime < 1600) return;
  lastPhrase = phrase;
  lastPhraseTime = now;
  const response = window.evenContinuousBridge?.lookup(phrase);
  if (!response) {
    halt('검색기 연결을 찾지 못했습니다. Safari 새로고침 후 다시 실행하세요.', true);
    return;
  }
  preview.hidden = false;
  if (!response.matched) {
    previewHeading.textContent = '일치하는 문단을 찾지 못했습니다';
    previewBody.textContent = '영어 구절을 조금 더 길게 말해보세요.';
    show('계속 듣는 중 · 다음 구절을 읽어주세요.');
    return;
  }
  previewHeading.textContent = response.reference + ' · ' + response.confidence;
  previewBody.textContent = response.translation;
  show('계속 듣는 중 · 문장이 끝날 때마다 자동 검색합니다.');
}
function createRecognizer() {
  const rec = new SR();
  rec.lang = 'en-US';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  return rec;
}
function startSession() {
  if (!wanted) return;
  if (document.visibilityState === 'hidden') {
    halt('Safari 화면이 가려져 듣기를 중단했습니다. 돌아와서 다시 시작하세요.', true);
    return;
  }
  const rec = createRecognizer();
  recognizer = rec;
  heardInSession = false;
  seenFinals = new Map();
  rec.onstart = () => {
    if (!wanted || recognizer !== rec) return;
    running = true;
    show('마이크 켜짐 · 영어 문장을 읽어보세요.');
  };
  rec.onresult = event => {
    if (!wanted || recognizer !== rec) return;
    let partial = '';
    const finalPhrases = [];
    for (let i = event.resultIndex ?? 0; i < event.results.length; i++) {
      const item = event.results[i];
      const text = (item?.[0]?.transcript || '').trim();
      if (!text) continue;
      if (item.isFinal) {
        if (seenFinals.get(i) !== text) {
          seenFinals.set(i, text);
          finalPhrases.push(text);
        }
      } else {
        partial += (partial ? ' ' : '') + text;
      }
    }
    if (finalPhrases.length) {
      heardInSession = true;
      failures = 0;
      for (const phrase of finalPhrases) handlePhrase(phrase);
    } else if (partial) {
      show('인식 중: ' + partial.slice(0, 90));
    }
  };
  rec.onerror = event => {
    if (!wanted || recognizer !== rec) return;
    const error = event.error || 'unknown';
    if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(error)) {
      halt('마이크/음성 인식 권한 오류(' + error + '). Safari 설정을 확인하고 다시 시작하세요.', true);
    } else if (error === 'network') {
      halt('음성 인식 네트워크 오류. 연결 상태를 확인한 후 다시 시작하세요.', true);
    } else if (error !== 'no-speech' && error !== 'aborted') {
      show('음성 인식 오류(' + error + '). 자동 복구를 시도합니다.', true);
    }
  };
  rec.onend = () => {
    if (!wanted || recognizer !== rec) return;
    running = false;
    recognizer = null;
    if (document.visibilityState === 'hidden') {
      halt('화면이 잠기거나 Safari를 벗어나서 듣기를 중단했습니다.', true);
      return;
    }
    if (!heardInSession) failures += 1;
    else failures = 0;
    if (failures > 3) {
      halt('Safari가 연속 듣기를 반복 종료했습니다. 다시 시작 버튼을 눌러주세요.', true);
      return;
    }
    show('음성 인식 세션이 끝났습니다. 자동으로 다시 연결하는 중…');
    clearRetry();
    retryTimer = setTimeout(() => {
      retryTimer = null;
      startSession();
    }, Math.min(1800, 350 + failures * 400));
  };
  try {
    rec.start();
  } catch (error) {
    halt('Safari가 마이크 재시작을 허용하지 않았습니다. 시작 버튼을 다시 눌러주세요. (' + (error?.name || '오류') + ')', true);
  }
}
button.addEventListener('click', () => {
  if (wanted) {
    halt('연속 듣기를 종료했습니다.');
    return;
  }
  if (!SR) {
    show('이 Safari에서는 음성 인식 기능을 사용할 수 없습니다.', true);
    return;
  }
  const bridge = window.evenContinuousBridge;
  if (!bridge?.hasDb()) {
    show('개인 DB를 먼저 불러오세요. 1,107개가 표시되어야 합니다.', true);
    return;
  }
  if (bridge.isOnceListening()) {
    show('현재 1회 듣기가 끝난 뒤 연속 듣기를 시작해 주세요.', true);
    return;
  }
  wanted = true;
  failures = 0;
  lastPhrase = '';
  lastPhraseTime = 0;
  paint();
  show('마이크 연결 요청 중…');
  startSession();
});
document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'hidden') {
    halt('Safari를 벗어나거나 화면이 잠겨 연속 듣기를 중단했습니다. 다시 시작하세요.', true);
  }
});
window.addEventListener('pagehide', () => {
  if (wanted) halt('페이지를 벗어나 연속 듣기를 중단했습니다.');
});
if (!SR) {
  button.disabled = true;
  show('이 기기의 브라우저는 음성 인식을 지원하지 않습니다.', true);
} else {
  paint();
  show('개인 DB를 불러온 뒤 한 번 눌러 시작하세요. Safari 화면을 켜 둬야 합니다.');
}