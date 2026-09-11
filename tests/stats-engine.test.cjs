const test = require('node:test');
const assert = require('node:assert/strict');
const {
  groupTrips,
  elapsedDaysSinceFirstVisit,
  distanceKm,
  estimateTripDistance,
  countPhotos,
  buildTravelStats
} = require('../assets/stats-engine.js');

test('nearby visit dates form inclusive multi-day trips', () => {
  const visits = [
    { name: '甲', date: '2025-01-01', coord: [118.79, 32.06], country: '中国' },
    { name: '乙', date: '2025-01-04', coord: [119, 32], country: '中国' },
    { name: '丙', date: '2025-01-10', coord: [120, 31], country: '中国' }
  ];
  const trips = groupTrips(visits);
  assert.equal(trips.length, 2);
  assert.equal(trips[0].days, 4);
  assert.equal(trips[1].days, 1);
});

test('elapsed days run from the first recorded visit through today inclusively', () => {
  const visits = [
    { date: '2013-07-09' },
    { date: '2025-01-01' }
  ];
  assert.equal(elapsedDaysSinceFirstVisit(visits, '2026-09-11'), 4813);
});

test('distance estimate starts and returns to Nanjing for every trip', () => {
  const roundTrip = estimateTripDistance({ visits: [{ coord: [119.79, 32.06] }] });
  const oneWay = distanceKm([118.79, 32.06], [119.79, 32.06]);
  assert(Math.abs(roundTrip - oneWay * 2) < 0.001);
});

test('personal statistics include repeat visits, coverage, photos and month counts', () => {
  const visits = [
    { name: '南京', date: '2025-01-01', coord: [118.79, 32.06], country: '中国' },
    { name: '苏州', date: '2025-01-03', coord: [120.58, 31.30], country: '中国' },
    { name: '南京', date: '2026-07-01', coord: [118.79, 32.06], country: '中国' },
    { name: '东京', date: '2026-07-04', coord: [139.69, 35.68], country: '日本' }
  ];
  const stats = buildTravelStats(visits, { 南京: ['a.jpg'], 东京: ['b.jpg', 'c.jpg'] }, { today: '2026-07-04' });
  assert.equal(stats.tripCount, 2);
  assert.equal(stats.elapsedDays, 550);
  assert.equal(stats.provinceCount, 1);
  assert.equal(stats.countryCount, 2);
  assert.deepEqual(stats.repeatCities, [['南京', 2]]);
  assert.deepEqual(stats.monthCounts, [2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0]);
  assert.deepEqual(countPhotos({ 南京: ['a.jpg'], 东京: ['b.jpg', 'c.jpg'], 空: [] }), { total: 3, cities: 2 });
});

test('the built-in archive produces stable headline statistics', () => {
  const previousWindow = global.window;
  global.window = {};
  delete require.cache[require.resolve('../assets/data.js')];
  delete require.cache[require.resolve('../assets/photos.js')];
  require('../assets/data.js');
  require('../assets/photos.js');
  const stats = buildTravelStats(global.window.TRAVEL_DATA.visits, global.window.PHOTO_MANIFEST, { today: '2026-09-11' });
  global.window = previousWindow;
  assert.equal(stats.tripCount, 29);
  assert.equal(stats.elapsedDays, 4813);
  assert.equal(stats.firstVisitDate, '2013-07-09');
  assert.equal(stats.firstVisitName, '日照');
  assert.equal(stats.distanceKm, 36900);
  assert.equal(stats.provinceCount, 19);
  assert.equal(stats.countryCount, 2);
  assert.equal(stats.photoCount, 67);
  assert.equal(stats.photoCityCount, 8);
  assert.deepEqual(stats.monthCounts, [9, 7, 4, 7, 2, 1, 6, 7, 4, 4, 0, 2]);
});
