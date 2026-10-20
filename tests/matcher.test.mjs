import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { search, warmSearch, context } from '../matcher.mjs';

const rows = [
  { id:'c4a', chapter:'4', section:'서론', n:1, en:'The opening chapter introduces an unfamiliar journey across many different landscapes.', ko:'첫 장은 여러 낯선 풍경을 가로지르는 여정을 소개한다.' },
  { id:'c4b', chapter:'4', section:'서론', n:2, en:'The next chapter compares several approaches to understanding a difficult question.', ko:'다음 장은 어려운 질문을 이해하는 여러 접근법을 비교한다.' },
  { id:'c3a', chapter:'3', section:'서론', n:1, en:'A fictional researcher discovered a surprising pattern while reading old letters.', ko:'가상의 연구자는 오래된 편지를 읽으며 놀라운 패턴을 발견했다.' }
];
warmSearch(rows);
test('English beginning resolves to exact Korean pairing', () => {
  assert.equal(search(rows,'The opening chapter introduces an unfamiliar')[0].row.id, 'c4a');
  assert.equal(search(rows,'The next chapter compares several approaches')[0].row.id, 'c4b');
});
test('Korean substring and chapter filter work', () => {
  assert.equal(search(rows,'첫 장은 여러 낯선 풍경')[0].row.id, 'c4a');
  assert.equal(search(rows,'A fictional researcher discovered',{chapter:'3'})[0].row.id, 'c3a');
  assert.equal(search(rows,'A fictional researcher discovered',{chapter:'4'}).length,0);
});
test('Adjacent paragraph navigation and repeated cached searches work', () => {
  assert.equal(context(rows,rows[0],1).id,'c4b');
  assert.equal(context(rows,rows[1],1),null);
  for(let n=0;n<200;n++)assert.equal(search(rows,'The opening chapter introduces')[0].row.id,'c4a');
});
