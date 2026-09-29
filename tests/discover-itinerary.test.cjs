const test=require('node:test');
const assert=require('node:assert/strict');
const {build}=require('../assets/discover-itinerary.js');
const p=(id,x,category='sight')=>({id,name:id,coord:[x,32],category});
test('plans requested days, groups nearby sights and meals without repeats or input mutation',()=>{
  const places=[p('a',118),p('far',120),p('b',118.01),p('c',120.01),p('food',118.005,'food'),p('food2',120.005,'food')];
  const before=JSON.stringify(places), result=build(places,2);
  assert.deepEqual(result[0].stops.map(p=>p.id),['a','food','b']);
  assert.deepEqual(result[1].stops.map(p=>p.id),['far','food2','c']);
  assert.equal(new Set(result.flatMap(d=>d.stops.map(p=>p.id))).size,6);
  assert.equal(JSON.stringify(places),before);
});
test('sparse, invalid, distant and duplicate data never invents a full itinerary',()=>{
  const places=[p('a',118),p('a',118),p('b',125),p('food',130,'food'),{id:'bad',category:'sight',coord:[NaN,32]}];
  const plan=build(places,14);
  assert.equal(plan.length,14);
  assert.equal(plan.flatMap(d=>d.stops).length,2);
  assert(plan.at(-1).notes.some(n=>n.includes('自由活动')));
  assert.equal(build(places,1)[0].stops.length,1);
  assert.equal(build([],3).length,3);
  assert.throws(()=>build([],0)); assert.throws(()=>build([],15));
});
test('relaxed pace uses one sight daily; meal-only data stays honest',()=>{
  const plan=build([p('a',118),p('b',118.01),p('c',118.02)],2,'relaxed');
  assert(plan.every(d=>d.stops.length===1));
  assert.equal(build([p('food',118,'food')],1)[0].stops.length,0);
});
