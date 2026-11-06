const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg' };

(async () => {
  const server = http.createServer(async (request, response) => {
    const target = path.resolve(root, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
    if (!target.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await fs.readFile(target);
      response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const launchOptions = { headless: true };
    if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const legacyBoundaryRequests = [];
    page.on('request', request => { if(request.url().includes('japan-visited-prefectures')) legacyBoundaryRequests.push(request.url()); });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: ''
    }));
    await page.addInitScript(() => {
      class FakeMap {
        constructor(id) {
          this.container = document.getElementById(id);
        }
        add() {}
        addControl() {}
        resize() {}
        setFitView(markers) {
          this.lastFitCount = markers.length;
          this.container.dataset.fitCount=String(markers.length);
        }
      }
      class FakeMarker {
        constructor(options) {
          this.options = options;
          this.element = options.content;
          this.map = null;
        }
        setMap(map) {
          this.element.remove();
          this.map = map;
          if (map) map.container.append(this.element);
        }
        getElement() { return this.element; }
        getContent() { return this.element; }
      }
      class FakeDistrictCountry {
        static instances = [];
        constructor(options) {
          this.options = options;
          this.visible = options.visible !== false;
          FakeDistrictCountry.instances.push(this);
        }
        setStyles(styles) { this.styles = styles; }
        show() { this.visible = true; }
        hide() { this.visible = false; }
        on(type, handler) { (this.handlers ||= {})[type] = handler; }
      }
      class FakeDistrictWorld extends FakeDistrictCountry {
        constructor(options) {
          super(options);
          this.world = true;
        }
      }
      window.__districtLayers = FakeDistrictCountry.instances;
      window.AMap = {
        Map: FakeMap,
        Marker: FakeMarker,
        ToolBar: class {},
        DistrictLayer: { Country: FakeDistrictCountry, World: FakeDistrictWorld }
      };
    });

    await page.goto(`${base}/index.html#hundred-cities`, {waitUntil:'networkidle'});
    await page.waitForSelector('.hundred-cell');
    assert.equal(await page.locator('.hundred-cell').count(),100);
    assert.equal(await page.locator('.hundred-cell.is-lit').count(),58);
    await page.locator('.hundred-cell.is-lit').last().click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.hundred-cell.is-lit').last().evaluate(el=>el===document.activeElement),true);
    for(const width of [390,768,1024,1440]) {
      await page.setViewportSize({width,height:1000});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.evaluate(()=>{document.activeElement.blur();window.scrollTo({top:0,behavior:'instant'});});
      await page.waitForTimeout(400);
      await page.screenshot({path:`docs/qa/2026-11-06/hundred-${width}.png`,fullPage:true});
    }
    await page.locator('.hundred-cell.is-lit').last().click();
    assert.equal(await page.locator('#hundred-city-title').textContent(),'重庆');
    await page.screenshot({path:'docs/qa/2026-11-06/hundred-drawer.png'});
    await page.getByRole('button',{name:'查看城市完整记录',exact:true}).click();
    assert(await page.locator('.hundred-drawer').isHidden());
    assert.equal(await page.locator('#dialog-title').textContent(),'重庆');
    await page.locator('#dialog-close').click();
    await page.locator('.desktop-nav a').first().click();
    await page.locator('#city-search').fill('东京');
    await page.locator('.desktop-nav [data-hundred-link]').click();
    assert.equal(await page.locator('.hundred-cell.is-lit').count(),58);
    await page.locator('.desktop-nav a').first().click();
    assert.equal(await page.locator('#city-search').inputValue(),'东京');
    await page.locator('.desktop-nav [data-hundred-link]').click();
    await page.locator('.hundred-filters button').nth(2).click();
    assert.equal(await page.locator('.hundred-cell').count(),42);
    await page.locator('.desktop-nav a').first().click();
    assert(await page.locator('#hundred-cities').isHidden());
    await page.goBack();
    assert(await page.locator('#hundred-cities').isVisible());
    assert.equal(await page.locator('.hundred-cell').count(),42);
    for (const total of [0,100,103]) {
      await page.route('**/assets/data.js*', async route => {
        const original = await fs.readFile(path.join(root,'assets/data.js'),'utf8');
        const fixture = Array.from({length:total},(_,i)=>({name:'测试城市'+i,country:'中国',date:'2020-01-01',coord:[118,32],desc:''}));
        await route.fulfill({contentType:'text/javascript',body:original+';window.TRAVEL_DATA.visits='+JSON.stringify(fixture)+';'});
      });
      await page.goto(`${base}/index.html?fixture=${total}#hundred-cities`,{waitUntil:'networkidle'});
      assert.equal(await page.locator('.hundred-cell.is-lit').count(),total);
      assert.equal(await page.locator('.hundred-progress progress').evaluate(el=>el.value),Math.min(total,100));
      assert.equal(await page.locator('.hundred-cell').count(),Math.max(total,100));
      await page.unroute('**/assets/data.js*');
    }
    assert.deepEqual(errors,[]);
    console.log('Hundred city browser checks passed');
  } finally { await browser?.close(); server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
