const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const engine = require('../assets/discover-engine.js');
const data = require('../assets/discover-data.js');
const root = path.resolve(__dirname,'..');
const city = (name,adcode,level='city',districts=[])=>({name,adcode,level,center:'120.5,31.3',districts});
test('directory includes municipalities, prefecture cities, county cities, direct-admin cities; omits districts and streets',()=>{
  const roots = [city('中国','100000','country',[
    city('北京市','110000','province',[city('市辖区','110100','city',[city('朝阳区','110105','district')])]),
    city('江苏省','320000','province',[city('苏州市','320500','city',[city('昆山市','320583','district'),city('姑苏区','320508','district'),city('昆山市','320583','street')])]),
    city('海南省','460000','province',[city('文昌市','469005','city')]),
    city('香港特别行政区','810000','province')
  ])];
  const result = engine.flattenDistricts(roots);
  assert.equal(result.length,5);
  assert.equal(result.find(c=>c.id==='320583').label,'江苏省 · 苏州市 · 昆山市');
  assert.equal(result.find(c=>c.id==='110000').label,'北京市');
  assert(result.some(c=>c.id==='469005'));
});
test('distance, days and province filters remain strict',()=>{
  const origin = {id:'a',coord:[120,30]};
  const cities = [{id:'a',coord:[120,30],province:'浙江省'},{id:'b',coord:[120.1,30.1],province:'浙江省'},{id:'c',coord:[100,40],province:'云南省'}];
  assert.equal(Math.round(engine.distance([0,0],[0,1])),111);
  assert.deepEqual(engine.candidates(cities,{origin,days:1}).map(c=>c.id),['b']);
  assert.equal(engine.candidates(cities,{origin,days:1,province:'云南省'}).length,0);
  assert.equal(engine.candidates(cities,{origin,days:1,radius:'Infinity'}).length,2);
  assert.throws(()=>engine.candidates(cities,{origin,days:0}));
  assert.throws(()=>engine.candidates(cities,{origin:null,days:3}));
  assert.throws(()=>engine.candidates(cities,{origin,days:2.5}));
});
test('draw does not repeat until all candidates used; empty pool is safe',()=>{
  const pool=[{id:'a'},{id:'b'},{id:'c'}], seen=new Set();
  assert.deepEqual([1,2,3].map(()=>engine.draw(pool,seen,()=>0).id),['a','b','c']);
  assert.equal(engine.draw(pool,seen,()=>0).id,'a');
  assert.equal(engine.draw([],seen),null);
});
test('all curated entries have unique ids, valid locations and linked sources',()=>{
  assert.equal(data.cities.length,18);
  assert.equal(new Set(data.cities.map(c=>c.id)).size,18);
  for(const c of data.cities){ assert(engine.validCoord(c.coord)); for(const p of c.places){assert(engine.validCoord(p.coord));assert(data.sources[p.source]);} }
});
function server({key='test-only-key',budget=true,providerError=false}={}){
  let handler, upstreamCalls=0;
  const dataset = Array.from({length:300},(_,i)=>city(`测试${i}市`,String(320100+i)));
  dataset.push(city('昆山市','320583','district'));
  const context = vm.createContext({URL,URLSearchParams,Response,Request,Blob,AbortSignal,Map,Set,Date,console,
    Deno:{env:{get:n=>({AMAP_WEB_KEY:key,SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-server-only'})[n]},serve:fn=>handler=fn},
    fetch:async(url)=>{
      const u=new URL(url);
      if(u.hostname==='test.supabase.co') return Response.json(budget);
      upstreamCalls++;
      if(providerError) return Response.json({status:'0',infocode:'10001'});
      if(u.pathname.includes('district')) return Response.json({status:'1',districts:[city('江苏省','320000','province',dataset)]});
      if(u.pathname.includes('staticmap')) return new Response(new Uint8Array([1,2]),{headers:{'content-type':'image/png'}});
      return Response.json({status:'1',pois:[{id:'good',name:'亭林园',location:'120.95,31.39',adcode:'320583',type:'风景名胜',adname:'昆山市',address:'测试地址'},{id:'wrong',name:'外地景点',location:'121,31',adcode:'320508'}]});
    }
  });
  vm.runInContext(fs.readFileSync(path.join(root,'assets/discover-engine.js'),'utf8'),context);
  const ts = fs.readFileSync(path.join(root,'supabase/functions/travel-discover/index.ts'),'utf8').replace('import "../../../assets/discover-engine.js";','');
  vm.runInContext(stripTypeScriptTypes(ts,{mode:'transform'}),context);
  return {call:params=>handler(new Request(`https://test/functions/v1/travel-discover?${new URLSearchParams(params)}`,{headers:{origin:'https://sehuri.github.io'}})),handler,calls:()=>upstreamCalls};
}
test('server returns nationwide directory, caches it, and validates county-city POIs',async()=>{
  const s=server(); const a=await s.call({action:'catalogue'}); assert.equal(a.status,200); assert.equal((await a.json()).cities.length,301);
  await s.call({action:'catalogue'}); assert.equal(s.calls(),1);
  const b=await s.call({action:'places',city:'320583',interests:'culture'}); assert.equal(b.status,200); assert.equal((await b.json()).places.length,1);
  const image=await s.call({action:'map',city:'320583',interests:'culture',limit:1}); assert.equal(image.headers.get('content-type'),'image/png');
});
test('provider key stays server-side; missing key and exceeded budget fail closed',async()=>{
  let s=server({key:''}); let r=await s.call({action:'catalogue'});assert.equal(r.status,503);assert.equal(s.calls(),0);
  s=server({budget:false});r=await s.call({action:'catalogue'});assert.equal(r.status,429);assert.equal(s.calls(),0);
  s=server({providerError:true});r=await s.call({action:'catalogue'});assert.equal(r.status,503);assert(!(await r.text()).includes('test-only-key'));
});
test('server rejects arbitrary requests, origins and too many interests',async()=>{
  const s=server();
  assert.equal((await s.call({action:'proxy',url:'https://example.com'})).status,400);
  assert.equal((await s.call({action:'places',city:'320583',interests:'nature,culture,city,food'})).status,400);
  assert.equal((await s.call({action:'places',city:'invalid'})).status,400);
  assert.equal((await s.handler(new Request('https://test?action=catalogue',{headers:{origin:'https://evil.example'}}))).status,403);
  assert.equal(s.calls(),0);
});
