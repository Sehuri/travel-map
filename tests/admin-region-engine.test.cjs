const test = require('node:test');
const assert = require('node:assert/strict');
const regions = require('../assets/admin-region-engine.js');
const stats = require('../assets/stats-engine.js');
const fs = require('node:fs');
const path = require('node:path');

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

test('bundled Japanese prefecture polygons cover only the four visited regions', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/japan-visited-prefectures.geojson')));
  assert.deepEqual(data.features.map(feature => feature.properties.name).sort(), ['东京', '京都', '大阪', '神奈川']);
  const cityPoints = [
    ['大阪', '大阪', [135.50, 34.69]],
    ['京都', '京都', [135.77, 35.02]],
    ['东京', '东京', [139.69, 35.69]],
    ['镰仓', '神奈川', [139.55, 35.32]]
  ];
  const insideRing = ([x, y], ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  for (const [city, region, point] of cityPoints) {
    const feature = data.features.find(item => item.properties.name === region);
    const parts = feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates];
    assert(parts.some(polygon => insideRing(point, polygon[0])), `${city} should be inside ${region}`);
  }
});
