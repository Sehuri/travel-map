const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {attractions}=require('../assets/attraction-data.js');
const {tiers,distribution}=require('../assets/attraction-engine.js');
test('existing attraction catalogue remains valid after new visit cities are added',()=>{
  const context={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../assets/data.js'),'utf8'),context);
  const cities=new Set(context.window.TRAVEL_DATA.visits.map(v=>v.name));
  assert.equal(cities.size,57);assert.equal(attractions.length,721);
  assert.equal(new Set(attractions.map(a=>a.id)).size,attractions.length);
  for(const city of new Set(attractions.map(a=>a.city))){assert(cities.has(city));assert(attractions.filter(a=>a.city===city).length>=10,city);}
  for(const a of attractions)assert(a.id.endsWith('/'+a.name));
  assert.equal(tiers.map(t=>t.label).join('/'),'夯/顶级/人上人/NPC/拉完了');
});
test('global percentages sum to 100 without inventing votes',()=>{
  assert.equal(distribution([]).total,0);assert(distribution([]).tiers.every(t=>t.percent===0));
  for(let i=1;i<200;i++){
    const rows=tiers.map((t,n)=>({tier:t.id,vote_count:(i*(n+7))%31}));
    const result=distribution(rows);assert.equal(result.total,rows.reduce((a,b)=>a+b.vote_count,0));
    assert.equal(result.tiers.reduce((a,b)=>a+b.percent,0),result.total?100:0);
  }
  assert.equal(distribution(tiers.map((t,i)=>({tier:t.id,vote_count:i===4?2:1}))).tiers.reduce((a,b)=>a+b.percent,0),100);
});
test('generated migration and catalogue match',()=>{
  const source=fs.readFileSync('supabase/attraction_ratings.sql','utf8');
  assert.equal(source,fs.readFileSync('supabase/migrations/20260930000000_attraction_ratings.sql','utf8'));
  for(const a of attractions)assert(source.includes("'"+a.id.replaceAll("'","''")+"'"));
});
