const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=http.createServer(async(req,res)=>{
    const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    try{res.writeHead(200,{'Content-Type':{'.js':'text/javascript','.css':'text/css','.html':'text/html'}[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:`
      window.testWrites=0;window.testOffline=false;
      window.supabase={createClient(){return {auth:{async getSession(){return {data:{session:{user:{id:'visitor'}}}};}},from(table){
        const filters=[];let payload;const query={select(){return query},eq(k,v){filters.push([k,v]);return query},in(){return query},insert(p){payload=p;return query},async then(resolve){
          if(window.testOffline)return resolve({error:{code:'offline'}});
          const data=window.TRAVEL_ATTRACTION_DATA.attractions,votes=JSON.parse(localStorage.getItem('testVotes')||'[]');
          if(payload){window.testWrites++;if(votes.some(v=>v.attraction_id===payload.attraction_id))return resolve({error:{code:'23505'}});votes.push(payload);localStorage.setItem('testVotes',JSON.stringify(votes));return resolve({data:null});}
          if(table==='travel_attractions')return resolve({data:data.filter(a=>filters.every(([k,v])=>(k==='city_name'?a.city:a[k])===v)).map(a=>({id:a.id,city_name:a.city,country:a.country,name:a.name,reference_url:a.referenceUrl}))});
          if(table==='attraction_votes')return resolve({data:votes});
          return resolve({data:[{attraction_id:data.find(a=>a.city==='东京').id,tier:'top',vote_count:3},...votes.map(v=>({...v,vote_count:1}))]});
        }};return query;}}}};
    `}));
    const base='http://127.0.0.1:'+server.address().port;
    await page.goto(base+'/attractions.html?city=东京',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.querySelector('#attraction-service-status').textContent.includes('已更新'));
    assert.equal(await page.locator('#attraction-city').innerText(),'东京');
    const card=page.locator('.attraction-card').first();assert.match(await card.innerText(),/3 人已评价/);
    await card.locator('label').filter({hasText:'夯'}).click();await card.locator('button').click();
    await page.waitForFunction(()=>document.querySelector('.vote-submit').textContent.includes('已评价'));
    assert.equal(await page.evaluate(()=>window.testWrites),1);assert(await card.locator('button').isDisabled());
    assert.match(await card.locator('.vote-distribution').innerText(),/75%/);
    await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('.vote-submit').textContent.includes('已评价'));
    assert(await card.locator('input').first().isDisabled());
    await page.locator('#attraction-filter').selectOption('voted');assert.equal(await page.locator('.attraction-card').count(),1);
    await page.locator('#attraction-filter').selectOption('all');await page.locator('#attraction-search').fill('浅草寺');assert.equal(await page.locator('.attraction-card').count(),1);
    await page.locator('#attraction-search').fill('');await page.screenshot({path:path.join(os.tmpdir(),'travel-attractions-desktop.png')});
    await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(os.tmpdir(),'travel-attractions-mobile.png')});
    await page.locator('#attraction-city-select').selectOption(JSON.stringify(['南京','中国']));
    await page.waitForFunction(()=>document.querySelector('#attraction-service-status').textContent.includes('已更新'));
    assert.match(await page.locator('.vote-total').first().innerText(),/暂无评价/);
    await page.evaluate(()=>window.testOffline=true);await page.locator('#attraction-refresh').click();
    await page.waitForFunction(()=>document.querySelector('#attraction-service-status').classList.contains('error'));
    assert.match(await page.locator('.vote-total').first().innerText(),/暂不可用/);assert(await page.locator('.vote-submit').first().isDisabled());
    assert.deepEqual(errors,[]);console.log('Attraction browser checks passed (votes, persistence, filters, cities, mobile, offline).');
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
