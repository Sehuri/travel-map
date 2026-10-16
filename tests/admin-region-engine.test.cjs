const test = require('node:test');
const assert = require('node:assert/strict');
const regions = require('../assets/admin-region-engine.js');
const stats = require('../assets/stats-engine.js');
const fs = require('node:fs');
const vm = require('node:vm');

test('footprints group China by province and overseas cities by whole country once', () => {
  const visits = [
    { name: '南京', country: '中国' },
    { name: '苏州', country: '中国' },
    { name: '大阪', country: '日本' },
    { name: '京都', country: '日本' },
    { name: '东京', country: '日本' },
    { name: '镰仓', country: '日本' },
    { name: '东京', country: '日本' },
    { name: '新加坡', country: '新加坡' },
    { name: '雅加达', country: '印度尼西亚', admin1: '雅加达' },
    { name: '泗水', country: '印尼', admin1: '东爪哇' },
    { name: '雅加达', country: '印度尼西亚' }
  ];
  const result = regions.regionsByCountry(visits, stats.provinceByCity);
  assert.deepEqual([...result.get('中国').keys()], ['江苏']);
  assert.deepEqual(result.get('中国').get('江苏'), ['南京', '苏州']);
  assert.deepEqual([...result.get('日本').keys()], ['日本']);
  assert.deepEqual(result.get('日本').get('日本'), ['大阪', '京都', '东京', '镰仓']);
  assert.deepEqual([...result.get('新加坡').keys()], ['新加坡']);
  assert.deepEqual(result.get('印度尼西亚').get('印度尼西亚'), ['雅加达', '泗水']);
  assert.equal(result.size, 4);
});

test('AMap province and country names/codes match visited coverage', () => {
  for (const [name, expected] of [
    ['江苏省', '江苏'], ['广西壮族自治区', '广西'], ['香港特别行政区', '香港'],
    ['大阪府', '大阪'], ['京都府', '京都'], ['东京都', '东京'], ['神奈川县', '神奈川'],
    ['Tokyo', '东京'], ['Kanagawa', '神奈川']
  ]) {
    assert.equal(regions.districtRegion({ NAME_CHN: name }), expected);
  }
  assert.equal(regions.regionForVisit({ name: '巴黎', country: '法国', admin1: 'Île-de-France' }), '法国');
  for(const [properties, expected] of [
    [{SOC:'JPN'}, '日本'], [{SOC:'SGP'}, '新加坡'], [{SOC:'IDN',NAME_CHN:'印度尼西亚'}, '印度尼西亚'],
    [{NAME_CHN:'印尼'}, '印度尼西亚'], [{NAME_ENG:'Singapore'}, '新加坡'],
    [{SOC:'FRA',NAME_CHN:'法国'}, '法国'], [{SOC:'CHN'}, '中国']
  ]) assert.equal(regions.districtCountry(properties), expected);
  assert.equal(regions.regionForVisit({name:'未知城市'}), '');
  assert.equal(regions.districtCountry(null), '');
});

test('actual archive lights 19 Chinese provinces and all three overseas countries; filtering removes coverage', () => {
  const context = {window:{}};
  vm.runInNewContext(fs.readFileSync('assets/data.js','utf8'), context);
  const visits = context.window.TRAVEL_DATA.visits;
  const all = regions.regionsByCountry(visits, stats.provinceByCity);
  assert.equal(all.get('中国').size, 19);
  assert.deepEqual([...all.keys()].filter(country=>country!=='中国').sort(), ['印度尼西亚','新加坡','日本'].sort());
  const indonesia = regions.regionsByCountry(visits.filter(visit=>visit.country==='印度尼西亚'), stats.provinceByCity);
  assert.equal(indonesia.size, 1);
  assert.deepEqual(indonesia.get('印度尼西亚').get('印度尼西亚'), ['雅加达','泗水']);
  assert.equal(regions.regionsByCountry(visits.filter(visit=>visit.date.startsWith('2025')), stats.provinceByCity).has('日本'), false);
  assert.equal(regions.regionsByCountry([], stats.provinceByCity).size, 0);
  const future = regions.regionsByCountry([{name:'巴黎',country:'法国'},{name:'里昂',country:'法国'}], stats.provinceByCity);
  assert.deepEqual(future.get('法国').get('法国'), ['巴黎','里昂']);
});
