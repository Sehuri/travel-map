const test = require('node:test');
const assert = require('node:assert/strict');
const regions = require('../assets/admin-region-engine.js');
const stats = require('../assets/stats-engine.js');

test('visiting any city lights its Chinese province or Japanese prefecture once', () => {
  const visits = [
    { name: '南京', country: '中国' },
    { name: '苏州', country: '中国' },
    { name: '大阪', country: '日本' },
    { name: '京都', country: '日本' },
    { name: '东京', country: '日本' },
    { name: '镰仓', country: '日本' },
    { name: '东京', country: '日本' }
  ];
  const result = regions.regionsByCountry(visits, stats.provinceByCity);
  assert.deepEqual([...result.get('中国').keys()], ['江苏']);
  assert.deepEqual(result.get('中国').get('江苏'), ['南京', '苏州']);
  assert.deepEqual([...result.get('日本').keys()], ['大阪', '京都', '东京', '神奈川']);
  assert.deepEqual(result.get('日本').get('东京'), ['东京']);
});

test('AMap province and prefecture names match their visited city regions', () => {
  for (const [name, expected] of [
    ['江苏省', '江苏'], ['广西壮族自治区', '广西'], ['香港特别行政区', '香港'],
    ['大阪府', '大阪'], ['京都府', '京都'], ['东京都', '东京'], ['神奈川县', '神奈川'],
    ['Tokyo', '东京'], ['Kanagawa', '神奈川']
  ]) {
    assert.equal(regions.districtRegion({ NAME_CHN: name }), expected);
  }
  assert.equal(regions.regionForVisit({ name: '巴黎', country: '法国', admin1: 'Île-de-France' }), 'île-de-france');
});
