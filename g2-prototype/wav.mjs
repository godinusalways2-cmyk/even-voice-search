// G2 microphone: raw PCM s16le, 16 kHz, mono -> WAV.
// Pure module; no Web Audio permission or remote API is required.
export const AUDIO_SAMPLE_RATE = 16000;
export const MAX_AUDIO_BYTES = 16000 * 2 * 15;
export function pcmToWav(chunks) {
  if (!Array.isArray(chunks) || chunks.some(c => !(c instanceof Uint8Array))) {
    throw new TypeError('PCM chunks must be Uint8Array values');
  }
  const pcmLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  if (!pcmLength || pcmLength % 2 || pcmLength > MAX_AUDIO_BYTES) {
    throw new RangeError('Invalid 16-bit mono PCM size');
  }
  const wav = new Uint8Array(44 + pcmLength);
  const view = new DataView(wav.buffer);
  const ascii = (offset, s) => { for (let i=0; i<s.length; i++) wav[offset+i] = s.charCodeAt(i); };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcmLength, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, AUDIO_SAMPLE_RATE, true);
  view.setUint32(28, AUDIO_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, pcmLength, true);
  let offset = 44;
  for (const chunk of chunks) { wav.set(chunk, offset); offset += chunk.length; }
  return new Blob([wav], { type: 'audio/wav' });
}
