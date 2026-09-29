const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../assets/memory-engine.js');
const journeys = require('../assets/journey-engine.js');

const visits = [
  { name: '上海', country: '中国', date: '2024-02-03', desc: '第一次上海之旅' },
  { name: '东京', country: '日本', date: '2025-02-14', desc: '东京回忆' },
  { name: '上海', country: '中国', date: '2026-02-01', desc: '再次回到上海' },
  { name: '南京', country: '中国', date: '2025-07-01', desc: '南京回忆' }
];

test('memory snapshot finds exact anniversaries, month history, journey age, and returns', () => {
  const snapshot = engine.buildMemorySnapshot(visits, [{
    slug: 'winter-trip', title: '冬日之旅', startDate: '2026-01-08', endDate: '2026-01-10'
  }], '2026-02-03');
  assert.deepEqual(snapshot.onThisDay.map((visit) => visit.name), ['上海']);
  assert.deepEqual(snapshot.monthVisits.map((visit) => visit.date), ['2026-02-01', '2025-02-14', '2024-02-03']);
  assert.equal(snapshot.latestJourney.daysSince, 24);
  assert.equal(snapshot.repeatCities.length, 1);
  assert.equal(snapshot.repeatCities[0].name, '上海');
  assert.equal(snapshot.repeatCities[0].first.date, '2024-02-03');
  assert.equal(snapshot.repeatCities[0].latest.date, '2026-02-01');
});

test('future journeys are excluded and invalid or duplicate visits stay safe', () => {
  const snapshot = engine.buildMemorySnapshot([
    ...visits,
    { name: '上海', date: '2024-02-03' },
    { name: '无效', date: 'not-a-date' }
  ], [{ slug: 'future', endDate: '2027-01-01' }], '2026-02-03');
  assert.equal(snapshot.latestJourney, null);
  assert.equal(snapshot.cities.find((city) => city.name === '上海').count, 2);
  assert.equal(engine.daysSince('2027-01-01', '2026-02-03'), null);
});

test('random memory can avoid the city currently on screen', () => {
  assert.equal(engine.randomCityMemory(visits, () => 0).name, '上海');
  assert.equal(engine.randomCityMemory(visits, () => 0, '上海').name, '南京');
  assert.equal(engine.randomCityMemory([], () => 0), null);
});

test('arrival records win; journey stop ranges fill days without a city arrival', () => {
  const journey = {
    slug: 'huashan', title: '2025 华山与西北之旅', endDate: '2025-10-01', stops: journeys.effectiveStopDates([
      { cityName: '西安', stopOrder: 0, arrivalDate: '2025-09-27', departureDate: '2026-09-30' },
      { cityName: '银川', stopOrder: 1, arrivalDate: '2025-09-30', departureDate: '2025-10-01' }
    ], '2025-10-01')
  };
  const arrivals = [
    { name: '西安', date: '2025-09-27' },
    { name: '银川', date: '2025-09-30' }
  ];
  const september29 = engine.buildMemorySnapshot(arrivals, [journey], '2026-09-29');
  assert.equal(september29.onThisDay[0].name, '西安');
  assert.equal(september29.onThisDay[0].journeySlug, 'huashan');
  assert.equal(september29.onThisDay[0].departureDate, '2025-09-29');
  const september30 = engine.buildMemorySnapshot(arrivals, [journey], '2026-09-30');
  assert.equal(september30.onThisDay[0].name, '银川');
  assert.equal(september30.onThisDay[0].journeySlug, undefined);
  assert.deepEqual(engine.buildMemorySnapshot(arrivals, [journey], '2026-09-26').onThisDay, []);
});

test('an evening transfer may overlap both stops but the newer arrival takes priority', () => {
  const bay = {
    slug: 'hong-kong-shenzhen', title: '港深双城之旅', endDate: '2025-08-11', stops: [
      { cityName: '香港', stopOrder: 0, arrivalDate: '2025-08-09', departureDate: '2025-08-10' },
      { cityName: '深圳', stopOrder: 1, arrivalDate: '2025-08-10', departureDate: '2025-08-11' }
    ]
  };
  assert.equal(engine.buildMemorySnapshot([], [bay], '2026-08-09').onThisDay[0].name, '香港');
  assert.equal(engine.buildMemorySnapshot([], [bay], '2026-08-10').onThisDay[0].name, '深圳');
  assert.equal(engine.buildMemorySnapshot([], [bay], '2026-08-11').onThisDay[0].name, '深圳');
  const exact = engine.buildMemorySnapshot([{ name: '深圳', date: '2025-08-10' }], [bay], '2026-08-10');
  assert.equal(exact.onThisDay[0].name, '深圳');
  assert.equal(exact.onThisDay[0].journeySlug, undefined);
});
