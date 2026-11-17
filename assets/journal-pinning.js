(function(){
 'use strict';
 window.createJournalPinning=function({E,S,node,link,btn,mine,onChange,refresh}){
  const P=window.JOURNAL_PINNING_ENGINE,pending=new Map();
  const toast=node('aside','','journal-pin-feedback');toast.hidden=true;toast.tabIndex=-1;toast.setAttribute('aria-label','手记操作反馈');document.body.append(toast);
  const dialog=node('dialog','','journal-pin-dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','journal-pin-menu-title');document.body.append(dialog);
  let active=null,menuVersion=0,feedbackVersion=0,timer,remaining=8000,since=0,toastAction=0,locked=null,outsideDown=false;
  const visible=n=>{if(!n?.isConnected)return false;const r=n.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;};
  function pause(){if(timer){clearTimeout(timer);timer=null;remaining=Math.max(0,remaining-(performance.now()-since));}}
  function resume(){if(!timer&&!toast.hidden&&!toast.matches(':hover')&&!toast.contains(document.activeElement)&&toastAction){since=performance.now();timer=setTimeout(dismiss,remaining);}}
  function dismiss(){pause();const focused=toast.contains(document.activeElement);toast.hidden=true;toastAction=0;if(focused){const heading=document.querySelector('#journal-list-title');heading.tabIndex=-1;heading.focus({preventScroll:true});}}
  toast.addEventListener('mouseenter',pause);toast.addEventListener('mouseleave',resume);toast.addEventListener('focusin',pause);toast.addEventListener('focusout',()=>setTimeout(resume,0));
  function feedback(text,actions=[],auto=false){
   pause();toastAction=auto?++feedbackVersion:0;remaining=8000;toast.replaceChildren();toast.hidden=false;
   const message=node('p',text);message.setAttribute('role','status');toast.append(message);
   const controls=node('div','','journal-pin-feedback-actions');for(const [label,fn]of actions)controls.append(btn(label,fn));
   const dismissButton=btn('',dismiss);dismissButton.setAttribute('aria-label','关闭操作反馈');dismissButton.append(icon('close'));controls.append(dismissButton);toast.append(controls);if(auto)resume();
  }
  function icon(name){const n=node('span','',`ui-icon icon-${name}`);n.setAttribute('aria-hidden','true');return n;}
  function errorText(error){
   if(['PGRST202','PGRST204','42703','42883'].includes(error?.code))return '置顶功能尚未配置，请先完成手记置顶数据库迁移。';
   if(error?.code==='42501'||error?.status===401||error?.status===403)return '当前会话无权管理置顶，请重新登录站主账号。';
   if(error?.code==='40001')return '记录状态已变化，请刷新后再操作。';
   return '置顶操作未成功，请重试。';
  }
  function release(){if(!locked)return;Object.assign(document.body.style,locked.style);document.documentElement.style.overflow=locked.overflow;window.scrollTo({top:locked.y,behavior:'instant'});locked=null;}
  function closeMenu(focus=true){++menuVersion;const trigger=active?.trigger;active=null;if(dialog.open)dialog.close();release();if(focus&&visible(trigger))trigger.focus({preventScroll:true});}
  function positionMenu(){
   if(!dialog.open||!active)return;
   dialog.style.removeProperty('top');dialog.style.removeProperty('left');
   if(matchMedia('(min-width:768px)').matches){const r=active.trigger.getBoundingClientRect(),d=dialog.getBoundingClientRect();dialog.style.left=`${Math.max(12,Math.min(innerWidth-d.width-12,r.right-d.width))}px`;dialog.style.top=`${Math.max(12,Math.min(innerHeight-d.height-12,r.bottom+8))}px`;}
  }
  function renderMenu(){
   if(!active)return;
   const {record,state,loading,error}=active,job=pending.get(record.id);dialog.replaceChildren();dialog.setAttribute('aria-busy',String(loading||Boolean(job)));
   const head=node('div','','journal-pin-menu-heading'),h=node('h2','手记操作');h.id='journal-pin-menu-title';const x=btn('',()=>closeMenu());x.setAttribute('aria-label','关闭手记操作');x.append(icon('close'));head.append(h,x);
   dialog.append(head,node('p',E.title(record.content,record.place),'journal-pin-menu-name'));
   if(error){const p=node('p',errorText(error),'journal-error');p.setAttribute('role','alert');dialog.append(p,btn('重新读取状态',()=>void readState()));}
   else{
    const isPinned=P.pinned(state||record),canPin=P.eligible(state||record);
    const action=btn(loading?'正在读取状态…':job?job.undo?'正在撤销…':job.target?'正在置顶…':'正在取消…':!canPin?'公开后可置顶':isPinned?'取消置顶':'置顶手记',()=>void operate(active.record,active.state,!isPinned),'journal-pin-action');
    action.prepend(icon('pin-up'));action.disabled=loading||Boolean(job)||!canPin;dialog.append(action);
    const explanation=node('p',!canPin?'仅已正式发布且公开的手记可置顶。':job?'请稍候，避免重复操作。':'仅调整公开列表顺序；取消后按当前排序重新排列。','journal-pin-menu-help');explanation.setAttribute('role','status');dialog.append(explanation);
   }
   const edit=link('编辑手记',`./journal-edit.html?id=${encodeURIComponent(record.id)}`,'journal-pin-edit');edit.prepend(icon('edit'));dialog.append(edit,btn('关闭',()=>closeMenu(),'journal-pin-menu-close'));positionMenu();
   if(dialog.open&&!dialog.contains(document.activeElement))dialog.querySelector('button').focus({preventScroll:true});
  }
  async function readState(){
   if(!active)return;const target=active,version=++menuVersion;target.loading=true;target.error=null;renderMenu();
   try{const state=await deadline(S.pinStatus(target.record.id),10000);if(active===target&&version===menuVersion)target.state=state;}
   catch(error){if(active===target&&version===menuVersion)target.error=error;}
   finally{if(active===target&&version===menuVersion){target.loading=false;renderMenu();}}
  }
  function openMenu(record,trigger){
   closeMenu(false);active={record,trigger,loading:true,state:null,error:null};
   const style=Object.fromEntries(['position','top','left','right','paddingRight'].map(k=>[k,document.body.style[k]]));
   locked={style,y:window.scrollY,overflow:document.documentElement.style.overflow};
   const gap=innerWidth-document.documentElement.clientWidth;
   Object.assign(document.body.style,{position:'fixed',top:`-${locked.y}px`,left:'0',right:'0',paddingRight:`${parseFloat(getComputedStyle(document.body).paddingRight)+gap}px`});document.documentElement.style.overflow='hidden';
   renderMenu();dialog.showModal();positionMenu();dialog.querySelector('button').focus({preventScroll:true});void readState();
  }
  function deadline(promise,ms){let t;return Promise.race([promise,new Promise((_,reject)=>{t=setTimeout(()=>reject(Object.assign(new Error('读取超时'),{uncertain:true})),ms);})]).finally(()=>clearTimeout(t));}
  const definite=error=>['40001','42501','22023','PGRST202','PGRST204','42703','42883'].includes(error?.code);
  async function sync(state,id){await onChange(state,id);}
  async function finish(job,state){
   if(pending.get(job.id)!==job)return;
   const sameMenu=active?.record.id===job.id,shouldFocus=sameMenu||document.activeElement===job.trigger||document.activeElement===document.body;
   if(sameMenu)closeMenu(false);pending.delete(job.id);await sync(state,job.id);
   if(job.order!==feedbackVersion)return;
   const changed=state.operation_id===job.operation;
   const actions=changed&&!job.undo&&state.undo_token?[['撤销',()=>void operate(job.record,state,null,{revision:state.presentation_revision,token:state.undo_token})]]:[];
   feedback(job.undo?'已撤销本次置顶操作。':P.pinned(state)?'已置顶，将优先展示在公开列表。':'已取消置顶，已恢复当前排序。',actions,true);
   const trigger=document.querySelector(`[data-pin-trigger="${job.id}"]`);if(shouldFocus&&!active){if(visible(trigger))trigger.focus({preventScroll:true});else toast.focus({preventScroll:true});}
  }
  async function conflict(job,state){
   if(pending.get(job.id)!==job)return;pending.delete(job.id);if(state)await sync(state,job.id);
   await refresh();if(job.order===feedbackVersion)feedback('记录状态已变化，请刷新后再操作。',[['刷新列表',()=>void refresh()]]);
   if(active?.record.id===job.id){closeMenu(false);toast.focus({preventScroll:true});}
  }
  async function confirm(job){
   if(pending.get(job.id)!==job||job.checking)return;job.checking=true;
   if(job.order===feedbackVersion)feedback('结果暂未确认，正在重新读取…');
   try{
    const state=await deadline(S.pinStatus(job.id),10000);
    if(state.operation_id===job.operation)await finish(job,state);
    else if(!P.eligible(state)||state.presentation_revision!==job.before.presentation_revision)await conflict(job,state);
    else if(job.order===feedbackVersion)feedback('结果暂未确认，可重新核对或安全重试原操作。',[['重新核对',()=>void confirm(job)],['重试原操作',()=>void submit(job)]]);
   }catch(error){if(error.code==='40001')await conflict(job,null);else if(definite(error)){pending.delete(job.id);if(job.order===feedbackVersion)feedback(errorText(error));if(active?.record.id===job.id){active.error=error;renderMenu();}}else if(job.order===feedbackVersion)feedback('结果暂未确认，请检查网络后重新核对。',[['重新核对',()=>void confirm(job)]]);}
   finally{job.checking=false;}
  }
  async function operate(record,before,target,undo=null){
   if(pending.has(record.id)){void confirm(pending.get(record.id));return;}
   const job={record,id:record.id,before,undo,target,trigger:active?.trigger,operation:crypto.randomUUID(),order:++feedbackVersion,checking:false};pending.set(job.id,job);dismiss();renderMenu();
   feedback(undo?'正在撤销…':target?'正在置顶…':'正在取消…');await submit(job);
  }
  async function submit(job){
   if(pending.get(job.id)!==job||job.sending)return;job.sending=true;
   const {record,before,undo,target}=job;
   const promise=undo?S.restorePin(job.id,undo.revision,undo.token,job.operation):S.setPin(job.id,target,before.presentation_revision,job.operation);
   let timedOut=false;
   // A late server response still resolves the operation; a timeout is not failure.
   promise.then(state=>{if(timedOut)void finish(job,state);},error=>{if(timedOut&&pending.get(job.id)===job){if(definite(error)){pending.delete(job.id);if(job.order===feedbackVersion)feedback(errorText(error));if(error.code==='40001')void refresh();if(active?.record.id===job.id){active.error=error;renderMenu();}}else void confirm(job);}});
   try{await finish(job,await deadline(promise,12000));}
   catch(error){
    if(pending.get(job.id)!==job)return;
    if(definite(error)){
     pending.delete(job.id);if(error.code==='40001'){await refresh();if(job.order===feedbackVersion)feedback(errorText(error),[['刷新列表',()=>void refresh()]]);}
     else if(job.order===feedbackVersion)feedback(errorText(error),[['重试',()=>void retryOperation(record,target,undo,before)]]);
     if(active?.record.id===job.id){active.error=error;renderMenu();}
    }else{timedOut=true;await confirm(job);}
   }finally{job.sending=false;}
  }
  async function retryOperation(record,target,undo,before){
   try{const latest=await deadline(S.pinStatus(record.id),10000);if(undo&&latest.presentation_revision!==before.presentation_revision){feedback('记录状态已变化，请刷新后再操作。');await refresh();return;}await operate(record,latest,target,undo);}
   catch(error){feedback(errorText(error),[['重试',()=>void retryOperation(record,target,undo,before)]]);}
  }
  function decorate(card,record){
   let top=card.querySelector('.journal-card-media');if(!top){top=node('div','','journal-card-media');const cover=card.firstElementChild;cover.replaceWith(top);top.append(cover);}
   let badge=top.querySelector('.journal-pin-badge');if(!badge){badge=node('span','','journal-pin-badge');badge.append(icon('pin-up'),node('span',mine?'公开置顶':'置顶'));top.append(badge);}badge.hidden=!P.pinned(record);
   if(S.owner){let more=top.querySelector('.journal-pin-more');if(!more){more=btn('',()=>{} ,'journal-pin-more');more.append(icon('more'));more.dataset.pinTrigger=record.id;more.setAttribute('aria-haspopup','dialog');top.append(more);}more.setAttribute('aria-label',`更多操作：${E.title(record.content,record.place)}`);more.onclick=()=>openMenu(record,more);}
  }
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeMenu();});
  const outside=e=>{const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
  dialog.addEventListener('pointerdown',e=>{outsideDown=outside(e);});dialog.addEventListener('pointerup',e=>{if(outsideDown&&outside(e))closeMenu();outsideDown=false;});window.addEventListener('resize',positionMenu);
  return {decorate};
 };
})();
