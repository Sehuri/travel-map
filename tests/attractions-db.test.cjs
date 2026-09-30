const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('real PostgreSQL enforces immutable browser votes, private rows and accurate global counts',async()=>{
  const db=new PGlite();
  const a='11111111-1111-1111-1111-111111111111',b='22222222-2222-2222-2222-222222222222';
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
      insert into auth.users values('${a}'),('${b}');`);
    const sql=fs.readFileSync('supabase/attraction_ratings.sql','utf8');await db.exec(sql);await db.exec(sql);
    assert.equal((await db.query('select count(*)::int as n from public.travel_attractions')).rows[0].n,721);
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}';`);
    await db.exec(`insert into public.attraction_votes values('CN/南京/中山陵','${a}','hang',now());`);
    await assert.rejects(db.exec(`insert into public.attraction_votes values('CN/南京/中山陵','${a}','top',now());`),e=>e.code==='23505');
    await assert.rejects(db.exec(`update public.attraction_votes set tier='top'`),e=>e.code==='42501');
    await assert.rejects(db.exec(`delete from public.attraction_votes`),e=>e.code==='42501');
    await assert.rejects(db.exec(`insert into public.attraction_votes values('CN/南京/夫子庙','${b}','top',now());`),e=>e.code==='42501');
    await db.exec(`set request.jwt.claim.sub='${b}';`);
    assert.equal((await db.query('select * from public.attraction_votes')).rows.length,0);
    await db.exec(`insert into public.attraction_votes values('CN/南京/中山陵','${b}','hang',now());`);
    assert.equal((await db.query('select * from public.attraction_votes')).rows.length,1);
    assert.equal((await db.query('select vote_count from public.attraction_vote_summary')).rows[0].vote_count,2);
    await assert.rejects(db.exec('update public.attraction_vote_summary set vote_count=999'),e=>e.code==='42501');
    await db.exec(`reset role;delete from auth.users where id='${a}';`);
    assert.equal((await db.query('select vote_count from public.attraction_vote_summary')).rows[0].vote_count,1);
    await db.exec('set role anon;');
    assert.equal((await db.query('select vote_count from public.attraction_vote_summary')).rows[0].vote_count,1);
    await assert.rejects(db.exec('select * from public.attraction_votes'),e=>e.code==='42501');
  }finally{await db.close();}
});
