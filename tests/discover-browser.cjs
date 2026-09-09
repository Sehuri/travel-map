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
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let configEndpoint='';
    await page.route('**/assets/discover-config.js',r=>r.fulfill({contentType:'text/javascript',body:`window.TRAVEL_DISCOVER_CONFIG={endpoint:${JSON.stringify(configEndpoint)}};`}));
    await page.goto(base+'/discover.html',{waitUntil:'networkidle'});
    assert(await page.locator('#draw').isDisabled());
    assert.match(await page.locator('#connection-status').innerText(),/尚未启用/);
    await page.locator('#preview-button').click();
    await page.locator('#origin').fill('江苏省 · 南京');
    await page.locator('#radius').selectOption('Infinity');
    await page.locator('#draw').click();
    await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
    assert(await page.locator('#result').isVisible());
    assert((await page.locator('#places li').count())>0);
    const first=await page.locator('#result-title').innerText();
    await page.locator('#again').click();
    await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
    assert.notEqual(await page.locator('#result-title').innerText(),first);
    await page.locator('#result').screenshot({path:path.join(os.tmpdir(),'travel-discover-result.png')});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:path.join(os.tmpdir(),'travel-discover-desktop.png')});
    await page.locator('#origin').fill('不存在的城市');
    await page.locator('#draw').click();assert.match(await page.locator('#draw-status').innerText(),/出发地/);
    await page.setViewportSize({width:390,height:844});
    await page.locator('#origin').fill('江苏省 · 南京');
    await page.evaluate(()=>window.scrollTo(0,0));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:path.join(os.tmpdir(),'travel-discover-mobile.png')});
    // Mock a connected nationwide service including an uncurated county-level city.
    configEndpoint='https://resource.test/api';
    await page.route('https://resource.test/**',r=>{
      const q=new URL(r.request().url()).searchParams;
      const cities=[{id:'320100',name:'南京市',province:'江苏省',label:'江苏省 · 南京市',coord:[118.8,32.06]}, {id:'320583',name:'昆山市',province:'江苏省',parent:'苏州市',label:'江苏省 · 苏州市 · 昆山市',coord:[120.98,31.38],level:'district'}];
      if(q.get('action')==='catalogue')return r.fulfill({json:{cities,updated:'测试目录'}});
      if(q.get('action')==='places')return r.fulfill({json:{places:[{name:'亭林园',coord:[120.95,31.39],type:'公园',area:'昆山市'}]}});
      return r.fulfill({status:503,json:{error:'测试：地图服务暂不可用'}});
    });
    await page.reload({waitUntil:'networkidle'});
    await page.locator('#origin').fill('江苏省 · 南京市');
    await page.locator('#draw').click();
    await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
    assert.equal(await page.locator('#result-title').innerText(),'昆山市');
    assert.match(await page.locator('#result-region').innerText(),/苏州市 · 昆山市/);
    assert.match(await page.locator('#map-status').innerText(),/地图服务暂不可用/);
    assert.equal(await page.locator('#places li').count(),1);
    assert.deepEqual(errors,[]);
    console.log('Browser checks passed: preview, repeat draw, invalid origin, mobile overflow, nationwide county-city result, map-error fallback.');
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
