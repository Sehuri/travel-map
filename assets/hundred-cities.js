(function () {
  'use strict';
  window.initializeHundredCities = ({ getVisits, getJourneys, openCity }) => {
    const panel = document.getElementById('hundred-cities');
    const siblings = [...panel.parentElement.children].filter(el => el !== panel);
    let openingFull = false;
    let savedVisibility = [], filter = 'all', cities = [], returnFocus, scrollY = 0;
    const dialog = document.createElement('dialog');
    dialog.className = 'hundred-drawer';
    dialog.setAttribute('aria-labelledby', 'hundred-city-title');
    document.body.append(dialog);
    const el = (tag, text, cls) => { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; return n; };
    function close() { dialog.close(); }
    dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } });
    dialog.addEventListener('close', () => { document.body.style.overflow = ''; window.scrollTo(0, scrollY); if (!openingFull) returnFocus?.focus({ preventScroll: true }); openingFull = false; });
    function summary(city, index, button) {
      returnFocus = button; scrollY = window.scrollY;
      dialog.replaceChildren();
      const exit = el('button', '关闭', 'hundred-close'); exit.onclick = close;
      const title = el('h2', city.name); title.id = 'hundred-city-title';
      dialog.append(exit, el('p', `第 ${String(index + 1).padStart(3, '0')} 座 · 已点亮`, 'hundred-tag'), title,
        el('p', city.region || city.country), el('p', `首次到访　${city.date}`), el('p', '已计入百城计划 · 1 座城市'), el('p', '重复到访不会重复增加进度。'), el('h3', '这一站的旅程'));
      const related = window.TRAVEL_JOURNEY_ENGINE?.journeysForCity(getJourneys(), city.name) || [];
      if (!related.length) dialog.append(el('p', '暂无关联旅程，可在城市完整记录中回看足迹。'));
      related.forEach(j => { const a = el('a', j.title); a.href = `./journey.html?slug=${encodeURIComponent(j.slug)}`; a.className = 'hundred-journey'; dialog.append(a, el('p', `${j.startDate || ''} — ${j.endDate || ''}`)); });
      const full = el('button', '查看城市完整记录', 'hundred-primary');
      full.onclick = () => { openingFull = true; close(); openCity(city); };
      dialog.append(full); document.body.style.overflow = 'hidden'; dialog.showModal();
    }
    function render() {
      cities = getVisits().slice().sort((a,b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'zh-CN'));
      const n = cities.length, remaining = Math.max(0,100-n), milestone = [25,50,75,100].find(v => v > n);
      panel.innerHTML = '<div class="hundred-hero"><div><p class="eyebrow">100 CITY PROJECT</p><h1>百城计划</h1><p>把每一次出发，慢慢走成一百座城。</p></div><div class="hundred-progress"></div></div><div class="hundred-wall"><div class="hundred-heading"><div><h2>我的百城足迹</h2><p>按首次到访顺序点亮，点击城市回看旅途。</p></div><div class="hundred-filters" aria-label="足迹状态"></div></div><p class="hundred-sync"></p><div class="hundred-grid"></div><p class="hundred-footer">与旅行足迹自动同步，同一城市多次到访只计一次。</p></div>';
      const progress = panel.querySelector('.hundred-progress');
      const count = el('p', '', 'hundred-count'); count.append(el('strong', String(n)), document.createTextNode(' / 100 座城市'));
      const bar = document.createElement('progress'); bar.max = 100; bar.value = Math.min(n,100); bar.setAttribute('aria-label', `百城计划已完成 ${Math.min(n,100)}%`);
      const marks = el('div', '', 'hundred-marks'); [25,50,75,100].forEach(v => marks.append(el('span', `${v} 城`)));
      const link = el('a', '去规划下一站 →', 'hundred-primary'); link.href = './discover.html';
      progress.append(count, el('p', n >= 100 ? `百城已达成 · 已到访 ${n} 座` : `已完成 ${n}% · 还差 ${remaining} 座`), bar, marks, el('p', milestone ? `下一里程碑：${milestone} 城，还差 ${milestone-n} 座` : '百城已达成，继续记录新的足迹。'), link);
      panel.querySelector('.hundred-sync').textContent = window.TRAVEL_CONTENT?.getState?.().connected ? '已同步旅行记录' : '当前显示本地已保存记录；联网后刷新页面同步最新足迹。';
      const grid = panel.querySelector('.hundred-grid');
      [['all',`全部 ${Math.max(100,n)}`],['visited',`已点亮 ${n}`],['pending',`待点亮 ${remaining}`]].forEach(([key,label]) => {
        const b = el('button', label); b.type = 'button'; b.setAttribute('aria-pressed', String(filter === key));
        b.onclick = () => { filter = key; render(); panel.querySelectorAll('.hundred-filters button')[['all','visited','pending'].indexOf(key)].focus({preventScroll:true}); };
        panel.querySelector('.hundred-filters').append(b);
      });
      for (let i=0;i<Math.max(100,n);i++) {
        const city = cities[i]; if (filter === 'visited' && !city || filter === 'pending' && city) continue;
        const tile = el(city ? 'button' : 'div', '', `hundred-cell${city ? ' is-lit' : ''}`);
        tile.append(el('small', String(i+1).padStart(3,'0')), el('span', city ? `${city.name} ✓` : i===n ? '下一座' : '待点亮'));
        if(city) { tile.type='button'; tile.setAttribute('aria-label', `第 ${i+1} 座 ${city.name} 已点亮`); tile.onclick = () => summary(city,i,tile); }
        grid.append(tile);
      }
      if (!grid.children.length) grid.append(el('p', filter === 'visited' ? '还没有到访记录，从下一次出发开始。' : '全部点亮，百城已达成！'));
    }
    function route() {
      const active = location.hash === '#hundred-cities';
      if (active && panel.hidden) { savedVisibility = siblings.map(n => n.hidden); siblings.forEach(n => n.hidden=true); panel.hidden=false; render(); }
      if (!active && !panel.hidden) { siblings.forEach((n,i) => n.hidden=savedVisibility[i]); panel.hidden=true; }
      document.body.dataset.contentView = active ? 'hundred' : 'home';
      if (!active) window.activateTravelHomeTab?.(location.hash === '#wishlist-panel' ? 'wishlist' : 'journeys', {scrollTarget: location.hash || '#map-section'});
      if(active) {
        document.querySelectorAll('[aria-current="location"]').forEach(n => n.removeAttribute('aria-current'));
        document.querySelector('.mobile-brand-title').textContent='百城计划';
      }
      document.querySelectorAll('[data-hundred-link]').forEach(n => active ? n.setAttribute('aria-current','location') : n.removeAttribute('aria-current'));
    }
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]'); if(!a) return;
      const hash = a.getAttribute('href');
      if(hash === '#hundred-cities' || !panel.hidden) {
        e.preventDefault();
        history.pushState(null,'',hash); route();

        requestAnimationFrame(() => document.querySelector(hash)?.scrollIntoView({behavior:'instant'}));
        document.querySelector('#site-menu')?.hidePopover?.();
      }
    }, true);
    window.addEventListener('hashchange', route); window.addEventListener('popstate', route);
    route();
  };
})();
