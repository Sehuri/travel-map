(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.JOURNAL_ENGINE=api;})(typeof window==='undefined'?globalThis:window,()=>{
 'use strict';
 const kinds={nature:'自然风景',culture:'人文建筑',walk:'城市漫步',other:'其他'};
 const statuses={draft:'草稿',published:'已发布',archived:'归档'};
 function title(c,p){return c.title?.trim()||[p.name,c.visit_date].filter(Boolean).join(' · ');}
 function validate(p,c,publish=false){
  if(!p.name?.trim())return '请填写地点名称';
  if(c.rating!==null&&(!Number.isInteger(c.rating)||c.rating<1||c.rating>10))return '评分须为 1–10 整数或暂不评分';
  if(c.visit_date&&!/^\d{4}-\d{2}-\d{2}$/.test(c.visit_date))return '到访日期格式不正确';
  if((p.longitude===null)!==(p.latitude===null)||p.longitude!==null&&(!Number.isFinite(p.longitude)||Math.abs(p.longitude)>180||!Number.isFinite(p.latitude)||Math.abs(p.latitude)>90))return '坐标需要完整填写经纬度，或全部留空';
  if(publish&&!p.location?.trim())return '发布前请填写可读的位置文字';
  if(publish&&!c.body?.trim()&&!c.photos?.length)return '请写下感受或添加一张已上传完成的照片';
  return '';
 }
 function filter(items,f={}){
  const q=(f.q||'').trim().toLocaleLowerCase();
  const date=(a,b)=>(b.content.visit_date||'').localeCompare(a.content.visit_date||'');
  return items.filter(j=>(!q||[j.place.name,j.place.country,j.place.location,j.content.title,j.content.body].join(' ').toLocaleLowerCase().includes(q))&&(!f.region||j.place.country===f.region)&&(!f.year||(j.content.visit_date||'').slice(0,4)===f.year)&&(!f.kind||j.place.kind===f.kind)&&(!f.status||j.status===f.status)&&(!f.visibility||j.visibility===f.visibility))
   .sort((a,b)=> (f.sort==='rating'? (b.content.rating??-1)-(a.content.rating??-1)||date(a,b):f.sort==='updated'? (b.updated_at||'').localeCompare(a.updated_at||''):date(a,b))||a.id.localeCompare(b.id));
 }
 return {kinds,statuses,title,validate,filter};
});
