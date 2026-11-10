const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const entry='33333333-3333-4333-8333-333333333333',place='44444444-4444-4444-8444-444444444444';
const content=(extras={})=>({title:'权限测试',body:'仅用于本地测试',visit_date:null,rating:null,tags:[],photos:[],cover_id:null,...extras});
test('journal PostgreSQL RLS protects drafts, revisions, relationships and private media',async()=>{
 const db=new PGlite();
 async function role(r,uid=''){await db.exec(`reset role;set request.jwt.claim.sub='${uid}';set role ${r};`);}
 const call=async(fn,args)=> (await db.query(`select to_jsonb(public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})) as value`,args)).rows[0].value;
 async function save(id=entry,pid=place,c=content(),rev=0,visibility='private',p={name:'无城市测试地点',country:'印度尼西亚',location:'东爪哇省',kind:'nature'}){return call('journal_save_draft',[id,pid,p,c,visibility,rev]);}
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
  create function public.is_current_user_owner() returns boolean language sql stable as $$select coalesce(auth.uid()='${owner}'::uuid,false)$$;
  insert into auth.users values('${owner}'),('${other}');
  create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));alter table storage.objects enable row level security;
  grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;
  create table public.travel_attractions(id text primary key);create table public.travel_journeys(id uuid primary key,slug text,title text,is_published boolean);
  create table public.city_photos(image_url text,is_hidden boolean);
  insert into travel_journeys values(gen_random_uuid(),'private-trip','秘密旅程',false);
  `);
  const sql=fs.readFileSync('supabase/place_journals.sql','utf8');assert.equal(sql,fs.readFileSync('supabase/migrations/20261109000000_place_journals.sql','utf8'));await db.exec(sql);await db.exec(sql);
  await role('authenticated',owner);
  let e=await save(entry,place,content({journey_slug:'private-trip'}),0,'public');
  assert.equal(e.status,'draft');assert.equal(e.visibility,'public');
  assert.equal(await call('journal_place_editable',[place,entry]),true);
  e=await save(entry,place,content({journey_slug:'private-trip'}),e.revision,'public',{name:'无城市测试地点',country:'印度尼西亚',location:'东爪哇省 · 补充位置',kind:'nature'});
  assert.equal((await db.query('select place_id from journal_drafts where entry_id=$1',[entry])).rows[0].place_id,place);
  e=await save(entry,place,content({journey_slug:'private-trip'}),e.revision,'public');
  await role('anon');
  for(const table of ['journal_entries','journal_public_entries','journal_versions','journal_places','journal_media'])assert.equal((await db.query(`select * from ${table}`)).rows.length,0,table);
  await assert.rejects(call('journal_publish',[entry,1,'public']),e=>e.code==='42501');
  await role('authenticated',other);
  assert.equal((await db.query('select * from journal_drafts')).rows.length,0);
  await assert.rejects(save(),e=>e.code==='42501');
  await role('authenticated',owner);
  e=await call('journal_publish',[entry,e.revision,'public']);
  const original=e.published_version_id;
  assert.equal(await call('journal_place_editable',[place,entry]),false);
  await assert.rejects(save(entry,place,content(),e.revision,'private',{name:'偷偷覆盖地点',location:'新位置'}),/复制地点/);
  // New revision and image remain private while old public snapshot stays visible.
  const mediaId='55555555-5555-4555-8555-555555555555';
  const m=await call('journal_register_media',[entry,mediaId,null]);
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2),($1,$3)',['place-journal-media',m.object_path,m.thumb_path]);
  await call('journal_complete_media',[mediaId]);
  e=await save(entry,place,content({body:'私有修订秘密',tags:['私有标签'],photos:[{id:mediaId}]}),e.revision,'public');
  await role('anon');
  assert.equal((await db.query('select * from journal_public_entries')).rows.length,1);
  assert.equal((await db.query('select * from journal_public_entries')).rows[0].revision,undefined);
  assert.equal((await db.query('select * from journal_entries')).rows.length,0);
  const visible=(await db.query('select * from journal_versions')).rows;
  assert.equal(visible.length,1);assert.equal(visible[0].id,original);assert.equal(visible[0].content.body,'仅用于本地测试');assert.equal(visible[0].content.journey_slug,undefined);
  assert.equal((await db.query("select * from journal_versions where content::text like '%私有%' ")).rows.length,0);
  assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  assert.equal(await call('journal_linked_journey',[entry]),null);
  assert.equal((await db.query('select * from journal_places')).rows[0].city_name,null);
  await role('authenticated',other);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  await assert.rejects(db.query('insert into journal_versions(entry_id,place_id,content) values($1,$2,$3)',[entry,place,content()]),e=>e.code==='42501');
  await role('authenticated',owner);e=await call('journal_publish',[entry,e.revision,'public']);
  await role('anon');assert.equal((await db.query('select * from journal_versions')).rows.length,1);assert.equal((await db.query('select * from journal_versions')).rows[0].content.body,'私有修订秘密');assert.equal((await db.query('select * from storage.objects')).rows.length,2);
  await role('authenticated',owner);e=await call('journal_set_state',[entry,e.revision,'withdraw']);
  await role('anon');for(const table of ['journal_public_entries','journal_places','journal_versions','journal_media','storage.objects'])assert.equal((await db.query(`select * from ${table}`)).rows.length,0,table);
  // Same place, independent visit; minimal draft requires only a name.
  await role('authenticated',owner);
  const second='66666666-6666-4666-8666-666666666666';let two=await save(second,place,content({body:'另一次到访'}));two=await call('journal_publish',[second,two.revision,'private']);assert.equal(two.status,'published');
  assert.equal((await db.query('select * from journal_entries')).rows.length,2);
  await assert.rejects(save(second,place,content({rating:0}),two.revision),/评分/);
  await assert.rejects(save(second,place,content(),0),/已更新/);
  two=await call('journal_set_state',[second,two.revision,'archive']);assert.equal(two.status,'archived');two=await call('journal_set_state',[second,two.revision,'restore']);assert.equal(two.status,'draft');
  const third='77777777-7777-4777-8777-777777777777',minimal='88888888-8888-4888-8888-888888888888';let min=await save(third,minimal,content({title:'',body:''}),0,'private',{name:'最小草稿'});
  await assert.rejects(call('journal_publish',[third,min.revision,'private']),/位置文字/);
  await role('anon');assert.equal((await db.query('select * from journal_places')).rows.length,0);
 }finally{await db.close();}
});
