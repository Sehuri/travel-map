window.initializeJournalEditor=async function({E,S,node,link,btn,modal,status,failure,readArticle}){
 const form=document.querySelector('#journal-editor-form'),params=new URLSearchParams(location.search);
 if(!S.owner){const login=document.querySelector('#journal-login');login.hidden=false;status('编辑仅向站主开放。');login.onsubmit=async e=>{e.preventDefault();const b=login.querySelector('button');b.disabled=true;try{await S.login(login.elements.email.value.trim());document.querySelector('#login-status').textContent='登录链接已发送，请从邮箱打开后继续。';}catch(error){document.querySelector('#login-status').textContent=`发送失败：${error.message}`;}finally{b.disabled=false;}};return;}
 const back=document.querySelector('#journal-editor-back');back.href='./journals.html?view=mine';back.textContent='← 返回我的记录';
 let j={id:crypto.randomUUID(),revision:0,status:'draft',visibility:'private',place:{id:crypto.randomUUID(),name:'',country:'',location:'',kind:'other',longitude:null,latitude:null,city_name:null,attraction_id:null},content:{title:'',visit_date:null,rating:null,body:'',tags:[],photos:[],cover_id:null,revisit:null,journey_slug:null}};
 const id=params.get('id');if(id){const found=await S.detail(id,true);if(!found){status('这篇手记暂时不可用。');return;}j=found;document.querySelector('#editor-title').textContent='编辑景点手记';}
 const [available,choices]=await Promise.all([S.places(),S.choices()]);
 let creating=!id||j.placeEditable,dirty=false,busy=false,leaving=false,queue=[],queueRender=0;
 if(!id&&params.get('place')){const p=available.find(p=>p.id===params.get('place'));if(p){j.place=p;creating=false;}}
 if(!id&&params.get('journey')&&choices.journeys.some(t=>t.slug===params.get('journey')))j.content.journey_slug=params.get('journey');
 const layout=node('div','','journal-editor-layout'),fields=node('div','','journal-editor-fields'),aside=node('aside','','journal-publish');layout.append(fields,aside);form.append(layout);
 function section(title,description){const s=node('section');s.append(node('h2',title));if(description)s.append(node('p',description));fields.append(s);return s;}
 function field(parent,name,label,type='text',values=null,wide=false){const l=node('label',label,wide?'wide':'');let input;if(values){input=node('select');values.forEach(([value,text])=>input.add(new Option(text,value)));}else input=node(type==='textarea'?'textarea':'input');input.name=name;if(!values&&type!=='textarea')input.type=type;if(type==='textarea'){input.rows=8;input.maxLength=50000;}l.append(input);parent.append(l);return input;}
 const placeSection=section('地点信息','一个地点可以写多篇到访手记。城市关联可以留空，手记不会改变足迹统计。');
 const searchPlace=field(placeSection,'place_search','搜索已有地点或地区','search');searchPlace.placeholder='输入地点名、国家或位置';
 const picker=field(placeSection,'place_picker','选择已有地点或新建','select',[['new','新建地点'],...available.map(p=>[p.id,`${p.name} · ${p.country} · ${p.location}`])]);
 const placeHelp=node('p'),copyPlace=btn('复制地点资料并修改（不影响其他手记）',()=>{creating=true;j.place={...j.place,id:crypto.randomUUID()};picker.value='new';setPlace();change();});placeSection.append(placeHelp,copyPlace);
 const placeGrid=node('div','','journal-field-grid');placeSection.append(placeGrid);
 const placeInputs={};
 for(const [name,label,type,options,wide]of [
  ['name','地点名','text',null,true],['country','国家/地区'],['location','所在位置'],['kind','类型','select',Object.entries(E.kinds)],['city_name','关联城市（可选）','select',[['','不关联城市'],...choices.cities.map(c=>[c,c])]],['longitude','经度（可选）','number'],['latitude','纬度（可选）','number'],['attraction_id','旧景点目录 ID（可选）','text',null,true]
 ]){placeInputs[name]=field(placeGrid,name,label,type||'text',options,wide);if(type==='number')placeInputs[name].step='any';}
 const extra=node('details','','wide'),extraGrid=node('div','','journal-field-grid');extra.append(node('summary','更多地点信息（可选）'),extraGrid);for(const k of ['longitude','latitude','attraction_id'])extraGrid.append(placeInputs[k].parentElement);placeGrid.append(extra);
 placeInputs.name.maxLength=160;placeInputs.name.required=true;placeInputs.location.maxLength=240;placeInputs.country.maxLength=120;
 const visit=section('这一次到访'),visitGrid=node('div','','journal-field-grid');visit.append(visitGrid);
 field(visitGrid,'title','手记标题','text',null,true).maxLength=240;
 field(visitGrid,'visit_date','到访日期（可选）','date');
 field(visitGrid,'rating','我的评分（可选）','select',[['','暂不评分'],...Array.from({length:10},(_,i)=>[String(i+1),`${i+1} / 10`])]);
 field(visitGrid,'body','我的感受','textarea',null,true);
 field(visitGrid,'tags','标签（逗号分隔，最多 20 个）','text',null,true).maxLength=820;
 field(visitGrid,'revisit','再访意愿（可选）','select',[['','暂不填写'],['yes','还想再去一次'],['maybe','也许会再访'],['no','暂时不再访']]);
 field(visitGrid,'journey_slug','关联旅程（可选）','select',[['','不关联旅程'],...choices.journeys.map(t=>[t.slug,`${t.title}${t.is_published===false?'（未公开）':''}`])]);
 const photos=section('照片','新上传照片使用私有存储，转换为不含 EXIF/GPS 的 WebP，最大宽度 1600px；动画格式使用静态画面。');
 const fileInput=field(photos,'files','选择照片','file');fileInput.id='journal-files';fileInput.multiple=true;fileInput.accept='image/jpeg,image/png,image/webp,image/gif,image/avif';
 photos.append(node('p','JPEG / PNG / WebP / GIF / AVIF，每张最多 15 MB；HEIC / HEIF 请先导出 JPEG。'));
 const photoActions=node('div','','journal-photo-actions'),uploadAll=btn('保存草稿并上传所选照片',()=>operation(uploadPending)),album=btn('从现有公开相册选择',()=>operation(chooseAlbum));uploadAll.id='upload-journal-files';album.id='choose-album';photoActions.append(uploadAll,album);photos.append(photoActions);
 const uploadStatus=node('p');uploadStatus.id='journal-upload-status';uploadStatus.setAttribute('role','status');const queueArea=node('div','','journal-photo-queue');queueArea.id='journal-photo-queue';photos.append(uploadStatus,queueArea);
 aside.append(node('h2','发布设置'));const stateLabel=node('p');stateLabel.id='journal-edit-state';aside.append(stateLabel);
 const visibility=field(aside,'visibility','谁可以看到','select',[['private','仅自己'],['public','公开']]);
 const visibilityNote=node('p');aside.append(visibilityNote,node('p','引用现有公开相册的原图仍公开可访问，本篇设为私密不会改变原相册权限。'));
 const actions=node('div','','journal-editor-buttons');
 const save=btn('保存草稿',()=>operation(()=>saveDraft())),preview=btn('预览',()=>operation(previewDraft)),publish=btn('发布手记',()=>operation(confirmPublish),'journal-primary');save.id='save-journal';preview.id='preview-journal';publish.id='publish-journal';
 const withdraw=btn('撤下公开，设为仅自己',()=>operation(()=>transition('withdraw'))),archive=btn('归档手记',()=>operation(()=>transition('archive'))),restore=btn('恢复为草稿',()=>operation(()=>transition('restore')));withdraw.id='withdraw-journal';archive.id='archive-journal';restore.id='restore-journal';actions.append(save,preview,publish,withdraw,archive,restore);aside.append(actions);
 function change(){dirty=true;status('有未保存更改');}
 function labels(){stateLabel.textContent=`${E.statuses[j.status]} · ${j.published_version_id?'已保存版本仍保留':'尚未发布'}${j.draft&&j.version?' · 有私有修订草稿':''}`;publish.textContent=j.published_version_id?'更新发布':'发布手记';publish.disabled=busy||j.status==='archived';withdraw.hidden=!(j.status==='published'&&(j.publishedVisibility||j.visibility)==='public');archive.hidden=j.revision===0||j.status==='archived';restore.hidden=j.status!=='archived';visibilityNote.textContent=visibility.value==='public'?'发布后将公开本篇正文、个人评分及所选照片。保存草稿仍不公开。':'发布后作为仅自己可查看的完成记录。保存草稿仍不会发布。';}
 function setPlace(){for(const [k,input]of Object.entries(placeInputs)){input.value=j.place[k]??'';input.disabled=!creating||busy;}picker.value=creating?'new':j.place.id;copyPlace.hidden=creating&&j.revision===0;placeHelp.textContent=creating?'正在填写本篇地点资料；尚未被其他手记或发布版本引用前，可继续补充地点资料并保留同一 ID。':'现有地点档案只读；本篇编辑不会覆盖其他到访。需要调整时可复制为新档案。';}
 picker.onchange=()=>{creating=picker.value==='new';j.place=creating?{id:crypto.randomUUID(),name:'',country:'',location:'',kind:'other',longitude:null,latitude:null,city_name:null,attraction_id:null}:available.find(p=>p.id===picker.value);setPlace();change();};
 searchPlace.oninput=()=>{const selected=picker.value,q=searchPlace.value.trim().toLocaleLowerCase();picker.replaceChildren(new Option('新建地点','new'));available.filter(p=>p.id===selected||[p.name,p.country,p.location].join(' ').toLocaleLowerCase().includes(q)).forEach(p=>picker.add(new Option(`${p.name} · ${p.country} · ${p.location}`,p.id)));picker.value=selected;};
 setPlace();for(const key of ['title','visit_date','rating','body','revisit','journey_slug'])form.elements[key].value=j.content[key]??'';form.elements.tags.value=(j.content.tags||[]).join('，');visibility.value=j.visibility;labels();
 const initialMedia=await S.media((j.content.photos||[]).map(p=>p.id));queue=(j.content.photos||[]).map(p=>({id:p.id,media:initialMedia.find(m=>m.id===p.id),caption:p.caption||'',state:'ready'}));
 function collect(){
  if(creating){const p={...j.place};for(const [key,input]of Object.entries(placeInputs))p[key]=['longitude','latitude'].includes(key)?(input.value===''?null:Number(input.value)):input.value.trim()||(['city_name','attraction_id'].includes(key)?null:'');
   j.place=p;
  }
  j.visibility=visibility.value;j.content={title:form.elements.title.value.trim(),visit_date:form.elements.visit_date.value||null,rating:form.elements.rating.value===''?null:Number(form.elements.rating.value),body:form.elements.body.value,tags:form.elements.tags.value.split(/[,，]/).map(t=>t.trim()).filter(Boolean),revisit:form.elements.revisit.value||null,journey_slug:form.elements.journey_slug.value||null,photos:queue.filter(q=>q.state==='ready').map(q=>({id:q.id,caption:q.caption})),cover_id:j.content.cover_id};
  if(!j.content.photos.some(p=>p.id===j.content.cover_id))j.content.cover_id=j.content.photos[0]?.id||null;
  return j;
 }
 async function saveDraft(){collect();const error=E.validate(j.place,j.content);if(error)throw new Error(error);status('正在保存私有草稿…');const result=await S.save(j);j={...j,...result,publishedVisibility:result.visibility,visibility:visibility.value};dirty=false;history.replaceState(null,'',`./journal-edit.html?id=${encodeURIComponent(j.id)}`);labels();status(`草稿已保存 · ${new Date().toLocaleTimeString('zh-CN')}。${j.published_version_id?'已发布版本保持原样。':''}`);return result;}
 function setBusy(v){busy=v;form.setAttribute('aria-busy',String(v));form.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=v||queueArea.contains(n));if(!v){setPlace();labels();void renderQueue();}}
 async function operation(fn){if(busy)return;setBusy(true);try{await fn();}catch(error){failure(error);document.querySelector('#journal-retry').hidden=true;}finally{setBusy(false);}}
 async function renderQueue(){const version=++queueRender;queueArea.replaceChildren();for(const [i,q]of queue.entries()){
   const item=node('div','','journal-photo-item');const img=node('img');img.alt=q.file?.name||'手记照片';try{img.src=q.localURL||q.previewURL||(q.previewURL=await S.mediaURL(q.media));}catch{img.alt='照片暂时无法预览';}if(version!==queueRender)return;item.append(img,node('p',q.state==='ready'?q.id===j.content.cover_id?'封面 · 已上传':'已上传':q.error||'待上传'));
   const caption=field(item,`caption_${i}`,'照片说明');caption.value=q.caption||'';caption.maxLength=500;caption.oninput=()=>{q.caption=caption.value;change();};
   const controls=node('div','','journal-photo-actions');const move=delta=>{[queue[i],queue[i+delta]]=[queue[i+delta],queue[i]];change();void renderQueue();};const prev=btn('前移',()=>move(-1)),next=btn('后移',()=>move(1));prev.disabled=busy||i===0;next.disabled=busy||i===queue.length-1;controls.append(prev,next);
   if(q.state==='ready')controls.append(btn('设为封面',()=>{j.content.cover_id=q.id;change();void renderQueue();}));
   else controls.append(btn(q.error?'重试这张':'上传这张',()=>operation(async()=>{await saveDraft();await uploadOne(q);await saveDraft();await renderQueue();uploadStatus.textContent=q.state==='ready'?'照片已上传并保存到私有草稿。':q.error;})));
   controls.append(btn('移除引用',()=>{queue.splice(i,1);if(q.localURL)URL.revokeObjectURL(q.localURL);change();collect();void renderQueue();}));if(busy){caption.disabled=true;controls.querySelectorAll('button').forEach(b=>b.disabled=true);}item.append(controls);queueArea.append(item);
  }}
 fileInput.onchange=()=>{const errors=[];for(const file of Array.from(fileInput.files||[])){const v=window.TRAVEL_PHOTO_UPLOAD.validate(file);if(v.error){errors.push(`${file.name}：${v.error}`);continue;}if(queue.length>=100){errors.push('每篇最多 100 张照片');break;}queue.push({file,localURL:URL.createObjectURL(file),caption:'',state:'pending'});}fileInput.value='';uploadStatus.textContent=errors.join('；');change();void renderQueue();};
 async function uploadOne(q){q.error='';try{uploadStatus.textContent=`正在转换并上传 ${q.file.name}…`;q.media=await S.upload(j.id,q.file);q.id=q.media.id;q.state='ready';}catch(e){q.error=`上传失败：${e.message}，可以单张重试`;q.state='error';}dirty=true;}
 async function uploadPending(){if(!queue.some(q=>q.state!=='ready')){uploadStatus.textContent='没有待上传照片';return;}await saveDraft();for(const q of queue.filter(q=>q.state!=='ready'))await uploadOne(q);await saveDraft();await renderQueue();uploadStatus.textContent=queue.some(q=>q.state==='error')?'部分照片失败，其他照片已保存；可单张重试或移除失败项。':'照片已上传并保存到私有草稿。';}
 async function chooseAlbum(){const d=modal('从现有公开相册选择');d.append(node('p','这些原图已经公开，引用到私密手记也不会改变原图的公开状态。每次选择会先保存本篇草稿。'));const search=node('input');search.type='search';search.placeholder='筛选城市';search.setAttribute('aria-label','筛选相册城市');d.append(search);const grid=node('div','','journal-album-grid');d.append(grid);d.showModal();let all;try{all=await S.album();}catch(error){d.append(node('p',`相册读取失败：${error.message}`,'journal-error'),btn('重试相册',()=>{d.close();void operation(chooseAlbum);}));return;}let chosen=false;
   function render(){grid.replaceChildren();all.filter(p=>p.city.includes(search.value)).forEach(p=>{const b=btn('',async()=>{if(chosen)return;chosen=true;b.disabled=true;try{if(queue.length>=100)throw new Error('每篇最多 100 张照片');await saveDraft();const m=await S.reference(j.id,p.url);queue.push({id:m.id,media:m,caption:'',state:'ready'});dirty=true;await saveDraft();await renderQueue();d.close();}catch(e){status(e.message,true);chosen=false;b.disabled=false;}});const img=node('img');window.TRAVEL_PHOTOS.setImage(img,p.url);img.alt=`${p.city} · 公开相册照片`;b.append(img,node('span',p.city));grid.append(b);});}search.oninput=render;render();}
 async function previewDraft(){collect();const d=modal('手记预览');const article=node('article');d.append(article);d.showModal();try{await readArticle(article,j,{preview:true});}catch(error){article.append(node('p',`预览读取失败：${error.message}。关闭后可重试，输入仍保留。`,'journal-error'));}for(const q of queue.filter(q=>q.state!=='ready')){const img=node('img');img.src=q.localURL;img.alt='未上传的本地照片';img.style.maxWidth='100%';article.append(img,node('p','本地照片尚未上传，不会随当前草稿公开。'));}}
 async function confirmPublish(){collect();if(queue.some(q=>q.state!=='ready'))throw new Error('有照片尚未上传成功，请先上传、重试或移除失败项');const error=E.validate(j.place,j.content,true);if(error)throw new Error(error);if(!j.content.title){j.content.title=E.title(j.content,j.place);form.elements.title.value=j.content.title;dirty=true;}
  const d=modal(j.published_version_id?'确认更新发布':'确认发布');d.append(node('p',`标题：${j.content.title}`),node('p',`位置：${j.place.location}`),node('p',`照片：${j.content.photos.length} 张`),node('p',j.visibility==='public'?'公开：正文、评分和所选照片将对访客开放。':'仅自己：保存为已完成的私人记录。'));
  const confirm=btn(j.published_version_id?'更新发布':'确认发布',async()=>{confirm.disabled=true;try{await saveDraft();const result=await S.publish(j);j={...j,...result};dirty=false;leaving=true;d.close();location.assign(`./journal.html?id=${encodeURIComponent(j.id)}`);}catch(e){failure(e);document.querySelector('#journal-retry').hidden=true;confirm.disabled=false;}},'journal-primary');d.append(confirm);d.showModal();
 }
 async function transition(action){if(!confirm(({withdraw:'确认撤下公开内容？后续照片请求也将受私有权限保护。',archive:'确认归档？手记和共享原图会保留，可恢复为草稿。',restore:'将归档记录恢复为私有编辑草稿？'})[action]))return;const result=await S.state(j,action);j={...j,...result};if(action==='withdraw')visibility.value='private';labels();status(action==='archive'?'手记已归档，可恢复。':action==='restore'?'已恢复为草稿；发布前请确认可见性。':'已撤下公开，当前完成记录仅自己可见。');}
 form.onsubmit=e=>e.preventDefault();form.addEventListener('input',e=>{if(e.target!==searchPlace&&e.target!==picker)change();});visibility.addEventListener('change',labels);
 window.addEventListener('beforeunload',e=>{if(!leaving&&(dirty||busy||queue.some(q=>q.state!=='ready'))){e.preventDefault();e.returnValue='';}});
 window.addEventListener('pagehide',()=>queue.forEach(q=>{if(q.localURL)URL.revokeObjectURL(q.localURL);}));
 form.hidden=false;status(j.draft&&j.version?'正在编辑私有修订草稿，当前发布版本仍保留。':'地点名是保存草稿的唯一必填项。');await renderQueue();
};
