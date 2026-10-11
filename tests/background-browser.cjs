const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {BACKGROUNDS}=require('../assets/site-background.js');
const root=path.resolve(__dirname,'..');

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
      const styles=await page.locator('.hero').evaluate(el=>({hero:getComputedStyle(el,'::before').backgroundImage,body:getComputedStyle(document.body).backgroundImage,position:getComputedStyle(el,'::before').backgroundPosition}));
      assert(styles.hero.includes(bg.file));assert(styles.body.includes(bg.file));
      assert.deepEqual([...requests],[bg.file],'only the selected background is downloaded');
      assert.match(await page.locator('.hero-intro').innerText(),/火山云海与异国街巷/);
      if(process.env.BACKGROUND_PREVIEW_DIR)await page.screenshot({path:path.join(process.env.BACKGROUND_PREVIEW_DIR,`${bg.id}-desktop.jpg`),type:'jpeg',quality:85});
      await page.getByRole('tab',{name:/仍在期待/}).click();
      assert.equal(await page.locator('html').getAttribute('data-background-id'),bg.id);
      await page.getByRole('tab',{name:'旅行足迹',exact:true}).click();
      await page.setViewportSize({width:390,height:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const mobile=await page.locator('.hero').evaluate(el=>getComputedStyle(el,'::before').backgroundPosition);
      assert.equal(mobile,bg.mobilePosition.replace('center','50%'));
      if(process.env.BACKGROUND_PREVIEW_DIR)await page.screenshot({path:path.join(process.env.BACKGROUND_PREVIEW_DIR,`${bg.id}-mobile.jpg`),type:'jpeg',quality:85});
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
    await context.close();
    console.log('Background browser checks passed: all four photos, synchronized labels, one-photo loading, mobile crops, stable tab switching and failure fallback.');
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
