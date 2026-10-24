// Private G2 audio -> Cloudflare Workers AI Whisper-large-v3-turbo.
// Only the voice clip is sent; personal bilingual text stays inside the phone.
// Configure ACCESS_TOKEN as a Cloudflare Worker secret.
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
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
function looksLikePcmWav(bytes) {
  const label = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length < 46 || bytes.length > MAX_WAV_BYTES) return false;
  if (label(0, 4) !== 'RIFF' || label(8, 12) !== 'WAVE') return false;
  if (label(12, 16) !== 'fmt ' || label(36, 40) !== 'data') return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return v.getUint16(20, true) === 1
    && v.getUint16(22, true) === 1
    && v.getUint32(24, true) === 16000
    && v.getUint16(34, true) === 16
    && v.getUint32(40, true) + 44 === bytes.length;
}
function toBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, configured: !!(env.AI && env.ACCESS_TOKEN) });
    }
    if (url.pathname !== '/transcribe') return json({ error: 'Not found' }, 404);
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
    if (!env.AI || !env.ACCESS_TOKEN) return json({ error: 'Server not configured' }, 503);
    const auth = request.headers.get('Authorization') || '';
    if (!(await matchingSecret(auth.startsWith('Bearer ') ? auth.slice(7) : '', env.ACCESS_TOKEN))) {
      return json({ error: 'Not authorized' }, 401);
    }
    const type = request.headers.get('content-type')?.split(';')[0]?.trim()?.toLowerCase();
    if (type !== 'audio/wav') return json({ error: 'Expected audio/wav' }, 415);
    const length = Number(request.headers.get('content-length') || 0);
    if (length > MAX_WAV_BYTES) return json({ error: 'Audio too large' }, 413);
    let wav;
    try { wav = new Uint8Array(await request.arrayBuffer()); }
    catch { return json({ error: 'Cannot read audio' }, 400); }
    if (!looksLikePcmWav(wav)) return json({ error: 'Invalid 16 kHz mono WAV' }, 400);
    try {
      const result = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
        audio: toBase64(wav),
        task: 'transcribe',
        language: 'en',
        initial_prompt: 'English historical theology and early Christianity.',
        condition_on_previous_text: false,
      });
      return json({ text: String(result?.text || '').slice(0, 3000) });
    } catch {
      return json({ error: 'Cloudflare speech recognition failed or free quota reached' }, 502);
    }
  },
};
