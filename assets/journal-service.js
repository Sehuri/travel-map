(function(){
 'use strict';
 let client,owner=false;
 const urls=new Set();
 const check=r=>{if(r.error)throw r.error;return r.data;};
 const one=r=>{const d=check(r);return Array.isArray(d)?d[0]:d;};
 async function init(){
  const c=window.SUPABASE_CONFIG;
  if(!window.supabase?.createClient||!c?.url||!c.publishableKey)throw new Error('手记服务暂时无法连接，请检查网络后重试。');
  // Private media must be checked against current RLS on every read, including
  // after a published entry is withdrawn. Do not reuse a cached storage response.
  client=window.supabase.createClient(c.url,c.publishableKey,{global:{fetch:(input,options)=>fetch(input,{...options,cache:'no-store'})}});
  const session=check(await client.auth.getSession())?.session;
  if(session?.user&&!session.user.is_anonymous){const r=await client.rpc('is_current_user_owner');owner=!r.error&&r.data===true;}
  client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')location.reload();});
  return {owner};
 }
 async function records(mine=false){
  if(mine&&!owner)throw new Error('当前账号无权访问我的记录');
  const entries=check(await client.from(mine?'journal_entries':'journal_public_entries').select('*'));
  if(!entries.length)return [];
  const ids=entries.map(e=>e.published_version_id).filter(Boolean);
  const versions=ids.length?check(await client.from('journal_versions').select('*').in('id',ids)):[];
  const drafts=mine?check(await client.from('journal_drafts').select('*')):[];
  const places=check(await client.from('journal_places').select('*'));
  return entries.map(e=>{
   const draft=drafts.find(d=>d.entry_id===e.id),v=versions.find(v=>v.id===e.published_version_id),visible=v||draft;
   return visible?{...e,place:places.find(p=>p.id===visible.place_id),content:visible.content,draft,version:v}:null;
  }).filter(j=>j?.place);
 }
 async function detail(id,editing=false){
  if(editing&&!owner)throw new Error('请先使用站主账号登录');
  const entry=one(await client.from(editing?'journal_entries':'journal_public_entries').select('*').eq('id',id).maybeSingle());
  // Owner reading a private completed record is allowed only after owner authorization.
  if(!entry&&!editing&&owner)return detail(id,true);
  if(!entry)return null;
  const d=editing?one(await client.from('journal_drafts').select('*').eq('entry_id',id).maybeSingle()):null;
  const v=entry.published_version_id?one(await client.from('journal_versions').select('*').eq('id',entry.published_version_id).maybeSingle()):null;
  const current=d||v;if(!current)return null;
  const place=one(await client.from('journal_places').select('*').eq('id',current.place_id).maybeSingle());
  const placeEditable=editing&&owner&&place?check(await client.rpc('journal_place_editable',{p_place_id:place.id,p_entry_id:id})):false;
  return place?{...entry,content:current.content,place,placeEditable,draft:d,version:v,publishedVisibility:entry.visibility,visibility:d?.visibility||entry.visibility}:null;
 }
 async function places(){return check(await client.from('journal_places').select('*').order('name'));}
 async function save(j){return one(await client.rpc('journal_save_draft',{p_id:j.id,p_place_id:j.place.id,p_place:j.place,p_content:j.content,p_visibility:j.visibility,p_revision:j.revision}));}
 async function publish(j){return one(await client.rpc('journal_publish',{p_id:j.id,p_revision:j.revision,p_visibility:j.visibility}));}
 async function state(j,action){return one(await client.rpc('journal_set_state',{p_id:j.id,p_revision:j.revision,p_action:action}));}
 async function media(ids){return ids.length?check(await client.from('journal_media').select('*').in('id',ids)):[];}
 async function mediaURL(m,large=false){
  if(m.source==='public_album')return large?m.public_url:window.TRAVEL_PHOTOS.urlFor(m.public_url,'grid');
  const path=large?m.object_path:m.thumb_path;
  if(m.source!=='private'||!/^([0-9a-f-]{36})\/([0-9a-f-]{36})\/(image|thumb)\.webp$/i.test(path||''))throw new Error('照片暂时不可用');
  // The SDK uses the same publishable key and current session as uploads.
  // Both journal_media SELECT and storage.objects SELECT still enforce parent
  // entry RLS. No public bucket, signed URL or server/admin credential is used.
  const blob=check(await client.storage.from('place-journal-media').download(path));
  if(!blob?.size)throw new Error('照片暂时不可用');
  const url=URL.createObjectURL(blob);urls.add(url);return url;
 }
 async function decoded(file){
  if(['image/jpeg','image/png'].includes(file.type)){
   const variants=await window.TRAVEL_PHOTOS.createPreviews(file);
   if(variants.length)return {image:variants.at(-1).blob,thumb:variants[0].blob};
  }
  // Re-encode every format; no raw EXIF/GPS is served. Animated formats use a still frame.
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  try{
   async function draw(width){const c=document.createElement('canvas');c.width=Math.min(width,bitmap.width);c.height=Math.max(1,Math.round(bitmap.height*c.width/bitmap.width));c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);const b=await new Promise(r=>c.toBlob(r,'image/webp',.86));if(!b||b.type!=='image/webp')throw new Error('当前浏览器无法转换照片，请使用 JPEG 或 PNG 重试');return b;}
   return {image:await draw(1600),thumb:await draw(480)};
  }finally{bitmap.close();}
 }
 async function upload(entryId,file){
  const validation=window.TRAVEL_PHOTO_UPLOAD.validate(file);if(validation.error)throw new Error(validation.error);
  if(file.type!==validation.type)file=new File([file],file.name,{type:validation.type});
  const encoded=await decoded(file),id=crypto.randomUUID();
  const m=one(await client.rpc('journal_register_media',{p_entry_id:entryId,p_id:id,p_public_url:null}));
  for(const [path,blob]of [[m.object_path,encoded.image],[m.thumb_path,encoded.thumb]])check(await client.storage.from('place-journal-media').upload(path,blob,{upsert:false,contentType:'image/webp',cacheControl:'0'}));
  return one(await client.rpc('journal_complete_media',{p_id:id}));
 }
 async function reference(entryId,url){return one(await client.rpc('journal_register_media',{p_entry_id:entryId,p_id:crypto.randomUUID(),p_public_url:url}));}
 async function login(email){check(await client.auth.signInWithOtp({email,options:{emailRedirectTo:new URL('./journal-edit.html',location.href).href}}));}
 async function album(){
  const base=Object.entries(window.PHOTO_MANIFEST||{}).flatMap(([city,photos])=>photos.map(url=>({city,url})));
  const rows=check(await client.from('city_photos').select('city_name,image_url').eq('is_hidden',false));
  return [...new Map([...base,...rows.map(p=>({city:p.city_name,url:p.image_url}))].map(p=>[p.url,p])).values()];
 }
 async function choices(){
  const [cities,journeys]=await Promise.all([client.from('travel_cities').select('name,is_hidden'),client.from('travel_journeys').select('id,slug,title,is_published')]);
  const citySet=new Set((window.TRAVEL_DATA?.visits||[]).map(c=>c.name));check(cities).forEach(c=>c.is_hidden?citySet.delete(c.name):citySet.add(c.name));
  const trips=new Map((window.TRAVEL_DATA?.journeys||[]).map(j=>[j.slug,{slug:j.slug,title:j.title}]));check(journeys).forEach(j=>trips.set(j.slug,j));
  return {cities:[...citySet].sort((a,b)=>a.localeCompare(b,'zh-CN')),journeys:[...trips.values()]};
 }
 async function visitedCities(){
  // Use the homepage's profile merge and identity rules, not journal coverage.
  // Additional visit dates cannot add a city, so only city profiles are needed.
  const rows=check(await client.from('travel_cities').select('name,country,region,visit_date,longitude,latitude,description,cover_url,is_hidden'));
  const engine=window.TRAVEL_VISIT_ENGINE;
  if(!engine)throw new Error('城市筛选暂时不可用，请刷新页面后重试。');
  return engine.uniqueCities(engine.mergeCityVisits(window.TRAVEL_DATA?.visits||[],rows,[]))
   .map(c=>({name:c.name,country:c.country,region:c.region}))
   .sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
 }
 async function linked(id){const j=check(await client.rpc('journal_linked_journey',{p_id:id}));if(!j)return null;if(j.builtin){const base=window.TRAVEL_DATA?.journeys?.find(b=>b.slug===j.slug);return base?{slug:base.slug,title:base.title}:null;}return j;}
 function revoke(){urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();}
 window.addEventListener('pagehide',revoke);
 window.JOURNAL_SERVICE={init,records,detail,places,save,publish,state,media,mediaURL,upload,reference,login,album,choices,visitedCities,linked,revoke,get owner(){return owner;}};
})();
