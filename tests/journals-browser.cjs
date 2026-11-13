const {chromium}=require('playwright');
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const out=process.env.TRAVEL_QA_DIR||'/tmp/travel-journals-qa';
const sdk=`(()=>{
 const base64=bytes=>{let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);};
 const call=async(kind,args)=>{const r=await fetch('/test-api',{method:'POST',headers:{'content-type':'application/json','x-test-role':window.__journalRole||'anon'},body:JSON.stringify({kind,...args})});return r.json();};
 window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:window.__journalRole&&window.__journalRole!=='anon'?{user:{id:window.__journalRole,email:'test@example.invalid'}}:null},error:null}),onAuthStateChange:()=>{},signInWithOtp:async()=>({error:null})},
 rpc:(name,args={})=>call('rpc',{name,args}),
 from:table=>{let filters=[],columns='*',order;const q={select(c){columns=c;return q;},eq(k,v){filters.push({k,v});return q;},in(k,v){filters.push({k,v,in:true});return q;},order(k){order=k;return q;},maybeSingle(){return call('select',{table,columns,filters,order,single:true});},then(a,b){return call('select',{table,columns,filters,order}).then(a,b);}};return q;},
 storage:{from:bucket=>({upload:async(name,blob)=>call('upload',{bucket,name,body:base64(new Uint8Array(await blob.arrayBuffer()))}),download:async(name)=>{const r=await call('download',{bucket,name});return r.error?r:{data:new Blob([Uint8Array.from(atob(r.data),c=>c.charCodeAt(0))],{type:'image/webp'}),error:null};}})}
 })};})();`;
(async()=>{
 const db=new PGlite(),blobs=new Map();let serial=Promise.resolve(),failNext=false,offline=false,failDownloads=false,mediaGatewayRequests=0,failAfterReference=false,rejectNextDraft=false,failReferenceURL=null,referenceFailures=0,failCities=false,browser;
 await fs.mkdir(out,{recursive:true});
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;
 create function public.is_current_user_owner() returns boolean language sql stable as $$select coalesce(auth.uid()='${owner}'::uuid,false)$$;insert into auth.users values('${owner}'),('${other}');
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;
 create table public.travel_attractions(id text primary key);create table public.travel_journeys(id uuid primary key,slug text,title text,is_published boolean);
 create table public.city_photos(city_name text,image_url text,is_hidden boolean);create table public.travel_cities(name text,country text,region text,visit_date text,longitude numeric,latitude numeric,description text,cover_url text,is_hidden boolean);grant select on travel_cities,travel_journeys,city_photos to anon,authenticated;`);
 await db.exec(await fs.readFile(path.join(root,'supabase/place_journals.sql'),'utf8'));
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/test-api'){
   const chunks=[];for await(const c of req)chunks.push(c);const data=JSON.parse(Buffer.concat(chunks)),who=req.headers['x-test-role'];
   const task=serial.then(async()=>{try{
    if(offline)throw new Error('本地模拟网络不可用');
    await db.exec(`reset role;set request.jwt.claim.sub='${who==='owner'?owner:who==='other'?other:''}';set role ${who==='anon'?'anon':'authenticated'};`);
    let result;
    if(data.kind==='rpc'){
     assert(/^(journal_|is_current_user_owner$)/.test(data.name));
     if(data.name==='journal_save_draft'&&rejectNextDraft){rejectNextDraft=false;throw new Error('模拟照片引用后保存失败');}
     if(data.name==='journal_register_media'&&data.args.p_public_url===failReferenceURL&&referenceFailures>0){referenceFailures--;throw new Error('模拟单张相册照片添加失败');}
     const values=Object.values(data.args);result=(await db.query(`select to_jsonb(public.${data.name}(${values.map((_,i)=>'$'+(i+1)).join(',')})) as v`,values)).rows[0].v;
     if(data.name==='journal_register_media'&&data.args.p_public_url&&failAfterReference){failAfterReference=false;rejectNextDraft=true;}
    }else if(data.kind==='select'){
     if(data.table==='travel_cities'&&failCities)throw new Error('模拟城市目录不可用');
     assert(/^(journal_|travel_|city_photos)/.test(data.table));assert(/^[a-z_,*]+$/.test(data.columns));const values=[],conditions=(data.filters||[]).map(f=>{assert(/^[a-z_]+$/.test(f.k));values.push(f.v);return `${f.k} ${f.in?'= any':'='}($${values.length})`;});const sql=`select ${data.columns} from ${data.table}${conditions.length?' where '+conditions.join(' and '):''}${data.order?' order by '+data.order:''}`;const rows=(await db.query(sql,values)).rows;result=data.single?rows[0]||null:rows;
    }else if(data.kind==='upload'){
     if(failNext&&data.name.endsWith('/image.webp')){failNext=false;throw new Error('模拟单张上传失败');}
     await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[data.bucket,data.name]);blobs.set(data.name,data.body);result={path:data.name};
    }else if(data.kind==='download'){
     if(failDownloads)throw new Error('模拟照片读取网络中断');
     const rows=(await db.query('select name from storage.objects where bucket_id=$1 and name=$2',[data.bucket,data.name])).rows;if(!rows.length)throw new Error('不可用');result=blobs.get(data.name);
    }
    res.setHeader('content-type','application/json');res.end(JSON.stringify({data:result,error:null}));
   }catch(e){res.setHeader('content-type','application/json');res.end(JSON.stringify({data:null,error:{message:e.message,code:e.code}}));}});serial=task.catch(()=>{});return;
  }
  try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/travel-map/,''),target=path.resolve(root,'.'+pathname);if(!target.startsWith(root+path.sep))throw Error();const body=await fs.readFile(target);res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'})[path.extname(target)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/travel-map`;
 async function mockMedia(context){await context.route('**/functions/v1/journal-media**',async route=>{
  mediaGatewayRequests++;await route.fulfill({status:404,body:'Legacy gateway unavailable'});return;
 });}

 try{
  browser=await chromium.launch({headless:true,...process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:sdk}));await context.addInitScript(()=>window.__journalRole='owner');await mockMedia(context,'owner');
  const page=await context.newPage(),errors=[];let unloadWarnings=0;
  async function capture(name){await page.evaluate(()=>{document.activeElement.blur();window.scrollTo({top:0,behavior:'instant'});});await page.waitForTimeout(200);await page.screenshot({path:path.join(out,name),fullPage:true});}
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{if(d.type()==='beforeunload')unloadWarnings++;void d.accept();});
  await page.goto(`${base}/journals.html`);await page.getByText('没有符合条件的手记',{exact:false}).waitFor();assert.equal(await page.locator('.journal-card').count(),0);
  await page.locator('[name=city]:not([disabled])').waitFor();
  const names=await page.locator('[name=city] optgroup option').evaluateAll(els=>els.map(e=>e.value));
  const expected=await page.evaluate(()=>TRAVEL_VISIT_ENGINE.uniqueCities(TRAVEL_VISIT_ENGINE.mergeCityVisits(TRAVEL_DATA.visits,[],[])).map(c=>c.name));
  assert.deepEqual([...names].sort(),[...expected].sort());assert(names.includes('宣城'));assert(names.includes('重庆'));
  await serial;await db.exec('reset role');await db.exec("insert into travel_cities values ('测试新增城','中国','测试省','2025-01-01',110,30,'','',false),('重庆',null,null,null,null,null,null,null,true),('无效城市','中国','测试省',null,110,30,'','',false)");
  await page.reload();await page.locator('[name=city]:not([disabled])').waitFor();const updated=await page.locator('[name=city] optgroup option').evaluateAll(els=>els.map(e=>e.value));assert(updated.includes('测试新增城'));assert(!updated.includes('重庆'));assert(!updated.includes('无效城市'));assert.equal(new Set(updated).size,updated.length);
  await serial;await db.exec('reset role');await db.exec('delete from travel_cities');await page.reload();await page.locator('[name=city]:not([disabled])').waitFor();
  await page.locator('[name=city]').selectOption('宣城');await page.getByText('还没有「宣城」的公开手记').waitFor();assert.equal(new URL(page.url()).searchParams.get('city'),'宣城');
  await page.screenshot({path:path.join(out,'city-empty-desktop.png'),fullPage:true});
  for(const width of [390,768,1024,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);for(const selector of ['[name=city]','[type=reset]'])assert((await page.locator(selector).boundingBox()).height>=44,`${selector} too short at ${width}`);}
  await page.setViewportSize({width:390,height:844});await page.locator('#journal-empty').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'city-empty-mobile-viewport.png')});await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${base}/journals.html?city=不存在的城市`);await page.getByText('所选城市不在当前已到访列表中',{exact:true}).waitFor();assert.equal(await page.locator('.journal-card').count(),0);
  failCities=true;await page.goto(`${base}/journals.html?city=宣城&q=测试`);await page.getByText('城市列表暂时无法读取',{exact:true}).waitFor();assert(await page.locator('[name=city]').isDisabled());await page.screenshot({path:path.join(out,'city-error.png'),fullPage:true});
  failCities=false;await page.getByRole('button',{name:'重试加载城市'}).click();await page.locator('[name=city]:not([disabled])').waitFor();assert.equal(await page.locator('[name=q]').inputValue(),'测试');assert.equal(await page.locator('[name=city]').inputValue(),'宣城');
  await page.goto(`${base}/journals.html`);
  await page.goto(`${base}/journal-edit.html`);await page.locator('#journal-editor-form').waitFor({state:'visible'});
  assert.equal(await page.locator('[name=visibility]').inputValue(),'private');await page.locator('[name=name]').fill('本地验证地点');
  // Opening/cancelling an album must not replace unsaved place fields with the initial model.
  await page.locator('[name=country]').fill('尚未保存的国家');await page.locator('[name=location]').fill('尚未保存的位置');
  await page.locator('#choose-album').click();await page.locator('dialog .journal-album-grid button').first().waitFor();
  assert.equal(await page.locator('[name=name]').inputValue(),'本地验证地点','opening the album must preserve the unsaved place name');
  assert.equal(await page.locator('[name=country]').inputValue(),'尚未保存的国家');assert.equal(await page.locator('[name=location]').inputValue(),'尚未保存的位置');
  await page.locator('dialog').getByRole('button',{name:'关闭',exact:true}).click();
  await page.locator('[name=location]').fill('');await page.locator('#publish-journal').click();
  await page.locator('#journal-action-status').getByText('发布前请填写可读的位置文字',{exact:true}).waitFor();assert.equal(await page.locator('[name=name]').inputValue(),'本地验证地点');
  const validationBox=await page.locator('#journal-action-status').boundingBox();assert(validationBox&&validationBox.y>=0&&validationBox.y+validationBox.height<=1000,'validation feedback must be visible beside the action');
  await page.locator('[name=location]').fill('尚未保存的位置');
  await page.locator('#save-journal').click();await page.locator('#journal-status').filter({hasText:'草稿已保存'}).waitFor();
  const id=new URL(page.url()).searchParams.get('id');assert(id);
  // Preview is read-only and does not save changed content.
  await page.locator('[name=body]').fill('仅用于本地验证的段落。\n\n第二段感受。');await page.locator('#preview-journal').click();await page.locator('dialog').waitFor();assert.match(await page.locator('dialog').innerText(),/尚未保存或发布/);await page.locator('dialog button').first().click();
  await serial;await db.exec('reset role');assert.equal((await db.query('select content from journal_drafts where entry_id=$1',[id])).rows[0].content.body,'');const stablePlace=(await db.query('select place_id from journal_drafts where entry_id=$1',[id])).rows[0].place_id;
  await page.locator('[name=location]').fill('独立区域 · 不关联城市');await page.locator('[name=country]').fill('本地验证地区');await page.locator('[name=visibility]').selectOption('public');await page.locator('[name=rating]').selectOption('7');
  const sharp=require('sharp');const png=await sharp({create:{width:80,height:60,channels:3,background:'#a3c5f0'}}).png().toBuffer();failNext=true;
  const realFixtures=process.env.TRAVEL_PHOTO_FIXTURES?JSON.parse(process.env.TRAVEL_PHOTO_FIXTURES):[];
  const uploadFiles=realFixtures.length?await Promise.all(realFixtures.map(async(file,i)=>({name:`regression-${i}.jpg`,mimeType:'image/jpeg',buffer:await fs.readFile(file)}))):[{name:'one.png',mimeType:'image/png',buffer:png},{name:'two.png',mimeType:'image/png',buffer:png}];
  await page.locator('#journal-files').setInputFiles(uploadFiles);await page.locator('#upload-journal-files').click();await page.getByText('部分照片失败',{exact:false}).waitFor();assert.equal(await page.locator('.journal-photo-item').count(),2);await page.getByRole('button',{name:'重试这张'}).click();await page.getByRole('button',{name:'重试这张'}).waitFor({state:'hidden'});
  // Reopen saved private uploads: local file previews must not hide a failed read.
  await page.reload();await page.locator('.journal-photo-item').nth(1).waitFor();await page.locator('.journal-photo-item img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));assert.equal(mediaGatewayRequests,0);
  const storedBeforeRetry=blobs.size;failDownloads=true;await page.reload();await page.getByText('照片已上传，暂时无法读取。可重新加载，无需重复上传。',{exact:true}).first().waitFor();await capture('private-photo-read-error.png');await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.journal-photo-queue').screenshot({path:path.join(out,'private-photo-read-error-mobile.png')});await page.setViewportSize({width:1440,height:1000});
  failDownloads=false;await page.getByRole('button',{name:'重新加载照片',exact:true}).first().click();await page.locator('.journal-photo-item img').first().waitFor({state:'visible'});await page.locator('.journal-photo-item img').first().evaluate(img=>img.decode());assert.equal(blobs.size,storedBeforeRetry,'read retries must not upload duplicates');await page.getByRole('button',{name:'重新加载照片',exact:true}).last().click();await page.locator('.journal-photo-item img').nth(1).waitFor({state:'visible'});await page.locator('.journal-photo-item img').nth(1).evaluate(img=>img.decode());await capture('private-photos-recovered.png');await page.locator('.journal-photo-queue').screenshot({path:path.join(out,'private-photos-recovered-detail.png')});await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.journal-photo-queue').screenshot({path:path.join(out,'private-photos-recovered-mobile.png')});await page.setViewportSize({width:1440,height:1000});
  await page.locator('.journal-photo-item').last().getByRole('button',{name:'前移',exact:true}).click();await page.locator('.journal-photo-item').first().getByRole('button',{name:'设为封面'}).click();
  await page.locator('#choose-album').click();await page.locator('.journal-album-grid button').first().waitFor();
  const checks=page.locator('.journal-album-grid [role=checkbox]'),batchAdd=page.locator('#add-journal-album-selection');
  assert(await batchAdd.isDisabled());await checks.nth(0).click();await checks.nth(0).press('Space');assert.equal(await checks.nth(0).getAttribute('aria-checked'),'false');
  for(const i of [0,1,2])await checks.nth(i).click();assert(await page.locator('dialog').isVisible());assert.equal(await page.locator('.journal-photo-item').count(),2,'checkboxes do not add or close the album');
  await page.locator('#journal-album-count').filter({hasText:'已选 3 张'}).waitFor();
  const scrollBefore=await page.locator('.journal-album-scroll').evaluate(el=>el.scrollTop);await checks.nth(0).click();await checks.nth(0).click();assert.equal(await page.locator('.journal-album-scroll').evaluate(el=>el.scrollTop),scrollBefore);
  await page.getByRole('searchbox',{name:'筛选相册城市'}).fill('京都');await checks.first().click();await checks.first().press('Space');await page.locator('#journal-album-count').filter({hasText:'已选 3 张'}).waitFor();
  await page.getByRole('searchbox',{name:'筛选相册城市'}).fill('');for(const i of [0,1,2])assert.equal(await checks.nth(i).getAttribute('aria-checked'),'true');
  await serial;await db.exec('reset role');assert.equal(Number((await db.query("select count(*) as n from journal_media where entry_id=$1 and source='public_album'",[id])).rows[0].n),0,'checking and filtering must not write media references');
  await page.screenshot({path:path.join(out,'album-multi-desktop.png')});
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const addBox=await batchAdd.boundingBox();assert(addBox&&addBox.y>=0&&addBox.y+addBox.height<=844,'batch action stays visible on mobile');await page.screenshot({path:path.join(out,'album-multi-mobile.png')});await page.setViewportSize({width:1440,height:1000});
  offline=true;await batchAdd.click();await page.locator('dialog .journal-album-feedback').getByText('本地模拟网络不可用',{exact:true}).waitFor();assert(await batchAdd.isEnabled());assert.equal(await page.locator('[name=name]').inputValue(),'本地验证地点');await capture('album-error-desktop.png');
  offline=false;failAfterReference=true;failReferenceURL=await checks.nth(1).getAttribute('data-photo-url');referenceFailures=2;await batchAdd.click();await page.locator('dialog .journal-album-feedback').getByText('模拟照片引用后保存失败',{exact:true}).waitFor();assert.equal(await page.locator('.journal-photo-item').count(),2,'a failed draft write leaves the existing queue intact');
  await batchAdd.click();await page.locator('dialog .journal-album-feedback').filter({hasText:'1 张未成功'}).waitFor();await page.locator('#journal-album-count').filter({hasText:'已选 1 张'}).waitFor();assert.equal(await page.locator('.journal-photo-item').count(),4);assert(await checks.nth(0).isDisabled());assert(await checks.nth(1).isEnabled());
  await page.screenshot({path:path.join(out,'album-multi-partial-retry.png')});await batchAdd.click();await page.locator('dialog').waitFor({state:'hidden'});assert.equal(await page.locator('.journal-photo-item').count(),5);
  await serial;await db.exec('reset role');assert.equal(Number((await db.query("select count(*) as n from journal_media where entry_id=$1 and source='public_album'",[id])).rows[0].n),3,'batch retries must reuse references already created');
  await page.locator('#choose-album').click();await checks.first().waitFor();for(const i of [0,1,2]){assert(await checks.nth(i).isDisabled());assert.equal(await checks.nth(i).getAttribute('aria-checked'),'true');}assert(await batchAdd.isDisabled());await checks.nth(3).click();await page.getByRole('button',{name:'清空已选',exact:true}).click();assert.equal(await checks.nth(3).getAttribute('aria-checked'),'false');assert(await batchAdd.isDisabled());await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement===document.querySelector('#choose-album'));
  await page.locator('.journal-photo-item').last().getByRole('button',{name:'设为封面'}).click();assert(await page.locator('.journal-photo-item').first().getByRole('button',{name:'前移',exact:true}).isDisabled());assert(await page.locator('.journal-photo-item').last().getByRole('button',{name:'后移',exact:true}).isDisabled());
  await serial;await db.exec('reset role');assert.equal((await db.query('select place_id from journal_drafts where entry_id=$1',[id])).rows[0].place_id,stablePlace);
  await capture('03-editor-desktop.png');
  await page.locator('#publish-journal').click();offline=true;await page.locator('dialog').getByRole('button',{name:'确认发布',exact:true}).click();await page.locator('dialog .journal-publish-feedback').getByText('本地模拟网络不可用',{exact:true}).waitFor();assert(await page.locator('dialog').getByRole('button',{name:'确认发布',exact:true}).isEnabled());await capture('publish-error-desktop.png');
  offline=false;await page.locator('dialog').getByRole('button',{name:'确认发布',exact:true}).click();await page.waitForURL('**/journal.html?id=*');await page.locator('#journal-article h1').waitFor();assert.match(await page.locator('#journal-article').innerText(),/我的评分 7/);await page.locator('#journal-article .journal-cover img').evaluate(img=>img.decode());assert(await page.locator('#journal-article .journal-cover img').evaluate(img=>img.naturalWidth>=800));await capture('02-detail-desktop.png');
  // Exercise a published city association and ensure free-form country does not hide it.
  await serial;await db.exec('reset role');await db.query("update journal_places set city_name='宣城' where id=$1",[stablePlace]);
  await page.goto(`${base}/journals.html?city=宣城`);await page.locator('.journal-card').first().waitFor();assert.equal(await page.locator('.journal-card').count(),1);await page.screenshot({path:path.join(out,'city-result-desktop.png'),fullPage:true});
  await page.locator('[name=q]').fill('无匹配词');await page.getByText('没有符合条件的「宣城」手记').waitFor();await page.getByRole('button',{name:'仅看这座城市'}).click();await page.locator('.journal-card').first().waitFor();assert.equal(await page.locator('[name=city]').inputValue(),'宣城');assert.equal(await page.locator('[name=q]').inputValue(),'');
  await page.locator('[name=region]').selectOption({label:'本地验证地区'});assert.equal(await page.locator('[name=city]').inputValue(),'');await page.locator('[name=city]').selectOption('宣城');assert.equal(await page.locator('[name=region]').inputValue(),'');
  await page.locator('.journal-card h3 a').click();await page.locator('#journal-back').click();await page.locator('.journal-card').first().waitFor();assert.equal(await page.locator('[name=city]').inputValue(),'宣城');
  await serial;await db.exec('reset role');await db.query('update journal_places set city_name=null where id=$1',[stablePlace]);
  await page.goto(`${base}/journals.html`);await page.locator('.journal-card').first().waitFor();await capture('01-public-list-desktop.png');await page.locator('.journal-card h3 a').first().click();await page.locator('#journal-article h1').waitFor();
  await page.locator('#journal-article .journal-cover button').click();await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement===document.querySelector('#journal-article .journal-cover button'));await page.locator('#journal-edit-link').click();await page.locator('#journal-editor-form').waitFor({state:'visible'});await page.locator('[name=body]').fill('私有修订文字，不应提前泄露');await page.locator('[name=visibility]').selectOption('private');await page.locator('#save-journal').click();await page.locator('#journal-status').filter({hasText:'草稿已保存'}).waitFor();
  const publicContext=await browser.newContext();await publicContext.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:sdk}));await mockMedia(publicContext,'anon');const visitor=await publicContext.newPage();
  await visitor.goto(`${base}/journal.html?id=${id}`);await visitor.locator('#journal-article h1').waitFor();assert(!await visitor.locator('#journal-article').innerText().then(s=>s.includes('私有修订')));assert(await visitor.locator('#journal-edit-link').isHidden());
  await serial;await db.exec('reset role');const privateMedia=(await db.query("select * from journal_media where entry_id=$1 and source='private' and ready limit 1",[id])).rows[0];
  assert(await visitor.evaluate(async m=>{const img=new Image();img.src=await JOURNAL_SERVICE.mediaURL(m,true);await img.decode();return img.naturalWidth>0;},privateMedia),'published private-storage images remain readable under anonymous RLS');
  // Publish update then withdraw. Previously authorized object paths lose read access.
  assert(await page.locator('#withdraw-journal').isVisible());await page.locator('[name=visibility]').selectOption('public');await page.locator('#publish-journal').click();await page.locator('dialog').getByRole('button',{name:'更新发布',exact:true}).click();await page.waitForURL('**/journal.html?id=*');await page.locator('#journal-edit-link').click();await page.locator('#journal-editor-form').waitFor({state:'visible'});await page.locator('#withdraw-journal').click();await page.getByText('已撤下公开',{exact:false}).waitFor();
  await visitor.reload();await visitor.getByText('这篇手记暂时不可用。',{exact:true}).waitFor();assert(await visitor.locator('#journal-article').isHidden());
  assert(await visitor.evaluate(async m=>{try{await JOURNAL_SERVICE.mediaURL(m,true);return false;}catch{return true;}},privateMedia),'withdrawal blocks a direct read using a previously known storage path');
  const nonOwnerContext=await browser.newContext();await nonOwnerContext.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:sdk}));await nonOwnerContext.addInitScript(()=>window.__journalRole='other');const nonOwner=await nonOwnerContext.newPage();await nonOwner.goto(`${base}/journals.html`);await nonOwner.getByText('没有符合条件的手记',{exact:false}).waitFor();assert(await nonOwner.evaluate(async m=>{try{await JOURNAL_SERVICE.mediaURL(m,true);return false;}catch{return true;}},privateMedia),'a signed-in non-owner cannot download a private object');await nonOwnerContext.close();
  await page.locator('#archive-journal').click();await page.getByText('手记已归档',{exact:false}).waitFor();await page.locator('#restore-journal').click();await page.getByText('已恢复为草稿',{exact:false}).waitFor();
  // Same place -> new entry. No city reference is needed; date/rating remain null.
  await page.goto(`${base}/journals.html?view=mine`);await page.locator('.journal-card').first().waitFor();await capture('01-list-desktop.png');
  const existingPlace=await page.evaluate(()=>document.querySelector('.journal-card h3').textContent);
  await page.goto(`${base}/journal-edit.html`);await page.locator('#journal-editor-form').waitFor({state:'visible'});await page.locator('#journal-editor-form [name=place_picker]').selectOption({label:'本地验证地点 · 本地验证地区 · 独立区域 · 不关联城市'});await page.locator('[name=body]').fill('另一篇独立的到访');await page.locator('#save-journal').click();await page.locator('#journal-status').filter({hasText:'草稿已保存'}).waitFor();const second=new URL(page.url()).searchParams.get('id');assert.notEqual(second,id);
  await page.locator('#publish-journal').click();await page.locator('dialog').getByRole('button',{name:'确认发布',exact:true}).click();await page.waitForURL('**/journal.html?id=*');await page.locator('#journal-article h1').waitFor();assert.match(await page.locator('#journal-article').innerText(),/日期待补充/);assert.match(await page.locator('#journal-article').innerText(),/未评分/);
  await visitor.goto(`${base}/journal.html?id=${second}`);await visitor.getByText('这篇手记暂时不可用。',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.goto(`${base}/journals.html?view=mine`);await page.locator('.journal-card').first().waitFor();
  await page.locator('#journal-filters [name=q]').fill('另一篇独立');await page.getByText('1 篇手记 · 1 个地点',{exact:true}).waitFor();
  await page.locator('#journal-filters [name=kind]').selectOption('nature');await page.getByText('没有符合条件的手记',{exact:false}).waitFor();
  await page.getByRole('button',{name:'清除筛选'}).click();await page.getByText('2 篇手记 · 1 个地点',{exact:true}).waitFor();
  await page.locator('#journal-filters [name=q]').fill('独立区域');await page.getByText('2 篇手记 · 1 个地点',{exact:true}).waitFor();
  await page.evaluate(()=>window.scrollTo({top:350,behavior:'instant'}));await page.locator('.journal-card h3 a').last().click();await page.locator('#journal-article h1').waitFor();const savedY=await page.evaluate(()=>Number(sessionStorage.getItem('journal-scroll:'+new URLSearchParams(location.search).get('return'))));await page.locator('#journal-back').click();await page.waitForFunction(y=>Math.abs(window.scrollY-y)<2,savedY);
  await page.locator('.journal-card').first().waitFor();assert.equal(await page.locator('#journal-filters [name=q]').inputValue(),'独立区域');
  for(const width of [390,768,1024,1440]){await page.setViewportSize({width,height:900});await page.goto(`${base}/journals.html?view=mine`);await page.locator('.journal-card').first().waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,`list-${width}.png`),fullPage:true});}
  await page.setViewportSize({width:390,height:844});await page.goto(`${base}/journal-edit.html?id=${second}`);await page.locator('#journal-editor-form').waitFor({state:'visible'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await capture('editor-mobile.png');
  await page.locator('[name=body]').fill('触发未保存离开提醒的本地测试');await page.goto(`${base}/journals.html?view=mine`);assert(unloadWarnings>0,'unsaved editor navigation must warn');
  // Pending uploads also count toward the 100-photo cap, before any album writes.
  await page.goto(`${base}/journal-edit.html`);await page.locator('#journal-editor-form').waitFor({state:'visible'});await page.locator('[name=name]').fill('容量边界验证');await page.locator('#journal-files').setInputFiles(Array.from({length:99},(_,i)=>({name:`capacity-${i}.png`,mimeType:'image/png',buffer:png})));
  await page.locator('#choose-album').click();await checks.first().waitFor();await checks.nth(0).click();await checks.nth(1).click();await page.locator('dialog .journal-album-feedback').filter({hasText:'最多 100 张'}).waitFor();assert.equal(await checks.nth(0).getAttribute('aria-checked'),'true');assert.equal(await checks.nth(1).getAttribute('aria-checked'),'false');await page.locator('#journal-album-count').filter({hasText:'已选 1 张'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.journal-photo-item').count(),99);
  await visitor.goto(`${base}/journals.html`);await visitor.getByText('没有符合条件的手记',{exact:false}).waitFor();assert.equal(await visitor.locator('.journal-owner:visible').count(),0);
  await visitor.goto(`${base}/journal-edit.html`);await visitor.getByText('编辑仅向站主开放。',{exact:true}).waitFor();assert.equal(await visitor.getByRole('link',{name:'← 返回我的记录',exact:true}).count(),0);await visitor.getByRole('link',{name:'← 返回公开手记',exact:true}).click();await visitor.getByText('没有符合条件的手记',{exact:false}).waitFor();
  offline=true;await visitor.reload();await visitor.locator('#journal-retry').waitFor({state:'visible'});offline=false;await visitor.locator('#journal-retry').click();await visitor.getByText('没有符合条件的手记',{exact:false}).waitFor();
  assert.equal(mediaGatewayRequests,0,'private media reads do not depend on the failing legacy gateway');assert.deepEqual(errors,[]);console.log('Journal browser workflow passed with real local PostgreSQL RLS and isolated storage adapter. Screenshots: '+out);
 }finally{await browser?.close();await new Promise(r=>server.close(r));await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
