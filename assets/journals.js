(function(){
 'use strict';
 const E=window.JOURNAL_ENGINE,S=window.JOURNAL_SERVICE;
 const $=s=>document.querySelector(s);
 const node=(tag,text='',cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
 const link=(text,url,cls)=>{const a=node('a',text,cls);a.href=url;return a;};
 const btn=(text,fn,cls)=>{const b=node('button',text,cls);b.type='button';b.onclick=fn;return b;};
 const params=new URLSearchParams(location.search);
 const returnURL=()=>{const u=new URL('./journals.html',location.href),raw=params.get('return');if(raw){const saved=new URL(raw,location.href);if(saved.origin===u.origin&&saved.pathname===u.pathname)return saved.href;}return u.href;};
 function status(text,error=false){$('#journal-status').textContent=text;$('#journal-status').classList.toggle('journal-error',error);}
 function failure(e){const message=['42P01','PGRST205'].includes(e.code)?'手记服务尚未配置完成，请稍后再来。':`暂时无法读取或保存手记。${e.message||''} 可稍后重试。`;status(message,true);$('#journal-retry').hidden=false;}
 function navigation(){
  const names=[['地图','./index.html#map-section'],['旅程','./index.html#journey-archive'],['影像','./index.html#photo-cinema'],['手记','./journals.html'],['数据','./index.html#journey-stats'],['百城计划','./index.html#hundred-cities'],['下一站','./discover.html']];
  const header=node('header','','site-header'),brand=link('','./index.html','brand');brand.append(node('span','S','brand-mark'),node('span','SEHURI','desktop-brand-title'));const brandText=brand.querySelector('.desktop-brand-title');brandText.append(node('small','旅行足迹'));header.append(brand);
  const actions=node('div','','header-actions'),nav=node('nav','','desktop-nav');nav.setAttribute('aria-label','旅行主题');
  for(const [name,url]of names){const a=link(name,url);if(name==='手记')a.setAttribute('aria-current','page');nav.append(a);}
  const menu=node('nav','','site-menu');menu.id='journal-menu';menu.setAttribute('popover','auto');menu.setAttribute('aria-label','更多导航');
  names.concat([['城市时间线','./index.html#memories'],['往年今日','./index.html#memory-rewind'],['评分排行','./index.html#ratings'],['我的愿望','./index.html#wishlist-panel']]).forEach(([name,url])=>{const a=link(name,url);if(name==='手记')a.setAttribute('aria-current','page');menu.append(a);});
  const mine=link('我的记录','./journals.html?view=mine','journal-owner');mine.hidden=true;menu.append(mine);
  const toggle=btn('',()=>{} ,'icon-button');toggle.setAttribute('popovertarget',menu.id);toggle.setAttribute('aria-label','打开导航菜单');toggle.setAttribute('aria-expanded','false');toggle.onclick=null;toggle.append(node('span','','ui-icon icon-menu'));menu.addEventListener('toggle',e=>toggle.setAttribute('aria-expanded',String(e.newState==='open')));
  actions.append(nav,toggle);header.append(actions);const dock=node('nav','','mobile-dock');dock.setAttribute('aria-label','手机快捷导航');
  [['地图','map-section','pin'],['旅程','journey-archive','list'],['影像','photo-cinema','photo'],['愿望','wishlist-panel','heart']].forEach(([name,hash,icon])=>{const a=link('',`./index.html#${hash}`);a.append(node('span','',`ui-icon icon-${icon}`),node('span',name));dock.append(a);});
  $('#journal-navigation').append(header,menu,dock);
 }
 function modal(title){const d=node('dialog'),h=node('h2',title);h.id=`journal-modal-${crypto.randomUUID()}`;d.setAttribute('aria-labelledby',h.id);const trigger=document.activeElement;const controls=node('div','','journal-modal-actions');controls.append(btn('关闭',()=>d.close()));d.append(controls,h);d.addEventListener('close',()=>{d.remove();if(trigger?.isConnected)trigger.focus({preventScroll:true});});d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});document.body.append(d);return d;}
 async function image(m,large=false,preview=false){const img=node('img');img.alt='手记照片';img.loading=large?'eager':'lazy';img.decoding='async';try{if(m.source==='public_album'&&(!large||preview))window.TRAVEL_PHOTOS.setImage(img,m.public_url,{size:large?'large':'grid',loading:large?'eager':'lazy'});else img.src=await S.mediaURL(m,large);}catch{img.alt='照片暂时无法加载';img.dataset.loadError='true';}return img;}
 async function cover(m,click){const wrap=node('div','','journal-cover');if(!m){wrap.append(node('span','暂无照片','journal-no-photo'));return wrap;}const img=await image(m,Boolean(click),Boolean(click));function unavailable(){img.hidden=true;if(wrap.querySelector('.journal-image-error'))return;const error=node('div','','journal-image-error');error.setAttribute('role','status');error.append(node('span','照片暂时无法加载'),btn('重新加载照片',async()=>{const replacement=await cover(m,click);wrap.replaceWith(replacement);}));wrap.append(error);}img.onerror=unavailable;if(click){const b=btn('照片查看器',click);b.setAttribute('aria-label','打开照片查看器');b.textContent='';b.append(img);wrap.append(b);}else wrap.append(img);if(img.dataset.loadError)unavailable();return wrap;}
 function meta(j){const n=node('p');n.append(node('span',j.content.visit_date||'日期待补充'),document.createTextNode(' · '),node('span',j.content.rating==null?'未评分':`我的评分 ${j.content.rating} / 10`,'journal-rating'));return n;}
 function tags(c){const wrap=node('div','','journal-tags');(c.tags||[]).forEach(t=>wrap.append(node('span',t,'journal-tag')));return wrap;}
 async function viewer(media,start){const d=modal('旅行照片');d.classList.add('journal-viewer');const area=node('div'),text=node('p'),controls=node('div','','journal-modal-actions');let index=start,version=0;async function render(){const token=++version;area.replaceChildren(node('p','正在读取照片…'));const img=await image(media[index],true);if(token!==version)return;function unavailable(){if(token===version)area.replaceChildren(node('p','照片暂时无法加载，请重试。','journal-error'),btn('重新加载照片',()=>void render()));}img.onerror=unavailable;if(img.dataset.loadError)unavailable();else area.replaceChildren(img);text.textContent=`${index+1} / ${media.length}${media[index].caption?' · '+media[index].caption:''}`;prev.disabled=index===0;next.disabled=index===media.length-1;}
  const prev=btn('上一张',()=>{index--;void render();}),next=btn('下一张',()=>{index++;void render();});controls.append(prev,text,next);d.append(area,controls);d.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'&&index>0){index--;void render();}if(e.key==='ArrowRight'&&index<media.length-1){index++;void render();}});d.showModal();await render();
 }
 async function readArticle(target,j,{preview=false}={}){
  target.replaceChildren();if(preview)target.append(node('p','预览 · 尚未保存或发布。关闭后继续编辑。','journal-preview-notice'));
  target.append(node('h1',E.title(j.content,j.place)),node('p',[j.place.name,j.place.country,j.place.location].filter(Boolean).join(' · ')),meta(j),tags(j.content));
  const ids=(j.content.photos||[]).map(p=>p.id),rows=ids.length?await S.media(ids):[],media=ids.map(id=>{const m=rows.find(m=>m.id===id);return m?{...m,caption:j.content.photos.find(p=>p.id===id)?.caption||''}:null;}).filter(Boolean);const chosen=media.find(m=>m.id===j.content.cover_id)||media[0];
  target.append(await cover(chosen,chosen?()=>viewer(media,media.indexOf(chosen)):null));
  if(media.length>1){const strip=node('div','','journal-thumbnails');for(let i=0;i<media.length;i++){const b=btn('',()=>viewer(media,i));b.setAttribute('aria-label',`查看第 ${i+1} 张照片`);b.append(await image(media[i]));strip.append(b);}target.append(strip);}
  const layout=node('div','','journal-reading-layout'),body=node('section'),aside=node('aside','','journal-reading-aside');body.append(node('h2','留在这里的感受'),node('p',j.content.body||'暂未填写感受。','journal-body'));
  const revisit={yes:'还想再去一次',no:'暂时不再访',maybe:'也许会再访'}[j.content.revisit];if(revisit)body.append(node('p',revisit,'journal-tag'));
  aside.append(node('h3','地点资料'),node('p',j.place.location||'位置待补充'),node('p',E.kinds[j.place.kind]||j.place.kind));
  if(j.place.city_name)aside.append(link(`查看城市：${j.place.city_name}`,`./index.html?city=${encodeURIComponent(j.place.city_name)}`));
  if(!preview){const trip=await S.linked(j.id);if(trip)aside.append(node('h3','属于这趟旅程'),link(trip.title,`./journey.html?slug=${encodeURIComponent(trip.slug)}`));}
  layout.append(body,aside);target.append(layout);
 }
 async function list(){
  const mine=params.get('view')==='mine';if(mine&&!S.owner){status('此页面不可用，请返回公开手记。');$('#journal-count').textContent='';return;}
  $('#journal-list-title').textContent=mine?'我的记录':'公开手记';
  document.querySelectorAll('#journal-filters .journal-owner').forEach(n=>n.hidden=!mine);
  const all=await S.records(mine),form=$('#journal-filters'),grid=$('#journal-grid');
  const citySelect=form.elements.city,cityHelp=$('#journal-city-help'),cityRetry=$('#journal-city-retry'),empty=$('#journal-empty');
  let cities=[],cityState='loading',token=0,resetting=false;
  function regionOptions(){
   const select=form.elements.region,current=select.value;
   const countries=[...new Set([...all.map(j=>j.place.country),...cities.map(c=>c.country)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
   select.replaceChildren(new Option('全部国家 / 地区',''));
   countries.forEach(v=>select.add(new Option(v,v)));
   // Keep a direct-link filter even if its country has no visible journals.
   if(current&&!countries.includes(current))select.add(new Option(current,current));
   select.value=current;
  }
  regionOptions();
  [...new Set(all.map(j=>j.content.visit_date?.slice(0,4)).filter(Boolean))].sort().reverse().forEach(v=>form.elements.year.add(new Option(v,v)));
  if(params.get('region')&&![...form.elements.region.options].some(o=>o.value===params.get('region')))form.elements.region.add(new Option(params.get('region'),params.get('region')));
  if(params.get('city'))citySelect.add(new Option(params.get('city'),params.get('city')));
  for(const input of form.elements)if(input.name&&params.has(input.name))input.value=params.get(input.name);
  function cityOptions(){
   const selected=citySelect.value;
   citySelect.replaceChildren(new Option(`全部已到访城市（${cities.length}）`,''));
   const countries=[...new Set(cities.map(c=>c.country))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
   for(const country of countries){const group=node('optgroup');group.label=country;cities.filter(c=>c.country===country).forEach(c=>group.append(new Option(c.name,c.name)));citySelect.append(group);}
   if(selected&&!cities.some(c=>c.name===selected)){const option=new Option('所选城市已不在当前足迹中',selected);option.disabled=true;citySelect.add(option);}
   citySelect.value=selected;
  }
  function resetFilters(keepCity=false){
   const selected=keepCity?citySelect.value:'';
   resetting=true;form.reset();resetting=false;citySelect.value=selected;
   void render().catch(failure);(keepCity?form.elements.q:citySelect.disabled?form.elements.q:citySelect).focus({preventScroll:true});
  }
  function showEmpty(f){
   empty.replaceChildren();empty.hidden=false;
   let title='暂时没有符合条件的手记',description='试试调整搜索、年份或类型，也可以清除筛选，看看其他旅行记忆。';
   const selected=cities.find(c=>c.name===f.city),actions=node('div','','journal-empty-actions');
   if(f.city&&cityState==='loading'){
    title='正在核对所选城市…';description='城市列表读取完成后，会显示这座城市的手记。';
   }else if(f.city&&cityState==='error'){
    title='城市列表暂时无法读取';description='请在筛选区重试加载城市；也可以清除筛选，继续浏览已有手记。';
   }else if(f.city&&!selected){
    title='所选城市不在当前已到访列表中';description='这座城市可能已被隐藏或调整。请重新选择城市，或浏览全部手记。';
   }else if(selected){
    const hasCityJournals=E.filter(all,{city:selected.name}).length>0;
    if(hasCityJournals){
     title=`没有符合条件的「${selected.name}」手记`;
     description='这座城市有可查看的手记，但没有匹配当前的其他条件。可以保留城市，清除搜索、年份、类型等筛选。';
     actions.append(btn('仅看这座城市',()=>resetFilters(true),'journal-primary'));
    }else{
     title=`还没有「${selected.name}」的${mine?'':'公开'}手记`;
     description=mine?'这座城市已计入旅行足迹，还没有关联到它的手记。以后写作时可在“关联城市”中选择它。':'这座城市已在旅行足迹中点亮，公开的景点手记还在慢慢补充。可以先看看城市足迹，或浏览其他手记。';
    }
    actions.append(link('查看城市足迹',`./index.html?city=${encodeURIComponent(selected.name)}`,'journal-empty-link'));
   }
   if(Object.entries(f).some(([k,v])=>v&&!(k==='sort'&&v==='visit')))actions.append(btn('浏览全部手记',()=>resetFilters()));
   empty.append(node('span','','ui-icon icon-list'),node('h3',title),node('p',description),actions);
   empty.querySelector('.ui-icon').setAttribute('aria-hidden','true');
  }
  async function loadCities(){
   if(cityRetry.disabled)return;
   const restoreFocus=document.activeElement===cityRetry;
   cityState='loading';citySelect.disabled=true;cityRetry.disabled=true;cityRetry.hidden=true;
   cityHelp.textContent='正在读取已到访城市…';cityHelp.classList.remove('journal-error');citySelect.setAttribute('aria-busy','true');
   try{
    cities=await S.visitedCities();cityState='ready';regionOptions();cityOptions();citySelect.disabled=false;
    cityHelp.textContent=`共 ${cities.length} 座已到访城市，含暂无手记的城市。城市与国家 / 地区可切换筛选，其他条件可叠加；城市仅按手记的“关联城市”匹配。`;
   }catch{
    cityState='error';cityHelp.textContent='已到访城市暂时无法读取，请重试。其他手记筛选仍可使用。';cityHelp.classList.add('journal-error');cityRetry.hidden=false;
   }finally{cityRetry.disabled=false;citySelect.removeAttribute('aria-busy');}
   if(restoreFocus&&cityState==='ready')citySelect.focus({preventScroll:true});
   // Catalogue metadata alone must not re-download the unfiltered photo list.
   if(citySelect.value)await render();
  }
  async function render(){const version=++token,f=Object.fromEntries(new FormData(form));f.city=citySelect.value;if(!mine){delete f.status;delete f.visibility;}
   const pending=cityState==='loading'&&f.city,unavailable=cityState==='ready'&&f.city&&!cities.some(c=>c.name===f.city),items=pending||unavailable?[]:E.filter(all,f);
   const u=new URL('./journals.html',location.href);if(mine)u.searchParams.set('view','mine');for(const [k,v]of Object.entries(f))if(v&&!(k==='sort'&&v==='visit'))u.searchParams.set(k,v);history.replaceState(null,'',u);
   grid.replaceChildren();$('#journal-count').textContent=pending?'正在读取城市手记…':`${items.length} 篇${mine?'':'公开'}手记 · ${new Set(items.map(j=>j.place.id)).size} 个地点`;status(pending?'正在核对所选城市…':'');
   empty.hidden=true;if(!items.length)showEmpty(f);
   // Fetch only media referenced by this authorized result set; no global private index.
   const media=await S.media([...new Set(items.flatMap(j=>(j.content.photos||[]).map(p=>p.id)))]);if(version!==token)return;
   for(const j of items){const card=node('article','','journal-card'),href=new URL('./journal.html',location.href);href.searchParams.set('id',j.id);href.searchParams.set('return',location.pathname+location.search);const c=j.content,coverId=c.cover_id||c.photos?.[0]?.id,coverLink=link('',href);coverLink.setAttribute('aria-label',`翻开${E.title(c,j.place)}`);coverLink.append(await cover(media.find(m=>m.id===coverId)));if(version!==token)return;const title=node('h3');title.append(link(E.title(c,j.place),href));card.append(coverLink,node('p',[j.place.name,j.place.country,j.place.location].filter(Boolean).join(' · ')),title,meta(j),node('p',c.body||'暂无感受文字','journal-excerpt'));
    if(mine)card.append(node('p',`${E.statuses[j.status]} · ${j.visibility==='public'?'公开':'仅自己'}${j.draft&&j.version?' · 有私有修订草稿':''}`,'status-muted'));
    const bottom=node('div','','journal-card-bottom');bottom.append(tags(c),link('翻开这篇 →',href));card.append(bottom);card.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{try{sessionStorage.setItem(`journal-scroll:${location.pathname+location.search}`,String(window.scrollY));}catch{}}));grid.append(card);
   }
  }
  form.addEventListener('submit',e=>e.preventDefault());
  form.addEventListener('input',event=>{
   // A city reference is optional and country text is free-form in old journals.
   // Switch geographic scopes instead of hiding linked journals behind stale text.
   if(event.target===citySelect)form.elements.region.value='';
   if(event.target===form.elements.region)citySelect.value='';
   void render().catch(failure);
  });
  form.addEventListener('reset',()=>{if(!resetting)setTimeout(()=>void render().catch(failure),0);});cityRetry.onclick=()=>void loadCities().catch(failure);
  await Promise.all([render(),loadCities()]);
  try{const y=Number(sessionStorage.getItem(`journal-scroll:${location.pathname+location.search}`));if(y)window.scrollTo({top:y,behavior:'instant'});}catch{}
 }
 async function detail(){const id=params.get('id');if(!id||!/^[0-9a-f-]{36}$/i.test(id)){status('这篇手记暂时不可用。');return;}const j=await S.detail(id);if(!j){status('这篇手记暂时不可用。');return;}
  $('#journal-back').href=returnURL();const article=$('#journal-article');article.hidden=false;status('');await readArticle(article,j);document.title=`${E.title(j.content,j.place)}｜景点手记`;
  if(S.owner){const a=$('#journal-edit-link');a.hidden=false;a.href=`./journal-edit.html?id=${encodeURIComponent(id)}`;const again=link('为这个地点再写一篇',`./journal-edit.html?place=${encodeURIComponent(j.place.id)}`);article.append(again);}
  const related=(await S.records(S.owner)).filter(other=>other.id!==j.id&&other.place.id===j.place.id);const section=node('section','','journal-related');section.append(node('h2','同一地点的其他手记'));if(!related.length)section.append(node('p','暂时没有其他可查看的到访手记。'));for(const other of related){const row=node('p');row.append(link(E.title(other.content,other.place),`./journal.html?id=${encodeURIComponent(other.id)}`));section.append(row);}article.append(section);
 }
 async function start(){navigation();$('#journal-retry').onclick=()=>location.reload();try{await S.init();document.querySelectorAll('.journal-owner').forEach(n=>n.hidden=!S.owner);const mode=$('#journal-main').dataset.page;if(mode==='list')await list();if(mode==='detail')await detail();if(mode==='edit')await window.initializeJournalEditor({E,S,node,link,btn,modal,status,failure,readArticle});}catch(e){failure(e);}}
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
 void start();
})();
