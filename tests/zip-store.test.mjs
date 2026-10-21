import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { crc32, createZip } from '../zip-store.mjs';

test('CRC32 known reference vector', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});
test('Local-only ZIP contains manifest and audio at valid offsets', async () => {
  const raw = new Uint8Array([0,11,22,33,44]);
  const zip = await createZip([
    { name: 'manifest.json', data: JSON.stringify({ format: 'even-whisper-lab-v1' }) },
    { name: 'audio/test.m4a', data: new Blob([raw]) },
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0,true),0x04034b50);
  const count=2;
  assert.equal(view.getUint32(bytes.length-22,true),0x06054b50);
  assert.equal(view.getUint16(bytes.length-12,true),count);
  const centralAt=view.getUint32(bytes.length-6,true);
  assert.equal(view.getUint32(centralAt,true),0x02014b50);
  const offset=view.getUint32(centralAt+42,true);
  assert.equal(offset,0);
  const firstNameLength=view.getUint16(offset+26,true);
  const firstDataOffset=offset+30+firstNameLength;
  const firstDataLen=view.getUint32(offset+18,true);
  const manifest=JSON.parse(new TextDecoder().decode(bytes.slice(firstDataOffset,firstDataOffset+firstDataLen)));
  assert.equal(manifest.format,'even-whisper-lab-v1');
});
test('Archive rejects path traversal', async () => {
  await assert.rejects(createZip([{name:'../secret',data:'a'}]),/파일 이름/);
});
