const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { buildPages } = require('../scripts/build-pages.cjs');

const root = path.resolve(__dirname, '..');
const sdk = 'assets/vendor/supabase-js/2.57.4/supabase.js';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const slug = '2026-japan-kansai-kanto';
const id = '3e76c610-8dd9-4a97-8d30-eab35dd68e29';
const original = './photos/大阪/photo_1781503701952_1.jpg';
const indexedCover = '7368c3d13a5fab824174c50d-';
const stops = [
  { id: 'second', city_name: '京都', stop_order: 2, arrival_date: '2026-02-05', departure_date: '2026-02-06', journey_id: id },
  { id: 'first', city_name: '大阪', stop_order: 1, arrival_date: '2026-02-04', transport_to_next: '高铁', notes: '本次的停留记录', journey_id: id }
];
const journey = {
  id, slug, title: '公开旅程 · 测试', start_date: '2026-02-04', end_date: '2026-02-06',
  cover_url: original, is_published: true, summary: '首屏摘要', planning_notes: '先显示行前计划',
  accommodation: '测试住宿', companions: '同行人', budget_amount: 1200, budget_currency: 'CNY'
};
const wuxiId = '826c8de0-b3c6-4920-9b46-8e6d819cb164';
const wuxi = {
  id: wuxiId, slug: '2025-wuxi-shanghai', title: '2025 江南新春之旅',
  start_date: '2025-01-30', end_date: '2025-02-01', is_published: true,
  travel_journey_stops: [
    { journey_id: wuxiId, city_name: '无锡', stop_order: 0, arrival_date: '2025-01-30', departure_date: '2025-01-31', transport_to_next: '高铁' },
    { journey_id: wuxiId, city_name: '上海', stop_order: 1, arrival_date: '2025-02-01', departure_date: '2025-02-01' }
  ]
};
const chongqing = {
  id: '8202378c-72a8-4413-9e50-033deafa05c1', slug: '2026-chongqing', title: '2026 重庆之行',
  start_date: '2026-10-21', end_date: '2026-10-22', cover_url: original, is_published: true
};

(async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-loading-'));
  const artifact = path.join(temporary, 'pages');
  let server;
  let browser;
  try {
    await buildPages(root, artifact);
    const bytes = await fs.readFile(path.join(artifact, sdk));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), '7e94b62086deecef8c0ba3b38f514e2a1944ff6c81d92fb3ff967828c406c38f');
    assert((await fs.stat(path.join(artifact, path.dirname(sdk), 'LICENSE'))).size > 0);
    server = http.createServer(async (request, response) => {
      const url = new URL(request.url, 'http://localhost');
      const sitePath = decodeURIComponent(url.pathname.replace(/^\/travel-map\//, '/'));
      const file = path.resolve(artifact, `.${sitePath}`);
      if (!file.startsWith(artifact + path.sep)) return response.writeHead(403).end();
      try {
        const body = await fs.readFile(file);
        response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(body);
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const base = `${origin}/travel-map`;
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    // Leave the actual vendored SDK in place; only replace its network endpoint.
    await context.route('https://**/*', route => route.abort());
    await context.route('**/assets/supabase-config.js', route => route.fulfill({
      contentType: 'text/javascript',
      body: `window.SUPABASE_CONFIG={url:${JSON.stringify(origin + '/fixture')},publishableKey:'test-only'};`
    }));
    let mode = 'published';
    let holdGuide;
    let holdGallery;
    let holdCore;
    let rejectGuide = true;
    let rejectGallery = true;
    let publicationScenario = false;
    let wuxiPublished = true;
    const requests = [];
    const fail = (route, code = 'test_failure') => route.fulfill({ status: 500, json: { code, message: code } });
    await context.route('**/fixture/rest/v1/**', async route => {
      const url = new URL(route.request().url());
      const table = url.pathname.split('/').at(-1);
      const q = url.searchParams;
      requests.push({ table, q });
      if (table === 'travel_journeys') {
        if (publicationScenario) {
          assert.equal(q.get('is_published'), 'eq.true');
          if (!q.has('slug')) return route.fulfill({ json: wuxiPublished ? [chongqing, wuxi] : [chongqing] });
          if (q.get('slug') === `eq.${wuxi.slug}`) return route.fulfill({ json: wuxiPublished ? [wuxi] : [] });
          if (q.get('slug') !== `eq.${chongqing.slug}`) return route.fulfill({ json: [] });
          const stops = [{ journey_id: chongqing.id, city_name: '重庆', stop_order: 0, arrival_date: '2026-10-21', departure_date: '2026-10-22' }];
          return route.fulfill({ json: [{ ...chongqing, travel_journey_stops: stops }] });
        }
        if (!q.has('slug')) return route.fulfill({ json: [journey] });
        if (mode === 'timeout') {
          await holdCore.promise;
          return route.abort();
        }
        if (mode === 'failure') return fail(route);
        if (mode === 'withdrawn' || q.get('slug') === 'static-qa') return route.fulfill({ json: [] });
        if (q.get('select').includes('travel_journey_stops(')) {
          if (mode === 'separate') return fail(route, 'PGRST200');
          return route.fulfill({ json: [{ ...journey, travel_journey_stops: stops }] });
        }
        return route.fulfill({ json: [journey] });
      }
      if (table === 'travel_journey_stops') {
        return route.fulfill({ json: publicationScenario ? wuxi.travel_journey_stops : stops });
      }
      if (table === 'travel_journey_photos') {
        const record = { id: 'one', city_name: '大阪', image_url: original, caption: '相册里的原图', sort_order: 0 };
        if (publicationScenario && q.get('journey_id') === `eq.${wuxi.id}`) {
          return route.fulfill({ json: [{ ...record, journey_id: wuxiId, city_name: '上海', caption: '' }] });
        }
        if (q.has('city_name') || !q.has('journey_id')) return route.fulfill({ json: [record] });
        if (holdGallery) await holdGallery.promise;
        if (rejectGallery) return fail(route);
        return route.fulfill({ json: [record] });
      }
      if (table === 'travel_guides') {
        if (holdGuide) await holdGuide.promise;
        if (rejectGuide) return fail(route);
        return route.fulfill({ json: [
          { title: '旅程攻略 HTML', file_type: 'html', file_url: `${origin}/fixture/guide.html` },
          { title: '旅程攻略 PDF', file_type: 'pdf', file_url: `${origin}/fixture/guide.pdf` }
        ] });
      }
      if (table === 'travel_city_visits') return route.fulfill({ json: [{ id: 'visit', city_name: '大阪', visit_date: '2026-02-04' }] });
      return route.fulfill({ json: [] });
    });
    const page = await context.newPage();
    const pageErrors = [];
    const cdn = [];
    const coverRequests = [];
    let mapRequests = 0;
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.hostname === 'cdn.jsdelivr.net') cdn.push(request.url());
      if (url.hostname === 'webapi.amap.com' && url.pathname === '/maps') mapRequests++;
      if (decodeURIComponent(url.pathname).includes('1781503701952_1') || url.pathname.includes(indexedCover)) {
        coverRequests.push(decodeURIComponent(url.pathname));
      }
    });

    for (const prefix of ['', '/travel-map']) {
      for (const name of ['index', 'journey', 'journals', 'journal', 'journal-edit', 'admin', 'attractions']) {
        const responsePromise = page.waitForResponse(response => response.url() === `${origin}${prefix}/${sdk}`);
        await page.goto(`${origin}${prefix}/${name}.html`, { waitUntil: 'domcontentloaded' });
        assert.equal((await responsePromise).status(), 200);
        assert(await page.evaluate(() => {
          const client = window.supabase.createClient(location.origin, 'fixture', {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
          });
          return typeof client.from === 'function' && typeof client.auth.getSession === 'function'
            && typeof client.storage.from('fixture').download === 'function';
        }), `${prefix}/${name} loads the real UMD`);
      }
    }
    // Entry pages that use unrelated network services are exercised by their own suites.
    pageErrors.length = 0;
    const detail = `${base}/journey.html?slug=${slug}`;
    const waitForText = (selector, value) => page.locator(selector).filter({ hasText: value }).waitFor();
    let fixtureHomepage = false;
    await page.route('**/assets/data.js?*', async route => {
      const source = await fs.readFile(path.join(artifact, 'assets/data.js'), 'utf8');
      const appendix = fixtureHomepage
        ? 'window.TRAVEL_DATA.journeys = [];'
        : "window.TRAVEL_DATA.journeys.push({slug:'static-qa',title:'纯静态旅程样例',startDate:'2024-01-01',endDate:'2024-01-01',staticOnly:true});";
      await route.fulfill({ contentType: 'text/javascript', body: `${source}\n${appendix}` });
    });

    requests.length = 0;
    coverRequests.length = 0;
    mapRequests = 0;
    holdGuide = Promise.withResolvers();
    holdGallery = Promise.withResolvers();
    const releaseCover = Promise.withResolvers();
    const previewFilter = `**/photos/previews/v1/${indexedCover}*.webp`;
    // Delay the actual cover selected by the browser while showing the article.
    await page.route(previewFilter, async route => {
      await releaseCover.promise;
      await route.continue();
    });
    await page.goto(detail, { waitUntil: 'domcontentloaded' });
    await waitForText('#journey-title', journey.title);
    assert.equal(await page.locator('#journey-planning').textContent(), '先显示行前计划');
    assert.equal(await page.locator('.journey-stop a').first().textContent(), '大阪');
    assert.equal(await page.locator('#journey-cover').evaluate(img => img.naturalWidth), 0);
    assert.equal(requests[0].table, 'travel_journeys');
    assert.equal(requests[0].q.get('slug'), `eq.${slug}`);
    assert.equal(requests[0].q.get('is_published'), 'eq.true');
    assert(requests[0].q.get('select').includes('travel_journey_stops('));
    assert(!requests.some(({ table }) => ['travel_wishlist', 'travel_journey_stops', 'travel_journey_photos', 'city_photos'].includes(table)));
    assert.equal(mapRequests, 0);
    await waitForText('#journey-guide-status', '正在加载');
    await page.waitForFunction(() => new URL(document.querySelector('.journey-stop a').href).searchParams.get('visit') === '2026-02-04');
    assert(requests.some(({ table, q }) => table === 'travel_city_visits' && q.get('city_name').includes('大阪')));
    assert(requests.some(({ table, q }) => table === 'travel_guides' && q.get('place_type') === 'eq.journey' && q.get('place_name').includes(id)));
    assert(requests.some(({ table, q }) => table === 'travel_journeys' && !q.has('slug') && !q.get('select').includes('summary,')));

    releaseCover.resolve();
    await page.waitForFunction(() => document.querySelector('#journey-cover').naturalWidth > 0);
    let selectedCover = await page.locator('#journey-cover').evaluate(img => img.currentSrc);
    assert.match(selectedCover, /\.webp$/);
    console.log('Indexed example detail cover:', decodeURIComponent(new URL(selectedCover).pathname));
    holdGuide.resolve();
    await page.locator('#journey-guide-retry').waitFor();
    assert(await page.locator('#journey-title').isVisible());
    rejectGuide = false;
    await page.locator('#journey-guide-retry').click();
    await page.getByRole('link', { name: /旅程攻略 HTML/ }).waitFor();
    assert.match(await page.getByRole('link', { name: /旅程攻略 HTML/ }).getAttribute('href'), /\/travel-map\/guide-viewer\.html/);
    assert.equal(await page.getByRole('link', { name: /旅程攻略 PDF/ }).getAttribute('href'), `${origin}/fixture/guide.pdf`);

    await page.locator('#journey-photos-title').scrollIntoViewIfNeeded();
    await waitForText('#journey-photo-status', '正在加载');
    assert.equal(await page.locator('#journey-photo-count').textContent(), '');
    holdGallery.resolve();
    await page.locator('#journey-photo-retry').waitFor();
    assert.equal(await page.locator('#journey-photo-count').textContent(), '');
    rejectGallery = false;
    await page.locator('#journey-photo-retry').click();
    await waitForText('#journey-photo-count', '1 张');
    assert(requests.some(({ table, q }) => table === 'travel_journey_photos' && q.get('journey_id') === `eq.${id}` && !q.has('city_name')));
    const originalURL = new URL(original, detail).href;
    const rejectOriginal = url => url.href === originalURL;
    await page.route(rejectOriginal, route => route.fulfill({ status: 404 }));
    await page.locator('.journey-photo-grid button').click();
    await page.locator('#journey-lightbox-close').waitFor();
    const lightbox = page.locator('#journey-lightbox-image');
    await lightbox.evaluate(img => img.decode());
    assert.match(await lightbox.evaluate(img => img.currentSrc), /\/photos\/previews\/v1\//);
    await page.keyboard.press('Escape');
    await page.unroute(rejectOriginal);
    assert(await page.locator('#journey-lightbox').isHidden());
    assert(await page.locator('.journey-photo-grid button').evaluate(button => button === document.activeElement));

    holdGuide = null;
    holdGallery = null;
    await page.goto(`${detail}&replay=1&stop=2#route-replay`, { waitUntil: 'domcontentloaded' });
    await waitForText('#route-replay-panel-city', '京都');
    await page.locator('#journey-map-retry').waitFor();
    assert(mapRequests > 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await page.locator('#journey-cover').evaluate(img => !img.hasAttribute('src')));
    await page.locator('#route-replay-previous').click();
    await waitForText('#route-replay-panel-city', '大阪');

    mode = 'separate';
    requests.length = 0;
    await page.goto(detail, { waitUntil: 'domcontentloaded' });
    await waitForText('#journey-title', journey.title);
    assert(requests.some(({ table, q }) => table === 'travel_journey_stops' && q.get('journey_id') === `eq.${id}`));

    mode = 'withdrawn';
    await page.goto(detail, { waitUntil: 'domcontentloaded' });
    await waitForText('#journey-load-status', '当前不可用');
    assert(await page.locator('#journey-content').isHidden());
    assert(await page.locator('#journey-load-retry').isHidden());
    await page.goto(`${base}/journey.html?slug=static-qa`, { waitUntil: 'domcontentloaded' });
    await waitForText('#journey-title', '纯静态旅程样例');

    mode = 'failure';
    await page.goto(detail, { waitUntil: 'domcontentloaded' });
    await page.locator('#journey-load-retry').waitFor();
    assert(await page.locator('#journey-content').isHidden());
    mode = 'published';
    await page.locator('#journey-load-retry').click();
    await waitForText('#journey-title', journey.title);

    mode = 'timeout';
    holdCore = Promise.withResolvers();
    await page.goto(detail, { waitUntil: 'domcontentloaded' });
    await waitForText('#journey-load-status', '正在打开');
    await page.locator('#journey-load-retry').waitFor({ timeout: 11000 });
    holdCore.resolve();
    mode = 'published';

    await page.unroute(previewFilter);
    coverRequests.length = 0;
    await page.route(previewFilter, route => route.fulfill({ status: 404, body: 'missing preview' }));
    await page.goto(detail, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#journey-cover').naturalWidth > 0);
    selectedCover = await page.locator('#journey-cover').evaluate(img => img.currentSrc);
    assert.match(selectedCover, /1781503701952_1\.jpg$/);
    assert.equal(coverRequests.filter(url => url.endsWith('.jpg')).length, 1);

    await page.route('**/photos/**/photo_1781503701952_1.jpg', route => route.fulfill({ status: 404, body: 'missing original' }));
    await page.goto(detail, { waitUntil: 'domcontentloaded' });
    await waitForText('#journey-cover-status', '封面暂时无法载入');
    assert.equal(await page.locator('#journey-title').textContent(), journey.title);
    assert.deepEqual(pageErrors, []);

    await page.unroute(previewFilter);
    await page.unroute('**/photos/**/photo_1781503701952_1.jpg');
    fixtureHomepage = true;
    await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
    const firstCard = page.locator('#journey-card-grid .journey-card').first();
    await firstCard.filter({ hasText: journey.title }).waitFor();
    assert.equal(await firstCard.locator('img').getAttribute('src'), null, 'a featured cover below the fold does not compete with the initial view');
    await firstCard.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('#journey-card-grid .journey-card img')?.naturalWidth > 0);
    const homepageCover = await firstCard.locator('img').evaluate(img => ({ url: img.currentSrc, priority: img.fetchPriority }));
    assert.match(homepageCover.url, /\.webp$/);
    assert.equal(homepageCover.priority, 'high');
    assert.match(await firstCard.getAttribute('href'), new RegExp(slug));
    console.log('Indexed example homepage cover:', decodeURIComponent(new URL(homepageCover.url).pathname));

    publicationScenario = true;
    await page.unroute('**/assets/data.js?*');
    await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
    const links = page.locator('#journey-card-grid .journey-card');
    await page.waitForFunction(() => document.querySelectorAll('#journey-card-grid .journey-card').length === 2);
    const urls = await links.evaluateAll(cards => cards.map(card => card.href));
    assert.deepEqual(urls.map(url => new URL(url).searchParams.get('slug')), [chongqing.slug, wuxi.slug]);
    assert.match(await links.nth(1).textContent(), /2025 江南新春之旅/);
    await page.goto(urls[0], { waitUntil: 'domcontentloaded' });
    await waitForText('#journey-title', chongqing.title);
    await page.waitForFunction(cover => document.querySelector('#journey-cover')?.dataset.photoOriginal === cover, chongqing.cover_url);
    await page.waitForFunction(() => [...document.querySelector('#route-replay-journey').options].some(option => option.value === '2025-wuxi-shanghai'));
    await page.locator('#route-replay-journey').selectOption(wuxi.slug);
    await waitForText('#journey-title', '2025 江南新春之旅');
    assert.deepEqual(await page.locator('.journey-stop a').allTextContents(), ['无锡', '上海']);
    assert(requests.some(({ table, q }) => table === 'travel_journeys' && q.get('slug') === `eq.${wuxi.slug}`));
    await page.locator('#journey-photos-title').scrollIntoViewIfNeeded();
    await waitForText('#journey-photo-count', '1 张');
    assert.equal(await page.locator('#journey-photo-grid figcaption').textContent(), '上海');
    assert(requests.some(({ table, q }) => table === 'travel_journey_photos' && q.get('journey_id') === `eq.${wuxi.id}`));
    wuxiPublished = false;
    await page.goto(urls[1], { waitUntil: 'domcontentloaded' });
    await waitForText('#journey-load-status', '当前不可用');
    assert.deepEqual(cdn, []);
    console.log('Built Pages SDK at both paths, scoped journey requests, independent failures, retries, fallback policy, cover fallback and lightbox checks passed.');
  } finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await fs.rm(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
