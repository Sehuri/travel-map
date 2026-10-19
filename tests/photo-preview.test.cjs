const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function fixture(manifest = { photos: {} }) {
  const window = { PHOTO_PREVIEWS: manifest, SUPABASE_CONFIG: { url: 'https://project.supabase.co' }, document: { baseURI: 'https://example.com/travel-map/index.html' } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/photo-preview.js'), 'utf8'), { window, URL, setTimeout, clearTimeout });
  const image = {
    dataset: {}, listeners: [],
    addEventListener(type, handler) { this.listeners.push(handler); },
    removeEventListener(type, handler) { this.listeners = this.listeners.filter(item => item !== handler); },
    removeAttribute(key) { delete this[key]; }
  };
  return { api: window.TRAVEL_PHOTOS, window, image };
}

const variants = [480, 960, 1600].map(width => ({ url: `./photos/previews/test-${width}.webp`, width, height: Math.round(width * 2 / 3) }));

test('preview selection is screen-sized, responsive and preserves original identity', () => {
  const { api, image } = fixture({ photos: { './photos/a.jpg': { variants } } });
  api.setImage(image, './photos/a.jpg');
  assert.equal(image.src, variants[0].url);
  assert.equal(image.loading, 'lazy');
  assert.equal(image.decoding, 'async');
  assert.equal(image.dataset.photoOriginal, './photos/a.jpg');
  assert.match(image.srcset, /480w.*960w/);
  assert.doesNotMatch(image.srcset, /1600w/);
  assert.equal(api.urlFor('https://example.com/travel-map/photos/a.jpg', 'large'), variants[2].url);
  api.setImage(image, './photos/a.jpg', { size: 'cover', loading: 'eager' });
  assert.equal(image.loading, 'eager');
  assert.match(image.srcset, /1600w/);
  assert.equal(image.src, variants[1].url);
  api.setImage(image, './photos/a.jpg', { size: 'thumb' });
  assert.equal(image.srcset, undefined, 'a recycled image must not retain old responsive sources');
});

test('missing previews fall back once, without triggering the final unavailable state', () => {
  const { api, image } = fixture({ photos: { './photos/a.jpg': { variants } } });
  api.setImage(image, './photos/a.jpg');
  let stopped = false;
  image.listeners[0]({ stopImmediatePropagation() { stopped = true; } });
  assert(stopped);
  assert.equal(image.src, './photos/a.jpg');
  assert.equal(image.srcset, undefined);
  assert.equal(image.listeners.length, 0);
  api.setImage(image, './photos/a.jpg');
  api.clearImage(image);
  assert.equal(image.listeners.length, 0);
  assert.equal(image.src, undefined);
  assert.equal(image.width, undefined);
});

test('only completed new uploads on the configured bucket can derive preview URLs', () => {
  const { api } = fixture();
  const original = 'https://project.supabase.co/storage/v1/object/public/city-photos/cities/pv1-800x1200-example.jpg';
  const choices = api.variants(original);
  assert.deepEqual(Array.from(choices, item => item.width), [480, 800]);
  assert.match(choices[1].url, /city-photos\/previews\/pv1-800x1200-example.jpg.960.webp$/);
  for (const url of [original.replace('project.', 'external.'), original.replace('pv1-800x1200-', ''), './unindexed.jpg']) {
    assert.equal(api.urlFor(url), url, 'legacy or foreign photos do not make speculative 404 requests');
  }
});

test('generated manifest includes built-in photos, valid local variants and actual dimensions', () => {
  const window = {};
  for (const file of ['assets/photos.js', 'assets/photo-previews.js']) vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), { window });
  for (const original of Object.values(window.PHOTO_MANIFEST).flat()) {
    const entry = window.PHOTO_PREVIEWS.photos[original];
    assert(entry, `Missing built-in preview: ${original}`);
    assert(entry.originalBytes > 0);
  }
  // Also check every generated backend photo, not just the built-in offline fixture.
  for (const entry of Object.values(window.PHOTO_PREVIEWS.photos)) {
    for (const variant of entry.variants) {
      assert(variant.width > 0 && variant.height > 0);
      const local = path.resolve(root, variant.url);
      assert(local.startsWith(path.join(root, 'photos/previews') + path.sep));
      assert.equal(fs.statSync(local).size, variant.bytes);
    }
  }
});

test('batch generator refuses paths outside photos and untrusted remote URLs', async () => {
  const { readOriginal } = require('../scripts/build-photo-previews.cjs');
  const config = { url: 'https://project.supabase.co' };
  await assert.rejects(readOriginal('../package.json', config), /Unexpected local/);
  await assert.rejects(readOriginal('https://example.com/a.jpg', config), /External image skipped/);
});
