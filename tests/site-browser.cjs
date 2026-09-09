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
        setStyles(styles) { this.styles = styles; }
        on() {}
      }
      window.AMap = {
        Map: FakeMap,
        Marker: FakeMarker,
        ToolBar: class {},
        DistrictLayer: { Country: FakeDistrictCountry }
      };
    });

    await page.goto(`${base}/index.html?qa=site-browser`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.amap-marker-button').count(), 52);
    assert.equal(await page.locator('.amap-wishlist-marker-button').count(), 0);

    await page.locator('#year-filter').selectOption('2026');
    assert.equal(await page.locator('.amap-marker-button').count(), 11);
    assert.equal(await page.locator('.city-card').count(), 11);
    assert.equal(await page.locator('#city-count').innerText(), '11');
    assert.equal(await page.locator('#route-city-count').innerText(), '11');
    assert.match(await page.locator('#map-interaction-hint').innerText(), /筛选后的 11 座城市/);
    assert.equal(await page.locator('.extreme-card').count(), 4);
    assert(await page.locator('#clear-filters').isVisible());

    await page.locator('#clear-filters').click();
    assert.equal(await page.locator('.amap-marker-button').count(), 52);
    assert.equal(await page.locator('#city-count').innerText(), '52');
    assert(!(await page.locator('#clear-filters').isVisible()));

    await page.getByRole('tab', { name: /仍在期待/ }).click();
    assert.equal(await page.locator('.amap-wishlist-marker-button').count(), 22);
    assert.equal(await page.locator('.amap-marker-button').count(), 0);
    assert.equal(await page.locator('#map-title').innerText(), '把愿望放到地图上');
    assert(await page.locator('.wishlist-map-link').isVisible());

    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.locator('.mobile-dock').isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.getByRole('tab', { name: '旅行足迹', exact: true }).click();
    const firstYearToggle = page.locator('.year-toggle').first();
    const controlledId = await firstYearToggle.getAttribute('aria-controls');
    await firstYearToggle.click();
    assert.equal(await firstYearToggle.getAttribute('aria-expanded'), 'false');
    assert(await page.locator(`#${controlledId}`).isHidden());
    await firstYearToggle.click();
    assert.equal(await firstYearToggle.getAttribute('aria-expanded'), 'true');
    assert(await page.locator(`#${controlledId}`).isVisible());

    assert.deepEqual(errors, []);
    console.log('Homepage browser checks passed: filter-map sync, reset, wishlist map, mobile navigation, overflow, and year collapse.');
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
