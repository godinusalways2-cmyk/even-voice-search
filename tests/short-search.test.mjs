import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {shortSearch,shortSpeechSearch,shortAssessment} from '../short-search.mjs';
const rows=[
{id:'a',chapter:'3',en:'The careful scholar studied ancient manuscripts before the council.',ko:'A'},
{id:'b',chapter:'4',en:'The council carefully discussed entirely different theological questions.',ko:'B'},
{id:'c',chapter:'3',en:'Another researcher studied the early writing process in detail.',ko:'C'}
];
test('3-word exact match',()=>assert.equal(shortSearch(rows,'scholar studied ancient')[0]?.row.id,'a'));
test('4-word exact match',()=>assert.equal(shortSearch(rows,'the careful scholar studied')[0]?.row.id,'a'));
test('short misspelling correction',()=>assert.equal(shortSearch(rows,'careful scholar studed')[0]?.row.id,'a'));
test('chapter filtering',()=>assert.equal(shortSearch(rows,'careful scholar studied',{chapter:'4'}).some(x=>x.row.id==='a'),false));
test('same text variants preserve only one paired result',()=>{const r=shortSpeechSearch(rows,['careful scholar studed','careful scholar studied']);assert.equal(r.results[0]?.row.id,'a');assert.equal(r.results.filter(x=>x.row.id==='a').length,1)});
test('no firm guess on all-common-word input',()=>assert.equal(shortSearch(rows,'the and of').length,0));
test('return uncertainty metadata with weak candidates',()=>assert.equal(shortAssessment([],'unseen text').state,'none'));
