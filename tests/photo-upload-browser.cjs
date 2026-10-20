const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

(async () => {
  const server = http.createServer(async (request, response) => {
    const target = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (!target.startsWith(root + path.sep)) return response.writeHead(403).end();
    try {
      const body = await fs.readFile(target);
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
      response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript(() => {
      window.__uploads = [];
      window.__rows = [];
      window.__holdUpload = false;
      window.supabase = { createClient: () => ({
        rpc: async () => ({ data: true }),
        auth: { getSession: async () => ({ data: { session: { user: { id: 'test-owner', email: 'local-test@example.com' } } } }), onAuthStateChange() {} },
        storage: { from: () => ({
          async upload(path, file) {
            if (window.__holdUpload) await new Promise(resolve => { window.__releaseUpload = resolve; });
            if (path.startsWith('cities/') && file.name === window.__failOnce) { window.__failOnce = null; return { error: { message: '模拟网络中断' } }; }
            window.__uploads.push({ path, type: file.type, name: file.name });
            return {};
          },
          getPublicUrl: path => ({ data: { publicUrl: `https://example.com/${path}` } })
        }) },
        from(table) {
          let filters = [], inserted = null;
          const result = () => {
            if (inserted && table === 'city_photos') window.__rows.push({ id: String(window.__rows.length), ...inserted, created_at: '2026-10-20' });
            return { data: (table === 'city_photos' ? window.__rows : []).filter(row => filters.every(([key, value]) => row[key] === value)), error: null };
          };
          const query = { select: () => query, order: () => query, eq: (key, value) => { filters.push([key, value]); return query; }, insert: data => { inserted = data; return query; }, then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject) };
          return query;
        }
      }) };
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${base}/admin.html#photos`, { waitUntil: 'networkidle' });
    await page.locator('#admin-app').waitFor({ state: 'visible' });
    await page.locator('#photo-city').selectOption('日照');
    assert(await page.locator('#upload-photos').isDisabled());
    const first = { name: 'image.jpeg', mimeType: 'image/jpeg', buffer: await fs.readFile(path.join(root, 'photos/东京/photo_1781500385381_1.jpg')) };
    const second = { name: 'image.jpeg', mimeType: 'image/jpeg', buffer: await fs.readFile(path.join(root, 'photos/东京/photo_1781500388563_2.jpg')) };
    await page.locator('#photo-files').setInputFiles(first);
    await page.waitForFunction(() => document.querySelectorAll('.photo-pending-item').length === 1 && !document.querySelector('#upload-photos').disabled);
    assert.equal(await page.evaluate(() => window.__uploads.length), 0, 'selection never uploads');

    const transfer = await page.evaluateHandle(payloads => {
      const data = new DataTransfer();
      for (const payload of payloads) data.items.add(new File([Uint8Array.from(atob(payload.data), char => char.charCodeAt(0))], payload.name, { type: payload.type }));
      return data;
    }, [second, first].map(file => ({ name: file.name, type: file.mimeType, data: file.buffer.toString('base64') })));
    await page.locator('#photo-dropzone').dispatchEvent('dragenter', { dataTransfer: transfer });
    assert.match(await page.locator('#photo-dropzone').getAttribute('class'), /is-dragover/);
    await page.locator('#photo-dropzone').dispatchEvent('dragover', { dataTransfer: transfer });
    await page.locator('#photo-dropzone').dispatchEvent('drop', { dataTransfer: transfer });
    await page.waitForFunction(() => document.querySelectorAll('.photo-pending-item').length === 2 && !document.querySelector('#upload-photos').disabled);
    assert.match(await page.locator('#photo-selection-status').innerText(), /跳过 1 张重复/);
    assert.equal(await page.locator('.photo-pending-item span').allTextContents().then(names => new Set(names).size), 1, 'different photos with same native filename are not lost');
    assert(!/is-dragover/.test(await page.locator('#photo-dropzone').getAttribute('class')));
    await page.locator('#photo-files').setInputFiles([]);
    assert.equal(await page.locator('.photo-pending-item').count(), 2, 'cancel does not clear pending photos');
    const invalid = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(new File(['heic'], 'phone.HEIC', { type: 'image/heic' }));
      data.items.add(new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'too-large.jpg', { type: 'image/jpeg' }));
      data.items.add(new File([], 'cloud.jpg', { type: 'image/jpeg' }));
      return data;
    });
    await page.locator('#photo-dropzone').dispatchEvent('drop', { dataTransfer: invalid });
    await page.waitForFunction(() => document.querySelector('#photo-selection-status').textContent.includes('未添加 3'));
    assert.match(await page.locator('#photo-selection-status').innerText(), /HEIC.*15 MB.*iCloud/s);
    assert.equal(await page.locator('.photo-pending-item').count(), 2);
    const link = await page.evaluateHandle(() => { const data = new DataTransfer(); data.setData('text/uri-list', 'https://invalid.example/private.jpg'); return data; });
    await page.locator('#photo-dropzone').dispatchEvent('drop', { dataTransfer: link });
    assert.match(await page.locator('#photo-selection-status').innerText(), /没有读取到照片文件/);
    await page.locator('.photo-pending-item button').first().click();
    assert.equal(await page.locator('.photo-pending-item').count(), 1);
    await page.locator('#photo-clear-pending').click();
    assert.equal(await page.locator('.photo-pending-item').count(), 0);
    assert(await page.locator('#upload-photos').isDisabled());

    const picker = page.waitForEvent('filechooser');
    await page.locator('#photo-choose-more').click();
    const chooser = await picker;
    assert(chooser.isMultiple());
    await chooser.setFiles([{ ...first, name: 'one.jpeg' }, { ...second, name: 'two.jpeg' }]);
    await page.waitForFunction(() => document.querySelectorAll('.photo-pending-item').length === 2 && !document.querySelector('#upload-photos').disabled);
    const qa = path.join(root, 'docs/qa/2026-10-20');
    await fs.mkdir(qa, { recursive: true });
    await page.locator('#photos').screenshot({ path: path.join(qa, 'photo-drop-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await page.locator('#photo-choose-more').evaluate(button => button.getBoundingClientRect().height >= 44));
    await page.locator('#photo-dropzone').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(qa, 'photo-drop-mobile.png') });
    await page.evaluate(() => { window.__holdUpload = true; window.__failOnce = 'two.jpeg'; });
    await page.locator('#upload-photos').click();
    assert(await page.locator('#photo-city').isDisabled());
    assert(await page.locator('#photo-clear-pending').isDisabled());
    assert(await page.locator('#photo-files').isDisabled());
    assert(await page.locator('.photo-pending-item button').first().isDisabled());
    await page.waitForFunction(() => typeof window.__releaseUpload === 'function');
    await page.evaluate(() => { window.__holdUpload = false; window.__releaseUpload(); });
    await page.waitForFunction(() => document.querySelector('#photo-admin-status').textContent.includes('已完成 1 张'));
    assert.equal(await page.locator('.photo-pending-item').count(), 1);
    assert.match(await page.locator('.photo-pending-item span').innerText(), /two.jpeg/);
    assert.equal(await page.evaluate(() => window.__rows.length), 1);
    await page.locator('#upload-photos').click();
    await page.waitForFunction(() => document.querySelector('#photo-admin-status').textContent.includes('1 张照片上传完成'));
    assert.equal(await page.locator('.photo-pending-item').count(), 0);
    assert.equal(await page.evaluate(() => window.__rows.length), 2);
    assert.deepEqual(await page.evaluate(() => window.__rows.map(row => row.city_name)), ['日照', '日照']);
    assert.equal(await page.evaluate(() => window.__uploads.filter(file => file.path.startsWith('cities/')).length), 2, 'retry does not re-upload a completed photo');
    assert(await page.locator('#photo-city').isEnabled());
    assert.deepEqual(errors, []);
    console.log('Photo upload checks passed: drop, multi-select, content dedup, removal, clear, validation, locked upload, partial retry, responsive layout. Local mock storage only; native Photos not exercised.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
