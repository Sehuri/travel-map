(function(root){
  const tiers=[{id:'hang',label:'夯',color:'#f2764f'},{id:'top',label:'顶级',color:'#e6c86c'},{id:'elite',label:'人上人',color:'#88c7a4'},{id:'npc',label:'NPC',color:'#80a5ce'},{id:'bad',label:'拉完了',color:'#bc9bcf'}];
  function distribution(rows) {
    const counts=tiers.map(t=>Math.max(0,Math.floor(Number(rows.find(r=>r.tier===t.id)?.vote_count)||0)));
    const total=counts.reduce((a,b)=>a+b,0);
    const raw=counts.map(n=>total?n*100/total:0), percent=raw.map(Math.floor);
    const order=raw.map((n,i)=>({i,remainder:n-percent[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
    const missing=total?100-percent.reduce((a,b)=>a+b,0):0;
    for(let i=0;i<missing;i++)percent[order[i].i]++;
    return {total,tiers:tiers.map((t,i)=>({...t,count:counts[i],percent:percent[i]}))};
  }
  const api={tiers,distribution};
  if(typeof module==='object'&&module.exports) module.exports=api; else root.TRAVEL_ATTRACTION_ENGINE=api;
})(typeof window!=='undefined'?window:globalThis);
