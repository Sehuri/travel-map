const test=require('node:test'),assert=require('node:assert/strict'),P=require('../assets/journal-pinning-engine.js');
const j=(id,pinned_at,other={})=>({id,pinned_at,status:'published',visibility:'public',published_version_id:'version',...other});
test('grid prioritizes valid public pins by precise time, keeps other order',()=>{
 const a=j('a','2026-11-17T02:00:00.123456Z'),b=j('b','2026-11-17T10:00:00.123456+08:00'),newest=j('n','2026-11-17T02:00:00.123457Z');
 const unknown=j('u','2026-02-29T00:00:00Z'),privateOne=j('p','2027-01-01T00:00:00Z',{visibility:'private'}),normal=j('z',null);
 assert.deepEqual(P.gridOrder([normal,b,unknown,privateOne,a,newest]).map(x=>x.id),['n','a','b','z','u','p']);assert.equal(P.pinned(unknown),false);assert.equal(P.pinned(privateOne),false);
});
test('only real public published entries with an absolute valid timestamp qualify',()=>{
 for(const t of ['2026-11-17T12:00:00','2026-02-29T00:00:00Z','2026-13-01T00:00:00Z','bad',null])assert.equal(P.pinned(j('x',t)),false);
 assert.equal(P.pinned(j('x','2024-02-29T00:00:00Z')),true);assert.equal(P.pinned(j('x','2024-02-29T00:00:00Z',{status:'draft'})),false);
});
