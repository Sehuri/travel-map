(function () {
  'use strict';
  const catalogue = window.TRAVEL_ATTRACTION_DATA.attractions;
  const engine = window.TRAVEL_ATTRACTION_ENGINE;
  const el = Object.fromEntries(['city','city-select','search','filter','refresh','service-status','result-count','list','more'].map(k=>[k,document.getElementById(`attraction-${k}`)]));
  const cities = [...new Map(catalogue.map(a=>[JSON.stringify([a.city,a.country]),{city:a.city,country:a.country}])).entries()];
  cities.forEach(([key,c])=>el['city-select'].add(new Option(`${c.city} · ${c.country}`,key)));
  const params = new URL(location.href).searchParams;
  el['city-select'].value = cities.find(([,c])=>c.city===params.get('city')&&(!params.get('country')||c.country===params.get('country')))?.[0] || cities[0][0];
  let client, user, sequence=0, limit=12, places=[], registered=new Set(), own=new Map(), summaries=new Map(), available=false;
  const pending=new Set(), messages=new Map(), selected=new Map();
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function status(text,error=false){el['service-status'].textContent=text;el['service-status'].classList.toggle('error',error);}
  function render(){
    const filtered=places.filter(p=>p.name.includes(el.search.value.trim()) && (el.filter.value==='all'||(el.filter.value==='voted'?own.has(p.id):!own.has(p.id))));
    el['result-count'].textContent=`共 ${places.length} 个景点 · 匹配 ${filtered.length} 个 · 已显示 ${Math.min(limit,filtered.length)} 个`;
    el.more.hidden=filtered.length<=limit;
    el.list.innerHTML=filtered.slice(0,limit).map(p=>{
      const result=engine.distribution(summaries.get(p.id)||[]), vote=own.get(p.id), locked=!!vote||pending.has(p.id)||!available||!registered.has(p.id)||!user;
      const index=places.indexOf(p)+1;
      return `<article class="attraction-card" data-id="${escape(p.id)}"><span class="place-index">${String(index).padStart(2,'0')}</span><h2>${escape(p.name)}</h2><div class="attraction-links"><a href="https://uri.amap.com/search?keyword=${encodeURIComponent(p.city+' '+p.name)}" target="_blank" rel="noopener noreferrer">在地图中查看 ↗</a>${p.referenceUrl?`<a href="${escape(p.referenceUrl)}" target="_blank" rel="noopener noreferrer">城市旅游参考 ↗</a>`:''}</div><p class="vote-total">${available?result.total?`${result.total} 人已评价`:'暂无评价，来留下第一份体验':'全站结果暂不可用'}</p><div class="vote-stack" aria-hidden="true">${available?result.tiers.map(t=>`<span style="--share:${t.percent}%;--tier-color:${t.color}"></span>`).join(''):''}</div><dl class="vote-distribution">${result.tiers.map(t=>`<div style="--tier-color:${t.color}"><dt>${t.label}</dt><dd>${available?t.percent+'%':'—'}</dd><small>${available?t.count+' 人':'待连接'}</small></div>`).join('')}</dl><form><fieldset ${locked?'disabled':''}><legend>${vote?'你的选择已保存':'选择你的体验等级'}</legend><div class="tier-options">${engine.tiers.map(t=>`<label class="tier-option" style="--tier-color:${t.color}"><input type="radio" name="tier" value="${t.id}" required ${(vote||selected.get(p.id))===t.id?'checked':''}>${t.label}</label>`).join('')}</div></fieldset><button class="vote-submit" type="submit" ${locked||!selected.has(p.id)?'disabled':''}>${vote?'已评价 · 不可修改':pending.has(p.id)?'正在提交…':'提交选择 · 仅此一次'}</button></form><p class="vote-status" role="status">${escape(messages.get(p.id)|| (vote?`你选择了「${engine.tiers.find(t=>t.id===vote)?.label}」`:!available?'服务连接后即可参与评价':!registered.has(p.id)?'此景点尚未开放投票':'提交后不能修改，请确认体验后再选择。'))}</p></article>`;
    }).join('') || '<p>没有匹配的景点，试试其他关键词或筛选条件。</p>';
  }
  async function session(){
    if(!client)throw new Error('服务不可用');
    let response=await client.auth.getSession();
    if(response.error)throw response.error;
    if(!response.data.session){response=await client.auth.signInAnonymously();if(response.error)throw response.error;user=response.data.user||response.data.session?.user;}
    else user=response.data.session.user;
    if(!user)throw new Error('匿名身份未创建');
  }
  async function load(reset=true){
    const token=++sequence, [city,country]=JSON.parse(el['city-select'].value);
    if(reset){limit=12;el.search.value='';el.filter.value='all';selected.clear();}
    available=false; registered=new Set(); summaries=new Map();own=new Map();
    places=catalogue.filter(p=>p.city===city&&p.country===country);
    el.city.textContent=city;document.title=`${city}景点评等级｜Sehuri 的旅行足迹`;
    document.getElementById('back-city').href=`./index.html?city=${encodeURIComponent(city)}`;
    const url=new URL(location.href);url.searchParams.set('city',city);url.searchParams.set('country',country);history.replaceState(null,'',url);
    status('正在连接景点投票服务…');render();
    try{
      await session();
      const remote=await client.from('travel_attractions').select('id,city_name,country,name,reference_url').eq('city_name',city).eq('country',country);
      if(remote.error)throw remote.error;
      const ids=(remote.data||[]).map(p=>p.id);
      const results=ids.length?await Promise.all([
        client.from('attraction_vote_summary').select('attraction_id,tier,vote_count').in('attraction_id',ids),
        client.from('attraction_votes').select('attraction_id,tier').eq('user_id',user.id).in('attraction_id',ids)
      ]):[{data:[]},{data:[]}];
      if(results.some(r=>r.error))throw results.find(r=>r.error).error;
      if(token!==sequence)return;
      registered=new Set(ids);
      const merged=new Map(places.map(p=>[p.id,p]));
      (remote.data||[]).forEach(p=>merged.set(p.id,{id:p.id,city:p.city_name,country:p.country,name:p.name,referenceUrl:p.reference_url}));places=[...merged.values()];
      results[0].data.forEach(r=>{if(!summaries.has(r.attraction_id))summaries.set(r.attraction_id,[]);summaries.get(r.attraction_id).push(r);});
      results[1].data.forEach(r=>own.set(r.attraction_id,r.tier));available=true;
      status(ids.length?'全站投票结果已更新 · 每个景点仅可评价一次':'景点目录已就绪，投票服务尚未开放。');
    }catch(error){if(token!==sequence)return;status('投票服务暂不可用，仍可浏览景点。请稍后刷新结果。',true);}
    render();
  }
  el.list.addEventListener('change',event=>{if(event.target.name!=='tier')return;const card=event.target.closest('[data-id]');selected.set(card.dataset.id,event.target.value);card.querySelector('.vote-submit').disabled=false;});
  el.list.addEventListener('submit',async event=>{
    event.preventDefault();const card=event.target.closest('[data-id]'),id=card.dataset.id,tier=selected.get(id),token=sequence;
    if(!available||!user||!registered.has(id)||!tier||own.has(id)||pending.has(id))return;
    pending.add(id);messages.delete(id);render();
    try{
      const response=await client.from('attraction_votes').insert({attraction_id:id,user_id:user.id,tier});
      if(response.error)throw response.error;
      own.set(id,tier);messages.set(id,'选择已保存，感谢分享你的体验。');
    }catch(error){messages.set(id,error.code==='23505'?'此浏览器已评价过这个景点。':'提交结果未确认，请刷新后检查；重复提交不会重复计票。');}
    finally{pending.delete(id);if(token===sequence)await load(false);}
  });
  el['city-select'].addEventListener('change',()=>load());el.refresh.addEventListener('click',()=>load(false));
  el.search.addEventListener('input',()=>{limit=12;render();});el.filter.addEventListener('change',()=>{limit=12;render();});el.more.addEventListener('click',()=>{limit+=12;render();});
  try{const config=window.SUPABASE_CONFIG;client=window.supabase.createClient(config.url,config.publishableKey);}catch(error){/* Catalogue remains available offline. */}
  load();
})();
