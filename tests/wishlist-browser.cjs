const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');

(async()=>{
  const server=http.createServer(async(req,res)=>{
    const file=path.resolve(root,`.${new URL(req.url,'http://localhost').pathname}`);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg'})[path.extname(file)]||'application/octet-stream'}).end(body);}
    catch{res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://**/*',route=>route.fulfill({contentType:'text/javascript',body:''}));
    await page.addInitScript(()=>{
      const tables={travel_wishlist:[{name:'瑞士',icon:'瑞',description:'后台瑞士文案',guide:'我的瑞士攻略',planned_time:'2027 国庆',priority_level:3,sort_order:2,is_hidden:false},
        {name:'未定位愿望',icon:'问',description:'尚未设置坐标',guide:'测试',priority_level:1,sort_order:50,is_hidden:false}]};
      window.__savedWishes=[];
      window.supabase={createClient:()=>({
        rpc:async()=>({data:true,error:null}),
        auth:{getSession:async()=>({data:{session:{user:{id:'11111111-1111-1111-1111-111111111111',email:'owner@example.com',is_anonymous:false}}},error:null}),onAuthStateChange:()=>{},signOut:async()=>({})},
        from:table=>{
          let filters=[],payload=null;
          const result=()=>{
            if(payload){window.__savedWishes.push(payload);tables[table]||=[];const index=tables[table].findIndex(x=>x.name===payload.name);if(index<0)tables[table].push(payload);else tables[table][index]=payload;}
            return {data:(tables[table]||[]).filter(x=>filters.every(([k,v])=>x[k]===v)),error:null};
          };
          const q={select:()=>q,order:()=>q,eq:(k,v)=>{filters.push([k,v]);return q;},upsert:p=>{payload=p;return q;},single:async()=>{const r=result();return {...r,data:r.data[0]||null};},maybeSingle:async()=>{const r=result();return {...r,data:r.data[0]||null};},then:(a,b)=>Promise.resolve(result()).then(a,b)};
          return q;
        }
      })};
      class Map{constructor(id){this.container=document.getElementById(id);}add(){}addControl(){}resize(){}setFitView(markers){this.container.dataset.fitCount=String(markers.length);}}
      class Marker{constructor(o){this.o=o;this.element=o.content;window.__markers.push(this);}setMap(map){this.element.remove();if(map)map.container.append(this.element);}getElement(){return this.element;}getContent(){return this.element;}}
      window.__markers=[];
      window.AMap={Map,Marker,ToolBar:class{},Polygon:class{setMap(){}on(){}},DistrictLayer:{Country:class{setStyles(){}show(){}hide(){}on(){}}}};
    });
    const base=`http://127.0.0.1:${server.address().port}`;
    await page.goto(base+'/index.html',{waitUntil:'networkidle'});
    await page.getByRole('tab',{name:/仍在期待/}).click();
    const swiss=page.locator('.amap-wishlist-marker-button[data-destination="瑞士"]');
    assert.equal(await swiss.count(),1);
    assert.equal(await swiss.getAttribute('data-priority'),'3');
    assert.match(await page.locator('#map-interaction-hint').innerText(),/1 个目的地尚未设置地图位置/);
    assert.deepEqual(await page.evaluate(()=>window.__markers.find(x=>x.o.title==='瑞士').o.position),[8.0341,46.6243]);
    await swiss.click();
    assert.equal(await page.locator('#guide-title').innerText(),'瑞士');
    assert.equal(await page.locator('#guide-description').innerText(),'后台瑞士文案');
    await page.goto(base+'/admin.html#wishes',{waitUntil:'networkidle'});
    await page.locator('#admin-app').waitFor({state:'visible'});
    await page.locator('#wish-picker').selectOption('瑞士');
    assert.equal(await page.locator('#wish-country').inputValue(),'瑞士');
    assert.equal(await page.locator('#wish-longitude').inputValue(),'8.0341');
    assert.equal(await page.locator('#wish-latitude').inputValue(),'46.6243');
    assert.equal(await page.locator('#wish-description').inputValue(),'后台瑞士文案');
    await page.locator('#wish-form button[type="submit"]').click();
    assert.match(await page.locator('#wish-status').innerText(),/地图位置已保存/);
    assert.equal(await page.evaluate(()=>window.__savedWishes[0].longitude),8.0341);
    await page.locator('#new-wish').click();
    assert.match(await page.locator('#wish-map-status').innerText(),/尚未定位/);
    await page.locator('#wish-name').fill('自定义愿望');
    await page.locator('#wish-icon').fill('新');
    await page.locator('#wish-description').fill('自定义文案');
    await page.locator('#wish-guide').fill('自定义攻略');
    await page.locator('#wish-country').fill('中国');
    await page.locator('#wish-longitude').fill('116.410244');
    await page.locator('#wish-form button[type="submit"]').click();
    assert.match(await page.locator('#wish-status').innerText(),/地图定位未完成/);
    assert.equal(await page.evaluate(()=>window.__savedWishes.length),1);
    await page.locator('#wish-latitude').fill('39.916404');
    await page.locator('#wish-coordinate-system').selectOption('GCJ-02');
    await page.locator('#wish-map-label').fill('我的地图标签');
    await page.locator('#wish-form button[type="submit"]').click();
    assert.match(await page.locator('#wish-status').innerText(),/地图位置已保存/);
    const saved=await page.evaluate(()=>window.__savedWishes[1]);
    assert.equal(saved.coordinate_system,'GCJ-02');
    assert.equal(saved.map_label,'我的地图标签');
    assert.equal(saved.longitude,116.410244);
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    console.log('Wishlist browser checks passed: backend Switzerland marker, preserved text, admin map editing, validation and mobile layout.');
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
