const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');

test('homepage offers a global basemap alongside AMap China details', () => {
  assert.match(page, /id="world-map"[^>]*全球旅行足迹地图/);
  assert.match(page, /data-view="world"[^>]*aria-pressed="true"/);
  assert.match(page, /data-view="china"[^>]*>中国细节/);
  assert.match(page, /leaflet@1\.9\.4\/dist\/leaflet\.js/);
  assert.match(app, /basemaps\.cartocdn\.com\/light_all/);
  assert.match(app, /attribution:.*OpenStreetMap.*CARTO/);
});

test('global view follows visited-city filters and the wishlist mode', () => {
  assert.match(app, /worldMarkers\.filter\(\(\{ visit \}\) => visibleNames\.has\(visit\.name\)\)/);
  assert.match(app, /worldWishlistMarkers/);
  assert.match(app, /updateWorldMapMode\(\);\s*refreshChinaDistrictStyles\(\)/);
});
