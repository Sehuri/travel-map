const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {PGlite} = require('@electric-sql/pglite');
const map = require('../assets/map-engine.js');

async function contentWith(wishes, legacy = false) {
  const queries = [];
  const context = {window: {
    TRAVEL_DATA:{visits:[],wishlist:[{name:'法国',priorityLevel:3}]},
    TRAVEL_MAP_ENGINE:map,
    TRAVEL_VISIT_ENGINE:{mergeCityVisits:base=>base},
    SUPABASE_CONFIG:{url:'https://example.com',publishableKey:'test'},
    supabase:{createClient:()=>({from:table=>({select:async fields=>{
      if(table==='travel_wishlist') {
        queries.push(fields);
        if(legacy && fields.includes('longitude')) return {error:{code:'42703'},data:null};
        return {error:null,data:wishes};
      }
      return {error:null,data:[]};
    }})})}
  }, localStorage:{getItem:()=>null}};
  vm.runInNewContext(fs.readFileSync('assets/content.js','utf8'),context);
  return {state:await context.window.TRAVEL_CONTENT.ready,queries};
}

test('public content reads custom map coordinates from backend without modifying wish text or visited cities',async()=>{
  const {state} = await contentWith([
    {name:'瑞士',icon:'瑞',description:'我的瑞士计划',guide:'保留我的攻略',planned_time:'2027 国庆',priority_level:3,
      longitude:8.5417,latitude:47.3769,country:'瑞士',coordinate_system:'WGS84',map_label:'苏黎世'},
    {name:'已隐藏',is_hidden:true,longitude:8,latitude:46,country:'瑞士'}
  ]);
  const wish=state.wishlist.find(x=>x.name==='瑞士');
  assert.equal(state.connected,true);
  assert.deepEqual(map.getWishlistMapLocation(wish).coord,[8.5417,47.3769]);
  assert.equal(wish.desc,'我的瑞士计划');
  assert.equal(wish.guide,'保留我的攻略');
  assert.equal(wish.priorityLevel,3);
  assert.equal(state.visits.length,0);
  assert(!state.wishlist.some(x=>x.name==='已隐藏'));
});

test('older backend schemas still load manually added Switzerland using its preset',async()=>{
  const {state,queries}=await contentWith([{name:'瑞士',priority_level:3,description:'旧数据'}],true);
  assert.equal(state.connected,true);
  assert.equal(queries.length,2);
  assert.deepEqual(map.getWishlistMapLocation(state.wishlist.find(x=>x.name==='瑞士')).coord,[8.0341,46.6243]);
});

test('map-location migration is repeatable, validates coordinates and preserves saved wishes',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create table public.travel_wishlist(name text primary key, description text, priority_level int,
      is_hidden boolean default false, updated_at timestamptz default now());
      insert into public.travel_wishlist(name,description,priority_level) values('瑞士','用户原文',3),('法国','法国原文',3);`);
    const sql=fs.readFileSync('supabase/wishlist_map_location.sql','utf8');
    assert.equal(sql,fs.readFileSync('supabase/migrations/20261010000000_wishlist_map_location.sql','utf8'));
    await db.exec(sql);
    const row=(await db.query("select * from public.travel_wishlist where name='瑞士'")).rows[0];
    assert.equal(Number(row.longitude),8.0341);
    assert.equal(Number(row.latitude),46.6243);
    assert.equal(row.description,'用户原文');
    assert.equal(row.priority_level,3);
    assert.equal(row.is_hidden,false);
    await db.exec("update public.travel_wishlist set longitude=8.5417, latitude=47.3769, map_label='苏黎世' where name='瑞士'");
    await db.exec(sql);
    assert.equal(Number((await db.query("select longitude from public.travel_wishlist where name='瑞士'")).rows[0].longitude),8.5417);
    for(const changes of ["longitude=181", "latitude=91", "latitude=null", "country=''", "coordinate_system='invalid'"]) {
      await assert.rejects(db.exec(`update public.travel_wishlist set ${changes} where name='瑞士'`),e=>e.code==='23514');
    }
    await db.exec("insert into public.travel_wishlist(name,country,longitude,latitude) values('零坐标','测试',0,0)");
    assert.equal((await db.query("select description from public.travel_wishlist where name='法国'")).rows[0].description,'法国原文');
  } finally {await db.close();}
});
