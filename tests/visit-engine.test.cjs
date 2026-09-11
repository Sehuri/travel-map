const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mergeCityVisits, uniqueCities } = require('../assets/visit-engine.js');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const base = [{
  name: '南京', country: '中国', date: '2023-09-17', coord: [118.79, 32.06], desc: '城市简介'
}];

test('additional visits create repeated timeline records with one shared city profile', () => {
  const visits = mergeCityVisits(base, [], [
    { id: 'second', city_name: '南京', visit_date: '2025-05-01' },
    { id: 'third', city_name: '南京', visit_date: '2026-09-11' }
  ]);
  assert.deepEqual(visits.map((visit) => visit.date), ['2023-09-17', '2025-05-01', '2026-09-11']);
  assert(visits.every((visit) => visit.desc === '城市简介'));
  assert(visits.every((visit) => visit.coord[0] === 118.79));
  assert.equal(uniqueCities(visits).length, 1);
});

test('city profile overrides remain shared across every visit date', () => {
  const visits = mergeCityVisits(base, [{
    name: '南京', country: '中国', region: '中国 · 华东', visit_date: '2024-01-02',
    longitude: 118.8, latitude: 32.1, description: '后台统一简介', cover_url: 'cover.jpg', is_hidden: false
  }], [{ id: 'again', city_name: '南京', visit_date: '2026-03-04' }]);
  assert.deepEqual(visits.map((visit) => visit.date), ['2024-01-02', '2026-03-04']);
  assert(visits.every((visit) => visit.desc === '后台统一简介'));
  assert(visits.every((visit) => visit.coverUrl === 'cover.jpg'));
});

test('duplicate dates are ignored and hidden cities remove all visits', () => {
  const duplicate = mergeCityVisits(base, [], [
    { id: 'same-day', city_name: '南京', visit_date: '2023-09-17' }
  ]);
  assert.equal(duplicate.length, 1);
  const hidden = mergeCityVisits(base, [{ name: '南京', is_hidden: true }], [
    { id: 'again', city_name: '南京', visit_date: '2026-03-04' }
  ]);
  assert.deepEqual(hidden, []);
});

test('visit migration and admin UI protect shared city data', () => {
  const sql = read('supabase/city_visits.sql');
  const admin = read('admin.html');
  const adminScript = read('assets/admin.js');
  const contentScript = read('assets/content.js');
  assert.match(sql, /unique \(city_name, visit_date\)/);
  assert.match(sql, /travel_city_visits_public_read/);
  assert.match(sql, /public\.is_current_user_owner\(\)/);
  assert.match(admin, /id="visit-record-list"/);
  assert.match(admin, /id="add-visit-record"/);
  assert.match(adminScript, /from\("travel_city_visits"\)\.insert/);
  assert.match(contentScript, /from\("travel_city_visits"\)/);
});
