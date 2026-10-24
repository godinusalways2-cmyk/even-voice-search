import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../src/index.js';
import { pcmToWav } from '../../g2-prototype/wav.mjs';

const secret = '0123456789abcdef0123456789abcdef0123456789abcdef';
const endpoint = 'https://g2-test.example.workers.dev';
const env = {
  ACCESS_TOKEN: secret,
  AI: { run: async (model, params) => {
    assert.equal(model, '@cf/openai/whisper-large-v3-turbo');
    assert.equal(params.language, 'en');
    assert.ok(params.audio.length);
    return { text: 'The early Christian church' };
  }},
};
test('health shows configured state but no secret', async () => {
  const r = await handler.fetch(new Request(endpoint + '/health'), env);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, configured: true });
});
test('unauthorized requests cannot invoke ASR', async () => {
  const r = await handler.fetch(new Request(endpoint + '/transcribe', {
    method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: new Uint8Array(50),
  }), env);
  assert.equal(r.status, 401);
});
test('authorized valid WAV returns only transcript', async () => {
  const wav = pcmToWav([new Uint8Array(16000)]);
  const r = await handler.fetch(new Request(endpoint + '/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav', Authorization: 'Bearer ' + secret },
    body: wav,
  }), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await r.json(), { text: 'The early Christian church' });
});
test('invalid audio returns 400 without calling AI', async () => {
  const r = await handler.fetch(new Request(endpoint + '/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav', Authorization: 'Bearer ' + secret },
    body: new Uint8Array(100),
  }), env);
  assert.equal(r.status, 400);
});
test('cross origin preflight allows Authorization', async () => {
  const r = await handler.fetch(new Request(endpoint + '/transcribe', { method: 'OPTIONS' }), env);
  assert.equal(r.status, 204);
  assert.match(r.headers.get('Access-Control-Allow-Headers') || '', /Authorization/);
});
