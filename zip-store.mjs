// Tiny ZIP32 writer (STORE/no compression) for local-only experiment exports.
// This intentionally uses no third-party service, remote dependency, or upload.
const enc = new TextEncoder();
const table = new Uint32Array(256);
for (let n=0;n<256;n++) {
  let c=n;
  for(let i=0;i<8;i++) c=(c&1)?0xedb88320^(c>>>1):(c>>>1);
  table[n]=c>>>0;
}
export function crc32(bytes) {
  let crc=0xffffffff;
  for(const b of bytes) crc=table[(crc^b)&0xff]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function write16(v,p,x){v.setUint16(p,x,true);}
function write32(v,p,x){v.setUint32(p,x>>>0,true);}
export async function createZip(entries) {
  if(!Array.isArray(entries)||!entries.length||entries.length>1000)throw Error('파일 수가 1~1000 범위를 벗어났습니다.');
  const localParts=[],centralParts=[];
  let cursor=0, centralSize=0;
  for (const entry of entries) {
    const path=String(entry.name || '');
    if(!path||path.startsWith('/')||path.includes('..')||path.includes('\\'))throw Error('안전하지 않은 파일 이름입니다.');
    const name=enc.encode(path);
    const data=entry.data instanceof Blob ? new Uint8Array(await entry.data.arrayBuffer()) :
      (typeof entry.data==='string'?enc.encode(entry.data):new Uint8Array(entry.data));
    if(name.length>65535 || data.length>0xffffffff)throw Error('ZIP 형식의 파일 크기 제한을 초과했습니다.');
    const checksum=crc32(data), localOffset=cursor, utf8=0x0800;
    const local=new Uint8Array(30+name.length), lv=new DataView(local.buffer);
    write32(lv,0,0x04034b50);write16(lv,4,20);write16(lv,6,utf8);
    write16(lv,8,0);write16(lv,10,0);write16(lv,12,0x0021);
    write32(lv,14,checksum);write32(lv,18,data.length);write32(lv,22,data.length);
    write16(lv,26,name.length);write16(lv,28,0);local.set(name,30);
    localParts.push(local,data);
    cursor+=local.length+data.length;
    const central=new Uint8Array(46+name.length), cv=new DataView(central.buffer);
    write32(cv,0,0x02014b50);write16(cv,4,20);write16(cv,6,20);
    write16(cv,8,utf8);write16(cv,10,0);write16(cv,12,0);
    write16(cv,14,0x0021);write32(cv,16,checksum);
    write32(cv,20,data.length);write32(cv,24,data.length);
    write16(cv,28,name.length);write16(cv,30,0);write16(cv,32,0);
    write16(cv,34,0);write16(cv,36,0);write32(cv,38,0);
    write32(cv,42,localOffset);central.set(name,46);
    centralParts.push(central);centralSize+=central.length;
  }
  const end=new Uint8Array(22),ev=new DataView(end.buffer);
  write32(ev,0,0x06054b50);write16(ev,4,0);write16(ev,6,0);
  write16(ev,8,entries.length);write16(ev,10,entries.length);
  write32(ev,12,centralSize);write32(ev,16,cursor);write16(ev,20,0);
  return new Blob([...localParts,...centralParts,end],{type:'application/zip'});
}
