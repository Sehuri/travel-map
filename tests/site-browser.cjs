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
    assert.equal(await page.locator('.amap-marker-button').count(), 53);
    assert.equal(await page.locator('.amap-wishlist-marker-button').count(), 0);
    assert(Number((await page.locator('#stat-travel-days').innerText()).replace(/,/g, '')) >= 4813);
    assert.match(await page.locator('#stat-trip-count').innerText(), /首站日照.*2013年7月9日.*今天/);
    assert.equal(await page.locator('#stat-distance').innerText(), '36,900');
    assert.equal(await page.locator('#stat-province-count').innerText(), '19');
    assert.equal(await page.locator('#stat-country-count').innerText(), '2');
    assert.equal(await page.locator('#stat-photo-count').innerText(), '67');
    assert.equal(await page.locator('.month-heat-cell').count(), 12);
    assert.equal(await page.locator('.journey-card').count(), 1);
    assert.match(await page.locator('.journey-card').innerText(), /2026 日本关西关东之旅.*大阪 → 京都 → 东京 → 镰仓/s);
    assert.match(await page.locator('.journey-card').getAttribute('href'), /journey\.html\?slug=2026-japan-kansai-kanto/);
    assert.equal(await page.locator('.memory-rewind-card').count(), 5);
    assert.notEqual(await page.locator('#memory-random-city').innerText(), '—');
    assert.match(await page.locator('#memory-journey-title').innerText(), /日本关西关东之旅/);
    assert.match(await page.locator('#memory-journey-days').innerText(), /\d+\s*天/);
    const randomCityBefore = await page.locator('#memory-random-city').innerText();
    await page.locator('#memory-random-refresh').click();
    assert.notEqual(await page.locator('#memory-random-city').innerText(), randomCityBefore);

    await page.locator('[data-stat-detail="provinces"]').click();
    assert.equal(await page.locator('#stats-dialog-title').innerText(), '省级地区覆盖');
    assert.equal(await page.locator('.coverage-detail-card').count(), 19);
    assert.equal(await page.locator('.stats-detail-pill.is-muted').count(), 15);
    await page.locator('#stats-dialog-close').click();

    await page.locator('[data-stat-detail="countries"]').click();
    assert.equal(await page.locator('.country-detail-card').count(), 2);
    assert.match(await page.locator('.country-detail-card').first().innerText(), /中国/);
    await page.locator('#stats-dialog-close').click();

    await page.locator('[data-stat-detail="repeats"]').click();
    assert(await page.locator('.stats-detail-empty').isVisible());
    await page.locator('#stats-dialog-close').click();

    await page.locator('[data-stat-detail="photos"]').click();
    assert.equal(await page.locator('.photo-archive-card').count(), 67);
    await page.locator('#photo-wall-city').selectOption('东京');
    assert(await page.locator('.photo-archive-card:visible').count() < 67);
    assert.equal(await page.locator('.photo-archive-card:visible').first().getAttribute('data-city'), '东京');
    await page.locator('#photo-wall-city').selectOption('');
    assert.match(await page.locator('.photo-archive-card figcaption').first().innerText(), /东京.*到访/s);
    await page.locator('.photo-archive-card button').first().click();
    await page.locator('#lightbox').waitFor({ state: 'visible' });
    await page.locator('#lightbox-close').click();
    await page.locator('#stats-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#stats-dialog-title').innerText(), '全部旅行照片');
    await page.waitForFunction(() => document.querySelector('.photo-archive-card button') === document.activeElement);
    await page.locator('#stats-dialog-close').click();

    await page.locator('#photo-cinema').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('#cinema-count').textContent.startsWith('01 / 67'));
    await page.locator('#cinema-next').click();
    await page.waitForFunction(() => document.querySelector('#cinema-count').textContent.startsWith('02 / 67'));
    await page.locator('#cinema-prev').click();
    await page.waitForFunction(() => document.querySelector('#cinema-count').textContent.startsWith('01 / 67'));
    await page.locator('#cinema-play').click();
    assert.equal(await page.locator('#cinema-play').getAttribute('aria-pressed'), 'true');
    await page.waitForFunction(() => document.querySelector('#cinema-count').textContent.startsWith('02 / 67'), null, { timeout: 15000 });
    await page.locator('#cinema-play').click();
    assert.equal(await page.locator('#cinema-play').getAttribute('aria-pressed'), 'false');
    await page.locator('#cinema-wall').click();
    assert(await page.locator('#stats-dialog').isVisible());
    await page.locator('#stats-dialog-close').click();

    await page.locator('.city-card[aria-label^="查看东京"]').click();
    assert.equal(await page.locator('#city-visit-total').innerText(), '1 次');
    assert.equal(await page.locator('#city-related-journeys a').count(), 1);
    assert.match(await page.locator('#city-related-journeys a').innerText(), /2026 日本关西关东之旅/);
    await page.locator('#photo-grid button').first().click();
    assert(await page.locator('#lightbox').evaluate(el => el.matches(':modal')));
    assert(await page.locator('#city-dialog').evaluate(el => el.open));
    await page.keyboard.press('Escape');
    assert(!(await page.locator('#lightbox').evaluate(el => el.open)));
    assert(await page.locator('#city-dialog').evaluate(el => el.open));
    await page.locator('#photo-grid button').first().click();
    await page.locator('#lightbox-close').click();
    assert(await page.locator('#city-dialog').evaluate(el => el.open));
    await page.locator('#dialog-close').click();

    await page.locator('#year-filter').selectOption('2026');
    assert.equal(await page.locator('.amap-marker-button').count(), 11);
    assert.equal(await page.locator('.city-card').count(), 11);
    assert.equal(await page.locator('#city-count').innerText(), '11');
    assert.equal(await page.locator('#route-city-count').innerText(), '11');
    assert.match(await page.locator('#map-interaction-hint').innerText(), /筛选后的 11 座城市/);
    assert.equal(await page.locator('.extreme-card').count(), 4);
    assert(await page.locator('#clear-filters').isVisible());

    await page.locator('#clear-filters').click();
    assert.equal(await page.locator('.amap-marker-button').count(), 53);
    assert.equal(await page.locator('#city-count').innerText(), '53');
    assert(!(await page.locator('#clear-filters').isVisible()));

    await page.getByRole('tab', { name: /仍在期待/ }).click();
    assert.equal(await page.locator('.amap-wishlist-marker-button').count(), 30);
    assert.equal(await page.locator('.amap-marker-button').count(), 0);
    assert.equal(await page.locator('.wish-priority-group').count(), 3);
    assert.match(await page.locator('.wish-priority-board').innerText(), /最想去 · 优先计划.*很想去 · 等待合适时机.*有机会去 · 慢慢收藏/s);
    assert.equal(await page.locator('.wish-card[data-priority="3"]').count(), 2);
    assert.equal(await page.locator('.wish-card[data-priority="2"]').count(), 22);
    assert.equal(await page.locator('.wish-card[data-priority="1"]').count(), 6);
    assert.equal(await page.locator('.amap-wishlist-marker-button[data-priority="3"]').count(), 2);
    assert.equal(await page.locator('.amap-wishlist-marker-button[data-priority="2"]').count(), 22);
    assert.equal(await page.locator('.amap-wishlist-marker-button[data-priority="1"]').count(), 6);
    assert.equal(await page.locator('#map-title').innerText(), '把愿望放到地图上');
    assert.match(await page.locator('#map-interaction-hint').innerText(), /光点越大代表越想去/);
    assert(await page.locator('.wishlist-map-link').isVisible());

    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.locator('.mobile-dock').isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.getByRole('tab', { name: '旅行足迹', exact: true }).click();
    await page.locator('#cinema-wall').click();
    assert.equal(await page.locator('.photo-archive-grid').evaluate(el => getComputedStyle(el).columnCount), '1');
    assert(await page.locator('#stats-dialog').evaluate(el => el.scrollWidth <= el.clientWidth));
    await page.locator('#stats-dialog .dialog-close').click();
    const firstYearToggle = page.locator('.year-toggle').first();
    const controlledId = await firstYearToggle.getAttribute('aria-controls');
    await firstYearToggle.click();
    assert.equal(await firstYearToggle.getAttribute('aria-expanded'), 'false');
    assert(await page.locator(`#${controlledId}`).isHidden());
    await firstYearToggle.click();
    assert.equal(await firstYearToggle.getAttribute('aria-expanded'), 'true');
    assert(await page.locator(`#${controlledId}`).isVisible());

    await page.evaluate(() => localStorage.setItem('sehuri.travelWishlist.v1', JSON.stringify([{
      name: '江苏省 · 昆山市', icon: '签', desc: '随机旅行候选', guide: '测试愿望',
      country: '中国', coord: [120.98, 31.38], coordinateSystem: 'GCJ-02', mapLabel: '昆山市'
    }])));
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#wishlist-count').innerText(), '31');
    await page.getByRole('tab', { name: /仍在期待/ }).click();
    assert.equal(await page.locator('.amap-wishlist-marker-button').count(), 31);
    assert(await page.locator('[data-destination="江苏省 · 昆山市"]').count());
    assert.equal(await page.locator('.wish-priority-group').count(), 3);
    assert.equal(await page.locator('.wish-card[data-priority="1"]').count(), 7);
    assert.equal(await page.locator('[data-destination="江苏省 · 昆山市"][data-priority="1"]').count(), 1);

    const dataSource = await fs.readFile(path.join(root, 'assets/data.js'), 'utf8');
    await page.route('**/assets/data.js*', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: `${dataSource}\nwindow.TRAVEL_DATA.guideDocuments = [
        { placeType: 'visited', placeName: '日照', title: '日照海滨攻略', fileType: 'pdf', fileUrl: 'https://example.com/rizhao-guide.pdf' },
        { placeType: 'wishlist', placeName: '新加坡', title: '新加坡自由行', fileType: 'html', fileUrl: 'https://dbmuozbkzkxgigblsgmz.supabase.co/storage/v1/object/public/travel-guides/wishlist/test-guide.html' }
      ];
      window.TRAVEL_DATA.visits.push({ ...window.TRAVEL_DATA.visits.find((visit) => visit.name === '南京'), date: '2026-09-11' });`
    }));
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('.city-card').count(), 54);
    assert.equal(await page.locator('.amap-marker-button').count(), 53);
    assert.equal(await page.locator('#city-count').innerText(), '53');
    assert.equal(await page.locator('#route-city-count').innerText(), '54');
    assert.match(await page.locator('#filter-summary').innerText(), /54 次到访 · 53 座城市/);
    assert.equal(await page.locator('#stat-repeat-city').innerText(), '南京');
    assert.match(await page.locator('#stat-repeat-count').innerText(), /到访 2 次/);
    assert.equal(await page.locator('#memory-return-city').innerText(), '南京');
    assert.equal(await page.locator('#memory-return-count').innerText(), '2 次');
    assert.match(await page.locator('#memory-return-comparison').innerText(), /2023 年第一次来到南京.*2026 年再次回到这里/s);
    await page.locator('[data-stat-detail="repeats"]').click();
    assert.equal(await page.locator('.repeat-detail-card').count(), 1);
    assert.match(await page.locator('.repeat-detail-card').innerText(), /2023-09-17.*2026-09-11/s);
    await page.locator('#stats-dialog-close').click();
    await page.locator('.city-card[aria-label="查看南京2026-09-11旅行详情"]').click();
    assert.match(await page.locator('#dialog-date').innerText(), /2026年9月11日/);
    assert.match(await page.locator('#dialog-description').innerText(), /六朝古都/);
    await page.locator('#dialog-close').click();
    await page.locator('.city-card[aria-label^="查看日照"]').click();
    const visitedGuide = page.locator('#city-guide-documents a');
    assert.equal(await visitedGuide.innerText(), 'PDF\n日照海滨攻略\n↗');
    assert.equal(await visitedGuide.getAttribute('href'), 'https://example.com/rizhao-guide.pdf');
    await page.locator('#dialog-close').click();
    await page.getByRole('tab', { name: /仍在期待/ }).click();
    await page.getByRole('button', { name: '查看新加坡旅行笔记' }).click();
    const wishlistGuide = page.locator('#wishlist-guide-documents a');
    assert.match(await wishlistGuide.innerText(), /HTML\s+新加坡自由行/);
    const viewerHref = await wishlistGuide.getAttribute('href');
    const viewerUrl = new URL(viewerHref);
    assert.equal(viewerUrl.pathname, '/guide-viewer.html');
    assert.equal(viewerUrl.searchParams.get('title'), '新加坡自由行');
    assert.match(viewerUrl.searchParams.get('src'), /\/travel-guides\/wishlist\/test-guide\.html$/);

    await page.route('https://dbmuozbkzkxgigblsgmz.supabase.co/storage/v1/object/public/travel-guides/wishlist/test-guide.html', (route) => route.fulfill({
      contentType: 'text/plain',
      body: '<!doctype html><html><head><meta charset="utf-8"><title>测试</title></head><body><h1>安全阅读器测试攻略</h1></body></html>'
    }));
    await page.goto(viewerHref, { waitUntil: 'networkidle' });
    await page.frameLocator('#guide-frame').getByText('安全阅读器测试攻略').waitFor();
    assert.equal(await page.locator('#viewer-title').innerText(), '新加坡自由行');

    assert.deepEqual(errors, []);
    console.log('Homepage browser checks passed: filters, maps, local wishes, mobile navigation, and visited/wishlist guide links.');
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
