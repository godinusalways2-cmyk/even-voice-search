// Private G2 audio -> OpenAI gpt-transcribe proxy.
// NO personal bilingual corpus, logs, storage, cookies, or API keys in browser code.
// Configure OPENAI_API_KEY and ACCESS_TOKEN as Cloudflare Worker *secrets*.
const MAX_WAV_BYTES = 16_000 * 2 * 15 + 44;
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '600',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
async function matchingSecret(candidate, expected) {
  if (typeof candidate !== 'string' || typeof expected !== 'string') return false;
  if (!candidate || expected.length < 32 || candidate.length !== expected.length) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(candidate)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  let diff = 0;
  const x = new Uint8Array(a), y = new Uint8Array(b);
  for (let i=0; i<x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
function looksLikePcmWav(bytes) {
  const label = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length < 46 || bytes.length > MAX_WAV_BYTES) return false;
  if (label(0, 4) !== 'RIFF' || label(8, 12) !== 'WAVE') return false;
  if (label(12,16) !== 'fmt ' || label(36,40) !== 'data') return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return v.getUint16(20, true) === 1
    && v.getUint16(22, true) === 1
    && v.getUint32(24, true) === 16000
    && v.getUint16(34, true) === 16
    && v.getUint32(40, true) + 44 === bytes.length;
}
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, configured: !!(env.OPENAI_API_KEY && env.ACCESS_TOKEN) });
    }
    if (url.pathname !== '/transcribe') return json({ error: 'Not found' }, 404);
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
    if (!env.OPENAI_API_KEY || !env.ACCESS_TOKEN) return json({ error: 'Server not configured' }, 503);
    const auth = request.headers.get('Authorization') || '';
    if (!(await matchingSecret(auth.startsWith('Bearer ') ? auth.slice(7) : '', env.ACCESS_TOKEN))) {
      return json({ error: 'Not authorized' }, 401);
    }
    const type = request.headers.get('content-type')?.split(';')[0]?.trim()?.toLowerCase();
    if (type !== 'audio/wav') return json({ error: 'Expected audio/wav' }, 415);
    const length = Number(request.headers.get('content-length') || 0);
    if (length > MAX_WAV_BYTES) return json({ error: 'Audio too large' }, 413);
    let wav;
    try {
      const buffer = await request.arrayBuffer();
      wav = new Uint8Array(buffer);
    } catch {
      return json({ error: 'Cannot read audio' }, 400);
    }
    if (!looksLikePcmWav(wav)) return json({ error: 'Invalid 16 kHz mono WAV' }, 400);
    const form = new FormData();
    form.append('file', new File([wav], 'g2-english.wav', { type: 'audio/wav' }));
    form.append('model', 'gpt-transcribe');
    form.append('languages[]', 'en');
    form.append('prompt', 'English historical theology and early Christianity. Transcribe the spoken words accurately, without translating.');
    let upstream;
    try {
      upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY },
        body: form,
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      return json({ error: 'Transcription service unavailable' }, 502);
    }
    if (!upstream.ok) {
      // Do not expose provider request details, tokens, or account metadata.
      return json({ error: 'Transcription failed (HTTP ' + upstream.status + ')' }, 502);
    }
    let result;
    try { result = await upstream.json(); }
    catch { return json({ error: 'Transcription response invalid' }, 502); }
    return json({ text: String(result.text || '').slice(0, 3000) });
  },
};
