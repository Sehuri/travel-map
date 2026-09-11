const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../assets/memory-engine.js');

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
