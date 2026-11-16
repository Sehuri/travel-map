(function(){
 'use strict';
 window.createJournalUpdates=function({E,node,link,btn,retry,clearFilters}){
  const U=window.JOURNAL_UPDATES_ENGINE,trigger=document.querySelector('#journal-updates-open');
  const dialog=document.querySelector('#journal-updates'),content=document.querySelector('#journal-updates-content');
  const close=document.querySelector('#journal-updates-close'),range=document.querySelector('#journal-updates-range');
  const rangeToggle=document.querySelector('#journal-updates-range-toggle'),count=document.querySelector('#journal-updates-count');
  const marker=crypto.randomUUID();
  let snapshot={phase:'loading',records:[],filters:Object.fromEntries(new URLSearchParams(location.search)),cityState:'loading'};
  let locked=null,dayTimer,requested=false,lastKey='',pendingPosition=null,lastId=null,retrying=false,actionToken=0,restoreAfterRender=null;
  let outsideDown=false,lastDay='',expanded=false,listReady=false;
  trigger.hidden=false;
  const marked=()=>new URL(location.href).searchParams.get('updates')==='1';
  const listURL=()=>{const u=new URL(location.href);u.searchParams.delete('updates');return u;};
  const storageKey=()=>{const u=new URL('./journals.html',location.href);for(const k of ['q','region','city','year','kind','sort']){const v=snapshot.filters[k];if(v&&!(k==='sort'&&v==='visit'))u.searchParams.set(k,v);}return `journal-updates:${u.pathname}${u.search}`;};
  const key=()=>JSON.stringify(['q','region','city','year','kind','sort'].map(k=>snapshot.filters[k]||(k==='sort'?'visit':'')));
  function stored(){try{const p=JSON.parse(sessionStorage.getItem(storageKey()));return p&&Number.isFinite(p.top)&&p.top>=0&&Number.isFinite(p.y)&&p.y>=0?p:null;}catch{return null;}}
  function remember(){
   if(!dialog.open)return;
   const value=pendingPosition||{top:content.scrollTop,y:locked?.y??window.scrollY,id:lastId};
   try{sessionStorage.setItem(storageKey(),JSON.stringify(value));}catch{}
  }
  function lock(y){
   if(locked)return;
   const names=['position','top','left','right','paddingRight'],styles=Object.fromEntries(names.map(k=>[k,document.body.style[k]]));
   locked={y,styles,overflow:document.documentElement.style.overflow};
   const gap=innerWidth-document.documentElement.clientWidth;
   Object.assign(document.body.style,{position:'fixed',top:`-${y}px`,left:'0',right:'0',paddingRight:`${parseFloat(getComputedStyle(document.body).paddingRight)+gap}px`});
   document.documentElement.style.overflow='hidden';
  }
  function unlock(){
   if(!locked)return;
   const saved=locked;locked=null;Object.assign(document.body.style,saved.styles);document.documentElement.style.overflow=saved.overflow;
   window.scrollTo({top:saved.y,behavior:'instant'});restoreAfterRender=listReady?null:saved.y;
  }
  function position(){
   const rows=[...content.querySelectorAll('[data-update-id]')],top=content.getBoundingClientRect().top;
   const anchor=rows.find(row=>row.getBoundingClientRect().bottom>top);
   return {top:content.scrollTop,id:anchor?.dataset.updateId,offset:anchor?anchor.getBoundingClientRect().top-top:0};
  }
  function restore(p,focus=false){
   if(!p)return;
   const row=[...content.querySelectorAll('[data-update-id]')].find(row=>row.dataset.updateId===p.id);
   if(row&&focus)row.focus({preventScroll:true});
   if(row&&Number.isFinite(p.offset))content.scrollTop+=row.getBoundingClientRect().top-content.getBoundingClientRect().top-p.offset;
   else content.scrollTop=Math.min(p.top,Math.max(0,content.scrollHeight-content.clientHeight));
  }
  function fitRange(){
   if(!dialog.open)return;
   rangeToggle.hidden=!expanded&&range.scrollHeight<=range.clientHeight+1;
  }
  function scheduleDay(){
   clearTimeout(dayTimer);if(!dialog.open)return;
   const [year,month,date]=U.dayKey().split('-').map(Number),next=Date.UTC(year,month-1,date+1)-8*3600000;
   dayTimer=setTimeout(()=>{render();scheduleDay();},Math.max(1000,next-Date.now()+50));
  }
  function notice(title,text,action,label){
   const wrap=node('div','','journal-updates-notice');
   wrap.setAttribute('role',label==='重试读取'?'alert':'status');
   wrap.append(node('span','','ui-icon icon-list'),node('h3',title),node('p',text));wrap.firstChild.setAttribute('aria-hidden','true');
   if(action){const b=btn(label,action,'journal-primary');b.disabled=retrying;wrap.append(b);}
   content.append(wrap);
  }
  async function retryCurrent(){
   if(retrying)return;
   retrying=true;const token=++actionToken;render();close.focus({preventScroll:true});
   try{await retry(snapshot.phase!=='error'&&snapshot.filters.city&&snapshot.cityState==='error'?'city':'records');}
   catch{if(token===actionToken)snapshot={...snapshot,phase:'error'};}
   finally{if(token===actionToken){retrying=false;render();}}
  }
  function render(){
   if(!dialog.open)return;
   const before=position(),nextKey=key(),changed=nextKey!==lastKey;
   if(changed){pendingPosition=null;lastId=null;expanded=false;}lastKey=nextKey;
   range.textContent=`当前范围：${U.range(snapshot.filters,E.kinds)}`;range.classList.toggle('is-expanded',expanded);
   rangeToggle.textContent=expanded?'收起当前范围':'展开当前范围';rangeToggle.setAttribute('aria-expanded',String(expanded));
   content.replaceChildren();count.textContent='';content.setAttribute('aria-busy','false');
   const cityPending=snapshot.filters.city&&snapshot.cityState==='loading';
   if(retrying||snapshot.phase==='loading'||cityPending){
    content.setAttribute('aria-busy','true');notice(cityPending?'正在核对所选城市':retrying?'正在重试…':'正在读取手记更新','筛选范围已保留，请稍候。');
   }else if(snapshot.phase==='error'||snapshot.filters.city&&snapshot.cityState==='error'){
    notice('手记更新暂时无法读取',snapshot.filters.city&&snapshot.cityState==='error'?'所选城市范围暂时无法核对，请重试加载城市。':'筛选条件已保留，请稍后重试。',()=>void retryCurrent(),'重试读取');
   }else{
    const records=snapshot.cityUnavailable?[]:E.filter(snapshot.records,{...snapshot.filters,sort:'updated',status:'',visibility:''}),groups=U.groups(records);
    const total=groups.reduce((n,g)=>n+g.items.length,0);count.textContent=`${total} 篇手记`;lastDay=U.dayKey();
    if(!total){
     const filtered=Boolean(snapshot.filters.q?.trim()||['region','city','year','kind'].some(k=>snapshot.filters[k]));
     notice(filtered?'当前筛选下暂无手记更新':'还没有公开的手记更新',filtered?'可以清除筛选，看看其他公开手记。':'之后公开发布的手记会显示在这里。',filtered?()=>{pendingPosition=null;lastId=null;clearFilters();close.focus({preventScroll:true});}:()=>requestClose(),filtered?'清除筛选，查看全部':'关闭面板，返回浏览');
    }
    for(const group of groups){
     const section=node('section','','journal-update-group'),heading=node('h3',group.label);section.append(heading);
     for(const item of group.items){
      const j=item.record,url=new URL('./journal.html',location.href);url.searchParams.set('id',j.id);url.searchParams.set('context','public');url.searchParams.set('return',location.pathname+location.search);
      const row=link('',url,'journal-update-row');row.dataset.updateId=j.id;
      const time=node(item.when?'time':'span',item.when?`公开更新于 ${item.when.time}`:'更新时间待补充','journal-update-time');
      if(item.when){time.dateTime=j.updated_at;time.title=item.when.full;time.setAttribute('aria-label',`公开更新于 ${item.when.full}`);}
      const body=node('span','','journal-update-body'),place=node('span','','journal-update-place'),title=node('span',E.title(j.content,j.place),'journal-update-title');
      const description=[...new Set([j.place.name,j.place.city_name,j.place.country,j.place.location].map(s=>s?.trim()).filter(Boolean))].join(' · ')||'位置待补充';
      place.append(node('span','','ui-icon icon-pin'),node('span',description));place.title=description;
      place.firstChild.setAttribute('aria-hidden','true');const arrow=node('span','','ui-icon icon-arrow');arrow.setAttribute('aria-hidden','true');
      body.append(title,place);row.append(time,body,arrow);row.addEventListener('click',()=>{lastId=j.id;remember();});section.append(row);
     }
     content.append(section);
    }
    if(pendingPosition){restore(pendingPosition,true);pendingPosition=null;}else if(!changed)restore(before);else content.scrollTop=0;
   }
   requestAnimationFrame(fitRange);
  }
  function open(push=false){
   if(dialog.open)return;
   if(push){const url=new URL(location.href);url.searchParams.set('updates','1');history.pushState({...history.state,journalUpdatesEntry:marker},'',url);}
   requested=true;pendingPosition=stored();lastKey=key();lastId=pendingPosition?.id||null;
   const y=pendingPosition?.y??window.scrollY;lock(y);dialog.showModal();trigger.setAttribute('aria-expanded','true');close.focus({preventScroll:true});render();scheduleDay();
  }
  function hide(){
   remember();requested=false;++actionToken;retrying=false;clearTimeout(dayTimer);
   if(dialog.open)dialog.close();trigger.setAttribute('aria-expanded','false');unlock();trigger.focus({preventScroll:true});
  }
  function requestClose(){
   if(history.state?.journalUpdatesEntry===marker){hide();history.back();}
   else{const url=listURL(),state={...history.state};delete state.journalUpdatesEntry;history.replaceState(state,'',url);hide();}
  }
  trigger.addEventListener('click',()=>open(true));close.addEventListener('click',requestClose);
  dialog.addEventListener('cancel',event=>{event.preventDefault();requestClose();});
  const outside=e=>{const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
  dialog.addEventListener('pointerdown',e=>{outsideDown=outside(e);});dialog.addEventListener('pointerup',e=>{if(outsideDown&&outside(e))requestClose();outsideDown=false;});
  rangeToggle.addEventListener('click',()=>{expanded=!expanded;range.classList.toggle('is-expanded',expanded);rangeToggle.textContent=expanded?'收起当前范围':'展开当前范围';rangeToggle.setAttribute('aria-expanded',String(expanded));fitRange();});
  window.addEventListener('resize',fitRange);
  for(const event of ['wheel','touchstart'])window.addEventListener(event,()=>{if(!dialog.open)restoreAfterRender=null;},{passive:true});
  window.addEventListener('pagehide',()=>{remember();clearTimeout(dayTimer);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&dialog.open){if(lastDay!==U.dayKey())render();scheduleDay();}});
  window.addEventListener('popstate',()=>{
   const shouldOpen=marked();
   if(!shouldOpen&&dialog.open)hide();
   requested=shouldOpen;
   window.dispatchEvent(new Event('journal-updates-history'));
   if(shouldOpen&&!dialog.open)open();
  });
  if(marked())open();
  return {
   setSnapshot(value){snapshot={...snapshot,...value};render();},
   isOpen:()=>requested||dialog.open,
   listRendered(){listReady=true;if(!dialog.open&&restoreAfterRender!==null){window.scrollTo({top:restoreAfterRender,behavior:'instant'});restoreAfterRender=null;}}
  };
 };
})();
