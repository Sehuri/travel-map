const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../assets/route-replay-engine.js');

const journey = {
  slug: 'rail-trip',
  title: '铁路之旅',
  endDate: '2026-02-06',
  stops: [
    { cityName: '甲城', arrivalDate: '2026-02-01', transportToNext: '高铁 G1 · 500 公里' },
    { cityName: '乙城', arrivalDate: '2026-02-04', departureDate: '2026-02-05', transportToNext: '轮渡' },
    { cityName: '丙城', arrivalDate: '2026-02-06' }
  ],
  photos: [{ cityName: '乙城', imageUrl: 'b.jpg' }]
};

const visits = [
  { name: '甲城', country: '中国', coord: [110, 30], desc: '甲城记忆' },
  { name: '乙城', country: '中国', coord: [115, 32], desc: '乙城记忆' },
  { name: '丙城', country: '中国', coord: [120, 31], desc: '丙城记忆' }
];

test('replay builds dated stops, representative photos, transport colors, and distance', () => {
  const replay = engine.buildReplay(journey, visits, { '甲城': ['a.jpg'] });
  assert.equal(replay.stops.length, 3);
  assert.equal(replay.stops[0].departureDate, '2026-02-03');
  assert.equal(replay.stops[0].stayDays, 3);
  assert.equal(replay.stops[0].photoUrl, 'a.jpg');
  assert.equal(replay.stops[1].photoUrl, 'b.jpg');
  assert.equal(replay.segments[0].type, 'rail');
  assert.equal(replay.segments[0].distanceKm, 500);
  assert.equal(replay.segments[0].distanceEstimated, false);
  assert.equal(replay.segments[1].type, 'ferry');
  assert(replay.segments[1].distanceKm > 0);
  assert.equal(replay.segments[1].distanceEstimated, true);
});

test('transport classifier covers the supported line styles', () => {
  assert.equal(engine.transportType('MU5102 航班'), 'flight');
  assert.equal(engine.transportType('东海道新干线'), 'rail');
  assert.equal(engine.transportType('租车自驾'), 'road');
  assert.equal(engine.transportType('机场大巴'), 'transit');
  assert.equal(engine.transportType('海峡轮渡'), 'ferry');
  assert.equal(engine.transportType('沿海徒步'), 'walk');
});

test('geographic projection stays inside the replay canvas', () => {
  const replay = engine.buildReplay(journey, visits, {});
  const points = engine.projectStops(replay.stops, 1000, 520, 78);
  assert.equal(points.length, 3);
  points.forEach((point) => {
    assert(point.x >= 78 && point.x <= 922);
    assert(point.y >= 78 && point.y <= 442);
  });
});

test('share URL opens the exact journey and current stop in replay mode', () => {
  const url = new URL(engine.createShareUrl('https://sehuri.github.io/travel-map/journey.html?old=1', 'rail-trip', 1));
  assert.equal(url.searchParams.get('slug'), 'rail-trip');
  assert.equal(url.searchParams.get('replay'), '1');
  assert.equal(url.searchParams.get('stop'), '2');
  assert.equal(url.hash, '#route-replay');
});
