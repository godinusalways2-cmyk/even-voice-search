import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { search, searchSpeech, assess, warmSearch, context } from '../matcher.mjs';

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

test('Ordered near-match beats unrelated paragraph with similar vocabulary', () => {
 const choices=[
  {id:'decoy',chapter:'4',en:'Before sunrise the wooden bridge was quiet. The traveler later crossed an attentive garden.',ko:'가상의 오답이다.'},
  {id:'target',chapter:'4',en:'An attentive traveler quietly crossed the old wooden bridge before sunrise.',ko:'가상의 정답이다.'}
 ];
 const result=search(choices,'An attentive traveler quietly crossed the wooden bridge before sunrise');
 assert.equal(result[0].row.id,'target');
 assert.equal(result[0].kind,'fuzzy'); // "old" missing from speech
});
test('Duplicate exact phrase does not silently select first paragraph', () => {
 const choices=[
  {id:'p1',chapter:'3',en:'The same short phrase occurred during a quiet morning in town.',ko:'첫 번역'},
  {id:'p2',chapter:'4',en:'The same short phrase occurred during a noisy evening elsewhere.',ko:'두 번째 번역'}
 ];
 const result=search(choices,'The same short phrase occurred');
 assert.equal(result.length,2);
 const verdict=assess(result,'The same short phrase occurred');
 assert.equal(verdict.state,'ambiguous');
 assert.equal(verdict.confident,false);
});
test('Few uninformative words are not auto-confirmed', () => {
 const choices=[
  {id:'p1',chapter:'4',en:'The article was the source of a fresh debate about memory.',ko:'번역'},
 ];
 const result=search(choices,'the source');
 assert.notEqual(assess(result,'the source').state,'exact');
});
test('A unique exact longer quote may be presented as confirmed', () => {
 const result=search(rows,'The opening chapter introduces an unfamiliar');
 assert.equal(assess(result,'The opening chapter introduces an unfamiliar').state,'exact');
});
test('Completely unrelated speech does not produce arbitrary translation', () => {
 const result=search(rows,'satellite exploration computes distant planetary orbital distances');
 assert.equal(result.length,0);
});

test('Speech missing one middle word still retrieves intended pairing', () => {
 const rows = [
  { id:'target',chapter:'3',en:'The careful scholar compared the early manuscripts before drawing conclusions.',ko:'정답 문단' },
  { id:'decoy',chapter:'3',en:'The careful manuscripts were compared after the scholar reached a conclusion.',ko:'오답 문단' }
 ];
 const results=search(rows,'The careful scholar compared early manuscripts before drawing conclusions');
 assert.equal(results[0]?.row.id,'target');
 assert.equal(results[0]?.kind,'fuzzy');
});
test('One phonetically plausible misspelling is tolerated in an English sentence', () => {
 const rows=[
  {id:'target',chapter:'3',en:'A surprising discovery changed the direction of the historical investigation.',ko:'정답'},
  {id:'decoy',chapter:'3',en:'A surprising journey changed the direction of the coastal investigation.',ko:'오답'}
 ];
 const result=search(rows,'A surprising discovery changed the direction of the historical investigaton');
 assert.equal(result[0]?.row.id,'target');
});
test('When browser supplies multiple ASR hypotheses, a more accurate alternative can win', () => {
 const rows=[
  {id:'target',chapter:'4',en:'The careful reader discovered a hidden manuscript beside the ancient temple.',ko:'정답'},
  {id:'decoy',chapter:'4',en:'The careful reader discussed several manuscripts throughout the quiet afternoon.',ko:'오답'}
 ];
 const out=searchSpeech(rows,[
   'The careful reader discovered a hidden message beside the ancient temple',
   'The careful reader discovered a hidden manuscript beside the ancient temple'
 ]);
 assert.equal(out.results[0]?.row.id,'target');
 assert.equal(out.selected,out.results[0].spoken);
 assert.ok(out.alternativeCount===2);
});
test('Shuffled generic tokens cannot override intact ordered phrase', () => {
 const rows=[
  {id:'decoy',chapter:'3',en:'The scholar later read about the village. Research on the original evidence started the investigation.',ko:'오답'},
  {id:'target',chapter:'3',en:'The scholar started the investigation of original evidence in the village.',ko:'정답'}
 ];
 const found=search(rows,'The scholar started the investigation of original evidence');
 assert.equal(found[0]?.row.id,'target');
});
test('Weak partial matches are not presented as exact facts', () => {
 const rows=[
  {id:'first',chapter:'3',en:'A long summary of different kinds of academic research.',ko:'첫 번째'},
  {id:'second',chapter:'4',en:'A long survey of different fields of academic inquiry.',ko:'두 번째'}
 ];
 const out=search(rows,'different academic');
 assert.equal(assess(out,'different academic').confident,false);
});
