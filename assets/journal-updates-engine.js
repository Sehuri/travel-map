(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.JOURNAL_UPDATES_ENGINE=api;})(typeof window==='undefined'?globalThis:window,()=>{
 'use strict';
 const zone='Asia/Shanghai',dayLength=86400000;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 function timestamp(value){
  // Require an absolute server timestamp; a device-local date is not an update.
  if(typeof value!=='string')return null;
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.exec(value);if(!match)return null;
  const [year,month,date,hour,minute,second]=match.slice(1).map(Number),leap=year%4===0&&(year%100!==0||year%400===0);
  if(month<1||month>12||date<1||date>[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1]||hour>23||minute>59||second>59)return null;
  const result=Date.parse(value);return Number.isFinite(result)?result:null;
 }
 function clock(value){
  const p=Object.fromEntries(parts.formatToParts(new Date(value)).map(p=>[p.type,p.value]));
  return {day:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`,full:`${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}（北京时间）`};
 }
 function dayKey(now=Date.now()){return clock(now).day;}
 function dayLabel(day,now=Date.now()){
  const today=dayKey(now),yesterday=dayKey(now-dayLength),dots=day.replaceAll('-','.');
  if(day===today)return `今天 · ${dots}`;
  if(day===yesterday)return `昨天 · ${dots}`;
  const [year,month,date]=day.split('-');return `${year}年${Number(month)}月${Number(date)}日`;
 }
 function ordered(records){
  const entries=new Map();
  for(const j of records||[]){
   if(!j?.id||j.status!=='published'||j.visibility!=='public')continue;
   const previous=entries.get(j.id),time=timestamp(j.updated_at);
   if(!previous||(time??-Infinity)>(timestamp(previous.updated_at)??-Infinity))entries.set(j.id,j);
  }
  return [...entries.values()].sort((a,b)=>{
   const x=timestamp(a.updated_at),y=timestamp(b.updated_at);
   return (x===null&&y!==null?1:y===null&&x!==null?-1:x!==null&&y!==null?y-x:0)||String(a.id).localeCompare(String(b.id),'en');
  });
 }
 function groups(records,now=Date.now()){
  const result=new Map();
  for(const j of ordered(records)){
   const time=timestamp(j.updated_at),when=time===null?null:clock(time),key=when?.day||'unknown';
   if(!result.has(key))result.set(key,{key,label:when?dayLabel(key,now):'时间待补充',items:[]});
   result.get(key).items.push({record:j,time,when});
  }
  return [...result.values()];
 }
 function range(filters,kinds={}){
  return [filters.city&&`城市：${filters.city}`,filters.region&&`国家 / 地区：${filters.region}`,filters.year&&`到访年份：${filters.year}`,filters.kind&&`类型：${kinds[filters.kind]||filters.kind}`,filters.q?.trim()&&`搜索：${filters.q.trim()}`].filter(Boolean).join(' · ')||'全部公开手记';
 }
 return {zone,timestamp,clock,dayKey,ordered,groups,range};
});
