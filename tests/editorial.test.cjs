const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('selected editorial layout retains real engines, deep links and all feature entry points',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const order=['top','map-section','journey-archive','photo-cinema','memory-rewind','memories','journey-stats','ratings'];
  const positions=order.map(id=>html.indexOf(`id="${id}"`));
  assert(positions.every((position,index)=>position>=0&&(!index||position>positions[index-1])));
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length,'IDs must stay unique after moving filters');
  assert(html.indexOf('id="city-search"')<html.indexOf('id="travel-map"'));
  assert.match(html,/距离第一次旅行/);assert(!html.includes('累计旅行天数'));
  assert.match(html,/id="city-count">—</);assert.match(html,/id="journey-count">—</);
  for(const file of ['site-background.js','map-engine.js','visit-engine.js','journey-engine.js','community.js','photo-cinema.js'])assert(html.includes(file));
  for(const entry of ['discover.html','admin.html','#ratings','#memories','#photo-cinema','#wishlist-panel'])assert(html.includes(entry));
  const dock=html.split('<nav class="mobile-dock"')[1].split('</nav>')[0];
  assert.equal((dock.match(/<a /g)||[]).length,4);
  for(const name of ['地图','旅程','影像','愿望'])assert(dock.includes(name));
});
test('unconfigured BGM does not create a floating control or request audio',()=>{
  const context={window:{TRAVEL_SITE_BGM_TRACKS:[{audioUrl:''},{audioUrl:''}]},document:{createElement(){throw Error('Unavailable audio must not render');}},Audio:class{constructor(){throw Error('Unavailable audio must not load');}}};
  vm.runInNewContext(fs.readFileSync('assets/site-bgm.js','utf8'),context);
});
