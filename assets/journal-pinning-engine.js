(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.JOURNAL_PINNING_ENGINE=api;})(typeof window==='undefined'?globalThis:window,()=>{
 'use strict';
 const eligible=j=>Boolean(j&&j.status==='published'&&j.visibility==='public'&&j.published_version_id);
 function pinTime(j){
  const v=j?.pinned_at;if(!eligible(j)||typeof v!=='string')return null;
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.exec(v);if(!m)return null;
  const [y,month,day,h,min,s]=m.slice(1).map(Number),leap=y%4===0&&(y%100!==0||y%400===0);
  if(month<1||month>12||day<1||day>[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1]||h>23||min>59||s>59)return null;
  const n=Date.parse(v);return Number.isFinite(n)?n:null;
 }
 const pinned=j=>pinTime(j)!==null;
 // The input is already filtered and sorted by the selected regular sort.
 // Never use this for updates, related entries, or the private management list.
 function gridOrder(items){return items.map((record,index)=>({record,index})).sort((a,b)=>{
  const x=pinTime(a.record),y=pinTime(b.record);
  if(x!==null&&y!==null){const precise=(j,t)=>BigInt(t)*1000000n+BigInt(((/\.(\d+)/.exec(j.pinned_at)?.[1]||'').padEnd(9,'0')).slice(3,9)||'0'),ax=precise(a.record,x),by=precise(b.record,y);return (by>ax?1:by<ax?-1:0)||String(a.record.id).localeCompare(String(b.record.id),'en');}
  return x!==null?-1:y!==null?1:a.index-b.index;
 }).map(v=>v.record);}
 return {eligible,pinTime,pinned,gridOrder};
});
