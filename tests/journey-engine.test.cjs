const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../assets/journey-engine.js');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadFixtures() {
  global.window = global;
  delete require.cache[require.resolve('../assets/data.js')];
  delete require.cache[require.resolve('../assets/photos.js')];
  require('../assets/data.js');
  require('../assets/photos.js');
  return { data: global.TRAVEL_DATA, photos: global.PHOTO_MANIFEST };
}

test('built-in journeys become complete ordered archives', () => {
  const { data, photos } = loadFixtures();
  const journeys = engine.mergeJourneys(data.journeys, [], [], [], [], photos);
  assert.equal(journeys.length, 5);
  const japan = journeys.find((journey) => journey.slug === '2026-japan-kansai-kanto');
  assert.equal(japan.days, 10);
  assert.deepEqual(japan.stops.map((stop) => stop.cityName), ['大阪', '京都', '东京', '镰仓']);
  assert.equal(japan.photos.length, 32);
  assert.deepEqual(
    journeys.find((journey) => journey.slug === '2026-ningbo-taizhou').stops.map((stop) => stop.cityName),
    ['宁波', '台州']
  );
  assert.deepEqual(
    journeys.find((journey) => journey.slug === '2025-shandong-northeast-winter').stops.map((stop) => stop.cityName),
    ['济南', '烟台', '大连', '哈尔滨', '沈阳']
  );
  assert.deepEqual(
    journeys.find((journey) => journey.slug === '2025-wuxi-shanghai').stops.map((stop) => stop.cityName),
    ['无锡', '上海']
  );
  assert.deepEqual(
    journeys.find((journey) => journey.slug === '2025-hong-kong-shenzhen').stops.map((stop) => stop.cityName),
    ['香港', '深圳']
  );
  assert.equal(engine.journeysForCity(journeys, '东京').length, 1);
  assert.equal(engine.journeysForCity(journeys, '上海').length, 1);
});

test('database journey overrides the fallback and can be unpublished', () => {
  const { data, photos } = loadFixtures();
  const row = {
    id: 'database-id', slug: '2026-japan-kansai-kanto', title: '后台更新后的日本之旅',
    start_date: '2026-02-03', end_date: '2026-02-12', distance_km: 1234,
    distance_is_estimated: false, budget_amount: 9000, budget_currency: 'CNY',
    is_published: true
  };
  const stop = { id: 'stop-id', journey_id: 'database-id', city_name: '东京', stop_order: 0 };
  const guide = { placeType: 'journey', placeName: row.slug, title: '旅程游记' };
  const journeys = engine.mergeJourneys(data.journeys, [row], [stop], [], [guide], photos);
  const overridden = journeys.find((journey) => journey.slug === row.slug);
  assert.equal(overridden.source, 'database');
  assert.equal(overridden.title, '后台更新后的日本之旅');
  assert.equal(overridden.distanceEstimated, false);
  assert.equal(overridden.stops.length, 1);
  assert.equal(overridden.guides.length, 1);
  assert.equal(engine.mergeJourneys(data.journeys, [{ ...row, is_published: false }], [], [], [], photos).length, 4);
});

test('journey migration protects owner writes and expands guide types', () => {
  const sql = read('supabase/journeys.sql');
  assert.match(sql, /create table if not exists public\.travel_journeys/);
  assert.match(sql, /create table if not exists public\.travel_journey_stops/);
  assert.match(sql, /create table if not exists public\.travel_journey_photos/);
  assert.match(sql, /public\.is_current_user_owner\(\)/);
  assert.match(sql, /place_type in \('visited', 'wishlist', 'journey'\)/);
  assert.match(sql, /on delete cascade/);
});

test('admin exposes journey composition and journey document upload', () => {
  const admin = read('admin.html');
  const script = read('assets/admin.js');
  assert.match(admin, /id="journey-form"/);
  assert.match(admin, /id="journey-stop-editor"/);
  assert.match(admin, /id="journey-photo-picker"/);
  assert.match(admin, /<option value="journey">正式旅程<\/option>/);
  assert.match(script, /from\("travel_journeys"\)[\s\S]*?\.upsert\(/);
  assert.match(script, /from\("travel_journey_stops"\)\.insert\(/);
  assert.match(script, /from\("travel_journey_photos"\)\.insert\(/);
});
