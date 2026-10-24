// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright package.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg'};
(async()=>{
  const server=http.createServer(async(req,res)=>{
    const target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{const body=await fs.readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream'}).end(body);}
    catch{res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try{
    const launchOptions={headless:true};
    if(process.env.CHROME_PATH)launchOptions.executablePath=process.env.CHROME_PATH;
    browser=await chromium.launch(launchOptions);
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    await page.addInitScript(()=>{window.testClipboard=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.testClipboard.push(value);}}});});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let configEndpoint='';
    await page.route('**/assets/discover-config.js',r=>r.fulfill({contentType:'text/javascript',body:`window.TRAVEL_DISCOVER_CONFIG={endpoint:${JSON.stringify(configEndpoint)}};`}));
    await page.goto(base+'/discover.html',{waitUntil:'networkidle'});
    assert.equal(await page.locator('#site-bgm').count(),0,'unavailable music is not rendered');
    assert(await page.locator('#draw').isDisabled());
    assert.match(await page.locator('#connection-status').innerText(),/尚未启用/);
    await page.locator('#discover-menu-toggle').press('Enter');
    // Native popover visibility changes before the queued toggle event updates ARIA.
    await page.waitForFunction(()=>document.querySelector('#discover-menu').matches(':popover-open')&&document.querySelector('#discover-menu-toggle').getAttribute('aria-expanded')==='true');
    assert.equal(await page.locator('#discover-menu-toggle').getAttribute('aria-expanded'),'true');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('#discover-menu').matches(':popover-open')&&document.querySelector('#discover-menu-toggle').getAttribute('aria-expanded')==='false');
    await page.locator('#preview-button').click();
    await page.locator('#origin').fill('江苏省 · 南京');
    await page.locator('#radius').selectOption('Infinity');
    // Real form state: max three interests without silently replacing a prior choice.
    for(const value of ['nature','culture','food'])await page.locator(`#interests input[value="${value}"]`).check();
    await page.locator('#interests input[value="city"]').click();
    assert.equal(await page.locator('#interests input:checked').count(),3);
    assert.match(await page.locator('#interest-status').innerText(),/最多选择 3 项/);
    await page.getByRole('button',{name:'移除美食寻味偏好',exact:true}).click();
    assert.equal(await page.locator('#interests input:checked').count(),2);
    while(await page.locator('#interests input:checked').count())await page.locator('#interests input:checked').first().uncheck();
    await page.locator('#days').fill('15');await page.locator('#draw').click();
    assert(await page.locator('#comparison').isHidden());assert.match(await page.locator('#days-error').innerText(),/1—14/);
    await page.locator('#days').fill('3');
    await page.locator('#draw').click();
    await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
    assert(await page.locator('#comparison').isVisible());
    assert.equal(await page.locator('.candidate-card').count(),3);
    assert.match(await page.locator('.candidate-card').first().innerText(),/高铁|动车/);
    const firstGroup=await page.locator('.candidate-card h3').allTextContents();
    assert(!firstGroup.includes('重庆'), 'newly visited Chongqing is excluded');
    assert(await page.locator('#conditions-view').isHidden());
    await page.locator('#comparison [data-edit-conditions]').click();
    assert.equal(await page.locator('#origin').inputValue(),'江苏省 · 南京');
    await page.locator('#days-plus').click();
    assert.match(await page.locator('#summary-main').innerText(),/4 天/);
    assert.match(await page.locator('#conditions-changed').innerText(),/条件已修改/);
    await page.locator('#restore-comparison').click();
    assert.deepEqual(await page.locator('.candidate-card h3').allTextContents(),firstGroup);
    assert.match(await page.locator('#batch-note').innerText(),/旧条件结果/);
    assert.match(await page.locator('#batch-summary').innerText(),/3 天/);
    await page.locator('#comparison [data-edit-conditions]').click();await page.locator('#days-minus').click();await page.locator('#restore-comparison').click();
    await page.locator('#comparison').screenshot({path:path.join(os.tmpdir(),'travel-discover-comparison.png')});
    const findSaveable=()=>page.locator('.candidate-card').evaluateAll(cards=>{
      const builtIn=new Set(window.TRAVEL_DATA.wishlist.map(item=>(item.mapLabel||item.name.split(' · ').at(-1)).replace(/市$/,'')));
      return cards.findIndex(card=>!builtIn.has(card.querySelector('h3').textContent.replace(/市$/,'')));
    });
    let saveableIndex=await findSaveable();
    for(let attempt=0;saveableIndex<0&&attempt<3;attempt++){
      await page.locator('#compare-again').click();
      await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
      saveableIndex=await findSaveable();
    }
    assert(saveableIndex>=0);
    await page.locator('.choose-candidate').nth(saveableIndex).click();
    await page.waitForFunction(()=>!document.querySelector('#result').hidden);
    assert(await page.locator('#result').isVisible());
    assert((await page.locator('#places li').count())>0);
    const selectedGroup=await page.locator('.candidate-card h3').allTextContents();
    await page.locator('#back-candidates').click();
    assert.deepEqual(await page.locator('.candidate-card h3').allTextContents(),selectedGroup);
    assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),`查看${selectedGroup[saveableIndex]}目的地`);
    await page.locator('.choose-candidate').nth(saveableIndex).click();
    const first=await page.locator('#result-title').innerText();
    await page.locator('#save-wishlist').click();
    assert(await page.locator('#save-wishlist').isDisabled());
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sehuri.travelWishlist.v1')).length),1);
    await page.locator('#again').click();
    await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
    const secondGroup=await page.locator('.candidate-card h3').allTextContents();
    // After Chongqing is visited, only three sample cities remain eligible. Once
    // that pool is exhausted a new batch may legitimately repeat the same order.
    assert.equal(new Set(secondGroup).size, 3);
    assert(!secondGroup.includes('重庆'));
    const nextIndex = secondGroup.findIndex(name => name !== first);
    assert(nextIndex >= 0);
    await page.locator('.choose-candidate').nth(nextIndex).click();
    await page.waitForFunction(()=>!document.querySelector('#result').hidden);
    assert.notEqual(await page.locator('#result-title').innerText(),first);
    await page.locator('#result').screenshot({path:path.join(os.tmpdir(),'travel-discover-result.png')});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:path.join(os.tmpdir(),'travel-discover-desktop.png')});
    await page.locator('#result [data-edit-conditions]').click();
    await page.locator('#origin').fill('不存在的城市');
    await page.locator('#draw').click();assert.match(await page.locator('#origin-error').innerText(),/出发地/);
    await page.setViewportSize({width:390,height:844});
    await page.locator('#origin').fill('江苏省 · 南京');
    await page.evaluate(()=>window.scrollTo(0,0));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:path.join(os.tmpdir(),'travel-discover-mobile.png')});
    // Mock a connected nationwide service including an uncurated county-level city.
    configEndpoint='https://resource.test/api';
    let routeRequests=0,placeRequests=0,failPlaces=false,placesGate=null;
    let routeResponse={driving:{durationMinutes:95,distanceKm:110,tolls:35},rail:{durationMinutes:42,cost:58,trip:'G7001'},source:'高德路线规划'};
    await page.route('https://resource.test/**',async r=>{
      const q=new URL(r.request().url()).searchParams;
      const cities=[{id:'320100',name:'南京市',province:'江苏省',label:'江苏省 · 南京市',coord:[118.8,32.06]}, {id:'320583',name:'昆山市',province:'江苏省',parent:'苏州市',label:'江苏省 · 苏州市 · 昆山市',coord:[120.98,31.38],level:'district'}];
      if(q.get('action')==='catalogue')return r.fulfill({json:{cities,updated:'测试目录'}});
      if(q.get('action')==='places'){placeRequests++;if(placesGate)await placesGate;return failPlaces?r.fulfill({status:503,json:{error:'测试资源失败'}}):r.fulfill({json:{places:Array.from({length:20},(_,i)=>({name:`测试点位${i}`,coord:[120.95,31.39],category:i<10?'sight':'food',type:i<10?'公园':'餐饮服务',area:'昆山市'}))}});}
      if(q.get('action')==='route'){routeRequests++;return r.fulfill({json:routeResponse});}
      return r.fulfill({status:503,json:{error:'测试：地图服务暂不可用'}});
    });
    await page.addInitScript(()=>{window.AMap={Map:class{constructor(id,opts){window.mapOptions=opts;window.testLines=[];} addControl(){} setFitView(markers){window.mapMarkers=markers.length;} destroy(){window.mapDestroyed=true;}},Marker:class{constructor(opts){this.options=opts;document.querySelector('#resource-map').append(opts.content);}},Polyline:class{constructor(opts){window.testLines.push(opts.path);}},Pixel:class{},ToolBar:class{},Scale:class{}};});
    await page.reload({waitUntil:'networkidle'});
    await page.locator('#origin').fill('江苏省 · 南京市');
    await page.locator('#draw').click();
    await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
    assert.equal(await page.locator('.candidate-card').count(),1);
    assert.match(await page.locator('#batch-note').innerText(),/不足 3 个/);
    assert.match(await page.locator('.candidate-card').innerText(),/42 分钟/);
    failPlaces=true;
    await page.locator('.choose-candidate').click();
    await page.waitForFunction(()=>document.querySelector('#draw-status').textContent.includes('测试资源失败'));
    assert(await page.locator('#comparison').isVisible());assert(await page.locator('#result').isHidden());
    failPlaces=false;
    let releasePlaces;placesGate=new Promise(resolve=>releasePlaces=resolve);
    await page.locator('.choose-candidate').click();
    assert.match(await page.locator('.choose-candidate').innerText(),/正在加载资源/);
    assert(await page.locator('.choose-candidate').isDisabled());
    const pendingPlaceRequests=placeRequests;
    await page.locator('.choose-candidate').dispatchEvent('click');
    assert.equal(placeRequests,pendingPlaceRequests,'busy guard prevents duplicate resource requests');
    releasePlaces();placesGate=null;
    await page.waitForFunction(()=>!document.querySelector('#result').hidden);
    assert.equal(await page.locator('#result-title').innerText(),'昆山市');
    assert.match(await page.locator('#result-region').innerText(),/苏州市 · 昆山市/);
    await page.waitForFunction(()=>window.mapMarkers===20);
    assert.equal(await page.evaluate(()=>window.mapOptions.dragEnable),true);
    assert.equal(await page.evaluate(()=>window.mapOptions.scrollWheel),true);
    assert.equal(await page.locator('#places .sight li').count(),10);
    assert.equal(await page.locator('#places .food li').count(),10);
    const beforeBack={routeRequests,placeRequests};
    await page.locator('#back-candidates').click();assert.deepEqual({routeRequests,placeRequests},beforeBack);
    await page.locator('.choose-candidate').click();assert.deepEqual({routeRequests,placeRequests},beforeBack,'reopening the selected destination reuses its resources');
    const pinStyle=await page.locator('.resource-pin.sight').first().evaluate(e=>({bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}));
    assert.deepEqual(pinStyle,{bg:'rgb(38, 102, 81)',color:'rgb(255, 255, 255)'});
    await page.locator('[data-map-category="food"]').click();
    await page.waitForFunction(()=>window.mapMarkers===10);
    assert.equal(await page.locator('.resource-pin.sight').count(),0);
    await page.locator('#generate-itinerary').click();
    await page.waitForFunction(()=>window.testLines.length===3);
    assert.equal(await page.locator('.itinerary-day').count(),3);
    assert.equal(await page.locator('#itinerary-tabs button').count(),4);
    assert.match(await page.locator('#itinerary-days').innerText(),/用餐候选/);
    await page.locator('[data-day="2"]').click();
    await page.waitForFunction(()=>window.testLines.length===1);
    assert.equal(await page.locator('.itinerary-day').count(),1);
    assert.match(await page.locator('.itinerary-day h4').innerText(),/第 2 天/);
    assert.equal(await page.evaluate(()=>window.mapMarkers),3);
    assert.equal(await page.locator('#map-filters button[aria-pressed="true"]').count(),0);
    assert.match(await page.locator('#map-mode-label').innerText(),/第 2 天/);
    await page.locator('#view-resources').click();
    await page.locator('[data-map-category="all"]').click();
    await page.waitForFunction(()=>window.mapMarkers===20);
    assert.equal(await page.evaluate(()=>window.testLines.length),0);
    assert.equal(await page.locator('#itinerary-tabs button[aria-pressed="true"]').count(),0);
    assert.equal(await page.locator('#view-resources').getAttribute('aria-pressed'),'true');
    await page.locator('#view-itinerary').click();
    await page.waitForFunction(()=>window.mapMarkers===3);
    assert.equal(await page.locator('[data-day="2"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>window.testClipboard.length),0,'copy occurs only on a user click');
    await page.locator('#copy-itinerary').click();
    await page.waitForFunction(()=>document.querySelector('#itinerary-status').textContent.includes('已复制'));
    assert.match(await page.locator('#itinerary-status').innerText(),/已复制|手动复制/);
    await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new Error('test permission denied');};});
    await page.locator('#copy-result').click();
    await page.locator('#copy-fallback').waitFor({state:'visible'});
    assert.match(await page.locator('#copy-text').inputValue(),/昆山市/);
    await page.locator('#close-copy').click();
    for(const width of [1440,1024,768,390]){
      await page.setViewportSize({width,height:1000});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`destination ${width}: no overflow`);
      await page.locator('#back-candidates').click();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`comparison ${width}: no overflow`);
      await page.locator('#comparison [data-edit-conditions]').click();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`conditions ${width}: no overflow`);
      await page.locator('#restore-comparison').click();await page.locator('.choose-candidate').click();
    }
    await page.locator('#view-resources').click();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.locator('#result').screenshot({path:path.join(os.tmpdir(),'travel-discover-categories.png')});
    assert.deepEqual(errors,[]);
    // Source provenance is per mode, not a blanket "all routes from the API" claim.
    routeResponse={driving:{durationMinutes:95,source:'实际路线来源'},rail:{durationMinutes:42,estimated:true},source:'高德路线规划'};
    await page.locator('#again').click();await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
    assert.match(await page.locator('.candidate-card').innerText(),/按直线距离估算/);
    assert.match(await page.locator('.candidate-card').innerText(),/实际路线来源/);
    // Old deployed API: separate requests still produce ten sights and ten foods.
    let foodRequests=0;
    await page.route('https://resource.test/**',async(route)=>{
      const q=new URL(route.request().url()).searchParams;
      if(q.get('action')!=='places')return route.fallback();
      const food=q.get('interests')==='food'; if(food)foodRequests++;
      return route.fulfill({json:{places:Array.from({length:10},(_,i)=>({id:`${food}-${i}`,name:`${food?'餐厅':'景点'}${i}`,coord:[120.95,31.39],type:food?'餐饮服务 · 中餐厅':'风景名胜'}))}});
    });
    await page.evaluate(()=>{window.loadDiscoverAmap=()=>Promise.reject(new Error('地图服务暂不可用'));});
    await page.locator('#compare-again').click();
    await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
    await page.locator('.choose-candidate').click();
    await page.waitForFunction(()=>document.querySelector('#map-status').textContent.includes('地图服务暂不可用'));
    assert.equal(foodRequests,1);
    assert(await page.locator('#itinerary-result').isHidden());
    assert.equal(await page.locator('#places .sight li').count(),10);
    assert.equal(await page.locator('#places .food li').count(),10);
    assert.equal(await page.evaluate(()=>window.mapDestroyed),true);
    await page.locator('#generate-itinerary').click();
    assert.equal(await page.locator('.itinerary-day').count(),3);
    assert(await page.locator('#retry-map').isVisible());
    await page.locator('#retry-map').click();
    await page.waitForFunction(()=>document.querySelector('#map-status').textContent.includes('地图服务暂不可用'));
    await page.locator('#result [data-edit-conditions]').click();
    await page.locator('.more-conditions summary').click();
    await page.locator('#province').selectOption('江苏省');
    await page.locator('#radius').selectOption('350');
    await page.locator('#budget').selectOption('1500');
    await page.locator('#days').fill('14');await page.locator('#draw').click();
    assert.match(await page.locator('#draw-status').innerText(),/没有候选城市/);
    assert(await page.locator('#conditions-view').isVisible());
    assert.deepEqual(errors,[]);
    // Failed catalogue connections remain retryable without changing service configuration.
    const reconnect=await browser.newPage({viewport:{width:390,height:844}});
    let catalogueAttempts=0;
    await reconnect.route('**/assets/discover-config.js',r=>r.fulfill({contentType:'text/javascript',body:'window.TRAVEL_DISCOVER_CONFIG={endpoint:"https://connection.test/api"};'}));
    await reconnect.route('https://connection.test/**',r=>{
      catalogueAttempts++;
      return catalogueAttempts===1?r.fulfill({status:503,json:{error:'测试目录连接失败'}}):r.fulfill({json:{cities:[{id:'320100',name:'南京市',province:'江苏省',label:'江苏省 · 南京市',coord:[118.8,32.06]}],updated:'测试更新'}});
    });
    await reconnect.goto(base+'/discover.html',{waitUntil:'domcontentloaded'});
    await reconnect.locator('#connect-retry').waitFor({state:'visible'});
    assert(await reconnect.locator('#origin').isDisabled());
    await reconnect.locator('#connect-retry').click();
    await reconnect.waitForFunction(()=>!document.querySelector('#origin').disabled);
    assert.equal(catalogueAttempts,2);assert.match(await reconnect.locator('#connection-status').innerText(),/1 座城市/);
    await reconnect.close();
    console.log('Browser checks passed: three-step navigation, old-condition snapshots, one-candidate/empty states, interest/day validation, retry, provenance, map/day synchronization, local wish save, copy, legacy API, 390/768/1024/1440 layouts.');
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
