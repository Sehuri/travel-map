const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };
const cities = [
  {id:'320100',name:'南京市',label:'江苏省 · 南京市',province:'江苏省',coord:[118.8,32.06]},
  {id:'320583',name:'昆山市',label:'江苏省 · 苏州市 · 昆山市',province:'江苏省',coord:[120.98,31.38]},
  {id:'500000',name:'重庆市',label:'重庆市',province:'重庆市',coord:[106.55,29.56]}
];

(async () => {
  const server = http.createServer(async (req,res) => {
    const target = path.resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if (!target.startsWith(root + path.sep)) return res.writeHead(403).end();
    try { res.writeHead(200,{'Content-Type':types[path.extname(target)] || 'application/octet-stream'}).end(await fs.readFile(target)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors = [], requests = [];
    let failPlaces = true, holdPlaces = null;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.testClipboard = [];
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value => window.testClipboard.push(value)}});
      window.AMap = {
        Map:class { constructor() {window.testLines=[];window.mapMarkers=0;} addControl() {} setFitView(markers) {window.mapMarkers=markers.length;} destroy() {} },
        Marker:class { constructor(opts) {document.querySelector('#resource-map').append(opts.content);} },
        Polyline:class { constructor(opts) {window.testLines.push(opts.path);} }, Pixel:class {}, ToolBar:class {}, Scale:class {}
      };
    });
    await page.route('**/assets/discover-config.js', route => route.fulfill({contentType:'text/javascript',body:'window.TRAVEL_DISCOVER_CONFIG={endpoint:"https://resource.test/api"};'}));
    await page.route('https://resource.test/**', async route => {
      const params = Object.fromEntries(new URL(route.request().url()).searchParams);
      requests.push(params);
      if (params.action === 'catalogue') return route.fulfill({json:{cities,updated:'测试目录'}});
      if (params.action === 'route') return route.fulfill({json:{driving:{durationMinutes:90,source:'测试路线接口'},source:'测试路线接口'}});
      if (params.action === 'places') {
        if (holdPlaces) await holdPlaces;
        if (failPlaces) return route.fulfill({status:503,json:{error:'测试资源加载失败'}});
        const city = cities.find(item => item.id === params.city);
        return route.fulfill({json:{places:Array.from({length:20},(_,i)=>({id:`${params.city}-${i}`,name:`测试${i<10?'景点':'餐厅'} ${i+1}`,coord:[city.coord[0]+i*.001,city.coord[1]+i*.001],category:i<10?'sight':'food'}))}});
      }
      return route.fulfill({status:400,json:{error:'不支持的测试请求'}});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/discover.html`,{waitUntil:'networkidle'});
    assert(await page.locator('#destination-field').isHidden());
    await page.locator('#mode-city').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#mode-city').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#origin').getAttribute('required'),null);
    assert(await page.locator('[data-step="comparison"]').isHidden());
    assert(await page.locator('#radius').isDisabled());
    assert(await page.locator('#budget').isDisabled());
    await page.locator('#draw').click();
    assert.match(await page.locator('#destination-error').innerText(),/完整行政归属/);
    await page.locator('#destination').fill('重庆');
    await page.locator('#draw').click();
    assert(!requests.some(item => item.action === 'places'), 'partial names are not guessed');
    await page.locator('#destination').fill('重庆市');
    await page.locator('#days').fill('15');
    await page.locator('#draw').click();
    assert.match(await page.locator('#days-error').innerText(),/1—14/);
    await page.locator('#days').fill('2');
    await page.locator('#draw').click();
    await page.waitForFunction(() => document.querySelector('#draw-status').textContent.includes('测试资源加载失败'));
    await page.waitForFunction(() => !document.querySelector('#draw').disabled);
    assert(await page.locator('#conditions-view').isVisible());
    assert(await page.locator('#retry-destination').isVisible());
    assert(!requests.some(item => item.action === 'route'), 'no origin means no route API request');
    const beforeChangedRetry = requests.length;
    await page.locator('#destination').fill('江苏省 · 苏州市 · 昆山市');
    await page.locator('#retry-destination').click();
    assert.equal(requests.length,beforeChangedRetry);
    assert.match(await page.locator('#draw-status').innerText(),/条件已修改/);
    await page.locator('#destination').fill('重庆市');
    failPlaces = false;
    let release;
    holdPlaces = new Promise(resolve => {release=resolve;});
    await page.locator('#retry-destination').click();
    assert(await page.locator('#mode-random').isDisabled());
    assert(await page.locator('#draw').isDisabled());
    assert(await page.locator('#destination').isDisabled());
    const pendingRequests = requests.length;
    await page.locator('#draw').dispatchEvent('click');
    assert.equal(requests.length,pendingRequests);
    holdPlaces=null;release();
    await page.locator('#result').waitFor({state:'visible'});
    await page.waitForFunction(() => !document.querySelector('#draw').disabled);
    assert.equal(await page.locator('#result-title').innerText(),'重庆市');
    assert(await page.locator('#comparison').isHidden());
    assert.match(await page.locator('#trip-facts').innerText(),/未设出发地，暂不估算/);
    assert.match(await page.locator('#result-context').innerText(),/指定城市.*重庆市.*2 天/);
    assert.equal(await page.locator('#places .sight li').count(),10);
    assert.equal(await page.locator('#places .food li').count(),10);
    assert(await page.locator('#memory-link').isVisible(), 'visited cities can be explicitly explored');
    assert(await page.locator('#save-wishlist').isDisabled(), 'existing wishlist dedup is preserved');
    await page.locator('#generate-itinerary').click();
    assert.equal(await page.locator('.itinerary-day').count(),2);
    await page.locator('[data-day="2"]').click();
    assert.equal(await page.locator('.itinerary-day').count(),1);
    assert.match(await page.locator('#map-mode-label').innerText(),/第 2 天/);
    assert.equal(await page.evaluate(() => window.mapMarkers),3);
    await page.locator('#copy-result').click();
    assert.match(await page.evaluate(() => window.testClipboard.at(-1)),/指定城市探索.*2 天[\s\S]*未设出发地/);
    assert(!/NaN|undefined/.test(await page.locator('#result').innerText()));
    const beforeRestore = requests.length;
    await page.locator('#back-candidates').click();
    assert.equal(await page.locator('#destination').inputValue(),'重庆市');
    await page.locator('#days-plus').click();
    await page.locator('#restore-comparison').click();
    assert.equal(requests.length,beforeRestore,'restore keeps resources and selected itinerary day');
    assert.match(await page.locator('#result-context').innerText(),/2 天/);
    assert.match(await page.locator('#draw-status').innerText(),/上次条件/);
    assert.equal(await page.locator('[data-day="2"]').getAttribute('aria-pressed'),'true');
    await page.locator('#again').click();
    assert.equal(await page.locator('#days').inputValue(),'3');
    await page.locator('#destination').fill('江苏省 · 苏州市 · 昆山市');
    await page.locator('#draw').click();
    await page.locator('#result').waitFor({state:'visible'});
    await page.locator('#save-wishlist').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sehuri.travelWishlist.v1')));
    assert.equal(saved.length,1);
    assert.equal(saved[0].mapLabel,'昆山市');
    assert.match(saved[0].desc,/指定城市探索.*未估算交通/);
    assert(!saved[0].desc.includes('undefined'));
    await page.locator('#back-candidates').click();
    await page.locator('#origin').fill('江苏省 · 南京市');
    await page.locator('#draw').click();
    await page.locator('#result').waitFor({state:'visible'});
    assert(requests.some(item => item.action==='route' && item.from==='320100' && item.to==='320583'));
    assert.match(await page.locator('#trip-facts').innerText(),/测试路线接口/);
    await page.locator('#back-candidates').click();
    await page.locator('#destination').fill('江苏省 · 南京市');
    const routesBeforeLocal = requests.filter(item => item.action==='route').length;
    await page.locator('#draw').click();
    await page.locator('#result').waitFor({state:'visible'});
    assert.equal(requests.filter(item => item.action==='route').length,routesBeforeLocal);
    assert.match(await page.locator('#trip-facts').innerText(),/同城探索/);
    await page.locator('#back-candidates').click();
    await page.locator('#mode-random').click();
    assert(await page.locator('#destination-field').isHidden());
    assert(!(await page.locator('#radius').isDisabled()));
    assert.equal(await page.locator('#origin').getAttribute('required'),'');
    await page.locator('#mode-city').click();
    assert.equal(await page.locator('#destination').inputValue(),'江苏省 · 南京市');
    // Screenshots use explicit mock resources, never production votes or uploads.
    for (const width of [1440,1024,768,390]) {
      await page.setViewportSize({width,height:1000});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`city conditions ${width}`);
      assert(await page.locator('#mode-city').evaluate(el=>el.getBoundingClientRect().height>=44));
      if ([1440,390].includes(width)) await page.screenshot({path:path.join(os.tmpdir(),`travel-discover-city-conditions-${width}.png`),fullPage:true});
      await page.locator('#restore-comparison').click();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`city destination ${width}`);
      if ([1440,390].includes(width)) await page.screenshot({path:path.join(os.tmpdir(),`travel-discover-city-result-${width}.png`),fullPage:true});
      await page.locator('#back-candidates').click();
    }
    assert.deepEqual(errors,[]);
    console.log('Direct city browser checks passed: ID selection, optional origin, visited/local destinations, retries, duplicate guards, snapshots, itinerary, save/copy, mode switching and 390/768/1024/1440 layouts. Mock resources only.');
  } finally {
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
