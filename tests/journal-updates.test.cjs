const test=require('node:test'),assert=require('node:assert/strict');
const U=require('../assets/journal-updates-engine.js');
const row=(id,updated_at,status='published',visibility='public')=>({id,updated_at,status,visibility});
test('absolute timestamps reject ambiguous and invalid dates including non-leap days',()=>{
 for(const t of [null,'','2026-11-16T12:00:00','2026-02-29T00:00:00Z','2026-04-31T00:00:00Z','2026-13-01T00:00:00Z','junk'])assert.equal(U.timestamp(t),null,String(t));
 assert.notEqual(U.timestamp('2024-02-29T00:00:00Z'),null);
});
test('deduplicates by id and sorts by instant, excludes nonpublic records',()=>{
 const items=[row('b','2026-11-16T00:00:00+08:00'),row('a','2026-11-15T16:00:00Z'),row('a','2026-01-01T00:00:00Z'),row('d',null),row('c','bad'),row('hidden','2027-01-01T00:00:00Z','draft'),row('private','2027-01-01T00:00:00Z','published','private')];
 assert.deepEqual(U.ordered(items).map(x=>x.id),['a','b','c','d']);
});
test('Beijing day boundaries and future grouping independent of local timezone',()=>{
 const now=Date.parse('2026-11-15T16:00:00Z');
 const groups=U.groups([row('future','2026-11-16T16:00:00Z'),row('today','2026-11-15T16:00:00Z'),row('yesterday','2026-11-15T15:59:59Z'),row('unknown',null)],now);
 assert.deepEqual(groups.map(g=>g.label),['2026年11月17日','今天 · 2026.11.16','昨天 · 2026.11.15','时间待补充']);
 assert.equal(U.clock(now).full,'2026.11.16 00:00（北京时间）');
 const year=U.groups([row('x','2025-12-31T15:59:59Z')],Date.parse('2025-12-31T16:00:00Z'));assert.equal(year[0].label,'昨天 · 2025.12.31');
});
test('range includes search and visit year but not sort',()=>{assert.equal(U.range({q:' 湖 ',city:'宣城',year:'2024',sort:'rating'}),'城市：宣城 · 到访年份：2024 · 搜索：湖');});
