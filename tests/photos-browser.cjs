const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');

(async () => {
    const types = { '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
  const server = http.createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') return response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<!doctype html><html><head><meta charset="utf-8"></head><body><script src="/assets/photos.js"></script><script src="/assets/photo-previews.js"></script><script src="/assets/photo-preview.js"></script></body></html>');
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
    try {
      const body = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(body);
    }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const page = await browser.newPage();
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base, { waitUntil: 'networkidle' });
    const portrait = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#4a8ac4' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const upload = await page.evaluate(async base64 => {
      const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      const file = new File([bytes], 'portrait.jpg', { type: 'image/jpeg' });
      const calls = [];
      const storage = { async upload(path, blob, options) {
        const image = await createImageBitmap(blob);
        calls.push({ path, width: image.width, height: image.height, bytes: blob.size, type: blob.type, options, original: blob === file });
        image.close();
        return {};
      } };
      const result = await window.TRAVEL_PHOTOS.uploadOriginal(storage, file, 'unique.jpg');
      return { ...result, calls, originalSize: file.size };
    }, portrait.toString('base64'));
    assert.equal(upload.previewWarning, false);
    assert.equal(upload.path, 'cities/pv1-1600x2400-unique.jpg', 'EXIF portrait orientation must be applied');
    assert.equal(upload.calls.length, 4);
    assert.deepEqual(upload.calls.slice(0, 3).map(call => [call.width, call.height, call.type]), [[480, 720, 'image/webp'], [960, 1440, 'image/webp'], [1600, 2400, 'image/webp']]);
    assert(upload.calls[3].original, 'original File object is uploaded unchanged');
    assert.equal(upload.calls[3].bytes, portrait.length);
    assert(upload.calls.every(call => call.options.upsert === false && call.options.cacheControl === '31536000'));

    const failure = await page.evaluate(async base64 => {
      const file = new File([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], 'portrait.jpg', { type: 'image/jpeg' });
      const calls = [];
      const result = await window.TRAVEL_PHOTOS.uploadOriginal({ async upload(path, blob) {
        calls.push({ path, original: blob === file });
        return path.includes('.960.webp') ? { error: new Error('simulated quota error') } : {};
      } }, file, 'partial.jpg');
      return { ...result, calls };
    }, portrait.toString('base64'));
    assert(failure.previewWarning);
    assert.equal(failure.path, 'cities/partial.jpg', 'incomplete preview sets must never be advertised');
    assert(failure.calls.at(-1).original);

    const fallback = await page.evaluate(async () => {
      const original = window.PHOTO_MANIFEST['东京'][0];
      window.PHOTO_PREVIEWS = { photos: { [original]: { variants: [{ url: './missing-preview.webp', width: 480, height: 320 }] } } };
      const image = document.createElement('img');
      let failures = 0;
      image.addEventListener('error', () => failures++);
      document.body.append(image);
      const loaded = new Promise((resolve, reject) => { image.onload = resolve; setTimeout(() => reject(new Error('fallback timeout')), 5000); });
      window.TRAVEL_PHOTOS.setImage(image, original, { loading: 'eager' });
      await loaded;
      return { failures, src: image.getAttribute('src'), width: image.naturalWidth, original };
    });
    assert.equal(fallback.failures, 0, 'missing preview is intercepted before unavailable UI handlers');
    assert.equal(fallback.src, fallback.original);
    assert(fallback.width > 0);
    console.log('Photo browser checks passed: real WebP encoding, EXIF orientation, unchanged originals, unique cached uploads and preview failure fallback. No real backend writes.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
