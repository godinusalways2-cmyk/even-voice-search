import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { search, warmSearch, context } from '../matcher.mjs';

const rows = [
  { id:'c4a', chapter:'4', section:'서론', n:1, en:'The climax of the doctrinal development of the early church was the dogma of the Trinity.', ko:'초기 교리 발전의 절정은 삼위일체 교리였다.' },
  { id:'c4b', chapter:'4', section:'서론', n:2, en:'The controversy over that question occupied most of the fourth century.', ko:'이 질문에 대한 논쟁은 4세기 대부분을 차지했다.' },
  { id:'c3a', chapter:'3', section:'서론', n:1, en:'Against various heresies and schisms, the orthodox and catholic church defined its doctrine.', ko:'다양한 이단과 분열에 맞서 교회는 교리를 정의하였다.' }
];
warmSearch(rows);
test('English beginning resolves to exact Korean pairing', () => {
  assert.equal(search(rows,'The climax of the doctrinal development')[0].row.id, 'c4a');
  assert.equal(search(rows,'The controversy over that question')[0].row.id, 'c4b');
});
test('Korean substring and chapter filter work', () => {
  assert.equal(search(rows,'초기 교리 발전')[0].row.id, 'c4a');
  assert.equal(search(rows,'Against various heresies',{chapter:'3'})[0].row.id, 'c3a');
  assert.equal(search(rows,'Against various heresies',{chapter:'4'}).length,0);
});
test('Adjacent paragraph navigation and repeated cached searches work', () => {
  assert.equal(context(rows,rows[0],1).id,'c4b');
  assert.equal(context(rows,rows[1],1),null);
  for(let n=0;n<200;n++)assert.equal(search(rows,'The climax of the doctrinal')[0].row.id,'c4a');
});
