import test from 'node:test';
import assert from 'node:assert/strict';
import { pcmToWav, MAX_AUDIO_BYTES } from '../wav.mjs';

test('PCM converts to a standard 16kHz mono WAV', async () => {
  const wav = pcmToWav([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
  assert.equal(wav.type, 'audio/wav');
  const b = new Uint8Array(await wav.arrayBuffer());
  const label = (s, e) => String.fromCharCode(...b.slice(s, e));
  const v = new DataView(b.buffer);
  assert.equal(label(0, 4), 'RIFF');
  assert.equal(label(8, 12), 'WAVE');
  assert.equal(label(36, 40), 'data');
  assert.equal(v.getUint32(4, true), 40);
  assert.equal(v.getUint16(20, true), 1);
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 4);
  assert.deepEqual([...b.slice(44)], [1,2,3,4]);
});

test('WAV writer rejects empty, odd or overly long PCM', () => {
  assert.throws(() => pcmToWav([]), RangeError);
  assert.throws(() => pcmToWav([new Uint8Array(3)]), RangeError);
  assert.throws(() => pcmToWav([new Uint8Array(MAX_AUDIO_BYTES+2)]), RangeError);
});
