const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {BACKGROUNDS}=require('../assets/site-background.js');
const root=path.resolve(__dirname,'..');

async function readBackground(page){
  assert.equal(await page.locator('.site-background').count(),1);
  return page.locator('.site-background').evaluate(el=>{
    const style=getComputedStyle(el),rect=el.getBoundingClientRect(),hero=document.querySelector('.hero');
    return {
      image:style.backgroundImage,position:style.backgroundPosition,size:style.backgroundSize,
      positioning:style.position,pointerEvents:style.pointerEvents,isolation:getComputedStyle(document.body).isolation,
      bounds:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},
      bodyImage:getComputedStyle(document.body).backgroundImage,
      heroImages:hero?[getComputedStyle(hero).backgroundImage,getComputedStyle(hero,'::before').backgroundImage,getComputedStyle(hero,'::after').backgroundImage]:[]
    };
  });
}
async function checkBackground(page,bg,mobile=false){
  const state=await readBackground(page);
  assert(state.image.includes(bg.file));
  assert.equal(state.position,(mobile?bg.mobilePosition:bg.desktopPosition).replace('center','50%'));
  assert.equal(state.positioning,'fixed');assert.equal(state.size,'cover');
  assert.equal(state.pointerEvents,'none');assert.equal(state.isolation,'isolate');
  assert.deepEqual(state.bounds,{left:0,top:0,...page.viewportSize()});
  assert.equal(state.bodyImage,'none');assert(state.heroImages.every(x=>x==='none'));
  return state;
}
async function checkScroll(page,expected){
  const before=await page.evaluate(()=>scrollY);
  await page.mouse.move(5,100);
  await page.mouse.wheel(0,550);
  await page.waitForFunction(previous=>scrollY>previous+10,before);
  assert.deepEqual(await readBackground(page),expected,'scrolling content must not move, enlarge or recrop the photo');
}
async function scrollTop(page){await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));}
async function preview(page,name){
  if(process.env.BACKGROUND_PREVIEW_DIR)await page.screenshot({path:path.join(process.env.BACKGROUND_PREVIEW_DIR,name+'.jpg'),type:'jpeg',quality:85});
}

(async()=>{
  const server=http.createServer(async(req,res)=>{
    const file=path.resolve(root,`.${new URL(req.url,'http://localhost').pathname}`);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg'})[path.extname(file)]||'application/octet-stream'}).end(bytes);}
    catch{res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    const base=`http://127.0.0.1:${server.address().port}`;
    if(process.env.BACKGROUND_PREVIEW_DIR)await fs.mkdir(process.env.BACKGROUND_PREVIEW_DIR,{recursive:true});
    for(const [index,bg]of BACKGROUNDS.entries()){
      const context=await browser.newContext({viewport:{width:1440,height:900}});
      await context.addInitScript(value=>{Math.random=()=>value;},(index+.1)/4);
      const page=await context.newPage(),errors=[],requests=new Set();
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>{const file=new URL(r.url()).pathname.split('/').pop();if(BACKGROUNDS.some(x=>x.file===file))requests.add(file);});
      await page.route('https://**/*',r=>r.fulfill({contentType:'text/javascript',body:''}));
      await page.goto(base+'/index.html',{waitUntil:'networkidle'});
      await page.evaluate(()=>window.TRAVEL_BACKGROUND.ready);
      assert.equal(await page.locator('html').getAttribute('data-background-id'),bg.id);
      assert.equal(await page.locator('[data-background-caption]').innerText(),bg.label);
      const desktop=await checkBackground(page,bg);
      assert.deepEqual([...requests],[bg.file],'only the selected background is downloaded');
      assert.match(await page.locator('.hero-intro').innerText(),/火山云海与异国街巷/);
      await preview(page,`${bg.id}-desktop`);
      await page.locator('[data-home-tab-target="wishlist"]:visible').first().click();
      assert.equal(await page.locator('html').getAttribute('data-background-id'),bg.id);
      assert(await page.locator('.hero').evaluate(el=>el.offsetHeight>innerHeight),'wishlist should exercise a section taller than the viewport');
      assert.deepEqual(await readBackground(page),desktop,'expanding the wishlist must not enlarge the photo');
      await scrollTop(page);await checkScroll(page,desktop);
      await preview(page,`${bg.id}-wishlist-desktop`);
      await page.locator('[data-home-tab-target="journeys"]:visible').first().click();
      await page.evaluate(()=>window.scrollTo({top:document.querySelector('.hero').offsetHeight-innerHeight/2,behavior:'instant'}));
      assert.deepEqual(await readBackground(page),desktop);
      await preview(page,`${bg.id}-transition-desktop`);
      await checkScroll(page,desktop);
      await page.setViewportSize({width:390,height:844});
      await scrollTop(page);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const mobile=await checkBackground(page,bg,true);
      await preview(page,`${bg.id}-mobile`);
      await page.locator('[data-home-tab-target="wishlist"]:visible').first().click();
      assert.deepEqual(await readBackground(page),mobile);
      await scrollTop(page);await checkScroll(page,mobile);
      await preview(page,`${bg.id}-wishlist-mobile`);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.goto(base+'/discover.html',{waitUntil:'networkidle'});
      await page.evaluate(()=>window.TRAVEL_BACKGROUND.ready);
      const discoverMobile=await checkBackground(page,bg,true);
      await checkScroll(page,discoverMobile);
      await page.setViewportSize({width:1440,height:900});await scrollTop(page);
      const discoverDesktop=await checkBackground(page,bg);
      await checkScroll(page,discoverDesktop);
      assert.deepEqual([...requests],[bg.file],'tabs and scrolling must not load another background');
      assert.deepEqual(errors,[]);
      await context.close();
    }
    const context=await browser.newContext();
    await context.addInitScript(()=>{Math.random=()=>.3;});
    const page=await context.newPage();
    await page.route('https://**/*',r=>r.fulfill({contentType:'text/javascript',body:''}));
    await page.route('**/bromo-sunrise-hero.jpg',r=>r.abort());
    await page.goto(base+'/index.html',{waitUntil:'networkidle'});
    await page.evaluate(()=>window.TRAVEL_BACKGROUND.ready);
    assert.equal(await page.locator('html').getAttribute('data-background-id'),'osaka');
    assert.equal(await page.locator('[data-background-caption]').innerText(),BACKGROUNDS[0].label);
    await checkBackground(page,BACKGROUNDS[0]);
    await context.close();
    console.log('Background browser checks passed: all four photos, one viewport-fixed layer, invariant framing through long wishlists and wheel scrolling, desktop/mobile home and discover pages, synchronized labels, one-photo loading and failure fallback.');
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
