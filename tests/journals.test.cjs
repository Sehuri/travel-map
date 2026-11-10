const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../assets/journal-engine.js');
const p={name:'测试地点',location:'独立区域',longitude:null,latitude:null};
const c={title:'',body:'',rating:null,visit_date:null,photos:[],tags:[]};
test('only a place name is required for draft; empty date and score are valid',()=>{
 assert.equal(engine.validate(p,c),'');assert.match(engine.validate({...p,name:''},c),/地点/);
 assert.match(engine.validate({...p,location:''},{...c,body:'感受'},true),/位置/);
 assert.equal(engine.validate(p,{...c,body:'感受'},true),'');assert.equal(engine.title(c,p),'测试地点');
 for(const rating of [0,11,1.5])assert.match(engine.validate(p,{...c,rating}),/评分/);
});
test('journal filters search content; unknown dates and scores sort last',()=>{
 const item=(id,date,rating,extra={})=>({id,place:{...p,id:'stable-place',country:'印度尼西亚',kind:'nature'},content:{...c,visit_date:date,rating,...extra},status:'published',visibility:'public',updated_at:'2026-11-01'});
 const all=[item('a',null,null),item('b','2026-10-02',7,{body:'云海'}),item('c','2026-10-03',8),item('d','2026-10-03',8)];
 assert.deepEqual(engine.filter(all).map(x=>x.id),['c','d','b','a']);
 assert.deepEqual(engine.filter(all,{sort:'rating'}).map(x=>x.id),['c','d','b','a']);
 assert.deepEqual(engine.filter(all,{q:'云海',kind:'nature',year:'2026'}).map(x=>x.id),['b']);assert.equal(engine.filter(all,{region:'中国'}).length,0);
 assert.equal(engine.filter(all,{status:'draft'}).length,0);
});
