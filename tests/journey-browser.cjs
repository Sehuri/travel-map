const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

(async () => {
  const server = http.createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
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
    await page.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript(() => {
      window.__journeyMapLines = [];
      class FakeMap {
        constructor(container) {
          this.container = typeof container === 'string' ? document.getElementById(container) : container;
        }
        addControl() {}
        resize() {}
        setFitView(overlays) { this.fitCount = overlays.length; }
        setZoomAndCenter() {}
        getBounds() { return { contains: () => true }; }
        panTo() {}
        destroy() { this.container.replaceChildren(); }
      }
      class FakeMarker {
        constructor(options) {
          this.options = options;
          this.element = options.content;
        }
        setMap(map) { if (map) map.container.append(this.element); else this.element.remove(); }
        setzIndex(value) { this.zIndex = value; }
      }
      class FakePolyline {
        constructor(options) {
          this.options = { ...options };
          window.__journeyMapLines.push(this);
        }
        setMap(map) { this.map = map; }
        setOptions(options) { Object.assign(this.options, options); }
      }
      window.AMap = {
        Map: FakeMap,
        Marker: FakeMarker,
        Polyline: FakePolyline,
        Pixel: class { constructor(x, y) { this.x = x; this.y = y; } },
        ToolBar: class {},
        Scale: class {}
      };
    });
    await page.goto(`${base}/journey.html?slug=2026-japan-kansai-kanto`, { waitUntil: 'networkidle' });
    assert(await page.locator('#site-bgm-toggle').isDisabled());

    await page.locator('#journey-content').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#journey-title').innerText(), '2026 日本关西关东之旅');
    assert.equal(await page.locator('#journey-days').innerText(), '10 天');
    assert.equal(await page.locator('#journey-city-count').innerText(), '4 座');
    assert.equal(await page.locator('.journey-stop').count(), 4);
    assert.equal(await page.locator('.journey-transport').count(), 3);
    assert.equal(await page.locator('.journey-photo-grid figure').count(), 32);
    assert.match(await page.locator('.journey-stop a').first().getAttribute('href'), /index\.html\?city=%E5%A4%A7%E9%98%AA&visit=2026-02-03/);

    assert.equal(await page.locator('#route-replay-journey option').count(), 5);
    assert.equal(await page.locator('#route-replay-map').getAttribute('data-map-provider'), 'amap');
    assert.equal(await page.locator('#route-replay-map').getAttribute('data-segment-count'), '3');
    assert.equal(await page.locator('.route-map-stop').count(), 4);
    assert.equal(await page.locator('#route-replay-panel-city').innerText(), '大阪');
    assert.match(await page.locator('#route-replay-stay').innerText(), /停留 3 天/);
    assert.match(await page.locator('#route-replay-next-leg').innerText(), /JR 京都线/);
    await page.locator('#route-replay-next').click();
    assert.equal(await page.locator('#route-replay-panel-city').innerText(), '京都');
    assert.equal(await page.locator('#route-replay-map').getAttribute('data-travelled-segments'), '1');
    assert.equal(await page.locator('.route-map-stop.is-active').getAttribute('data-stop-index'), '1');
    assert.equal(await page.evaluate(() => window.__journeyMapLines[0].options.strokeStyle), 'solid');
    await page.locator('#route-replay-play').click();
    assert.equal(await page.locator('#route-replay-play').innerText(), '暂停');
    await page.locator('#route-replay-play').click();
    assert.equal(await page.locator('#route-replay-play').innerText(), '播放');
    assert.equal(await page.locator('#route-replay-share').innerText(), '分享这段路线 ↗');

    await page.goto(`${base}/journey.html?slug=2026-japan-kansai-kanto&replay=1&stop=3#route-replay`, { waitUntil: 'networkidle' });
    await page.locator('#journey-content').waitFor({ state: 'visible' });
    await page.waitForFunction(() => Math.abs(document.querySelector('#route-replay').getBoundingClientRect().top) < 2);
    assert.equal(await page.locator('#route-replay-panel-city').innerText(), '东京');

    const firstPhoto = page.locator('.journey-photo-grid button').first();
    await firstPhoto.click();
    await page.locator('#journey-lightbox').waitFor({ state: 'visible' });
    await page.locator('#journey-lightbox-close').click();
    await page.waitForFunction(() => document.querySelector('.journey-photo-grid button') === document.activeElement);

    await page.goto(`${base}/journey.html?slug=2026-ningbo-taizhou&replay=1#route-replay`, { waitUntil: 'networkidle' });
    await page.locator('#journey-content').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#journey-title').innerText(), '2026 浙东山海之旅');
    assert.equal(await page.locator('.journey-stop').count(), 2);
    assert.equal(await page.locator('#route-replay-map').getAttribute('data-segment-count'), '1');
    assert.equal(await page.locator('#route-replay-panel-city').innerText(), '宁波');
    assert.match(await page.locator('#route-replay-next-leg').innerText(), /高铁/);

    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(errors, []);
    console.log('Journey browser checks passed: route replay, controls, archive facts, linked photos, city links, and mobile layout.');
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
