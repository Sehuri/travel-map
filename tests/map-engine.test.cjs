const test = require('node:test');
const assert = require('node:assert/strict');
const {
  outsideChina,
  wgs84ToGcj02,
  normalizeChinaDistrictName,
  findVisitByDistrictName
} = require('../assets/map-engine.js');

test('coordinates outside China remain unchanged',()=>{
  assert.equal(outsideChina(139.69,35.69),true);
  assert.deepEqual(wgs84ToGcj02([139.69,35.69]),[139.69,35.69]);
});

test('mainland WGS84 coordinates convert to the AMap GCJ-02 system',()=>{
  const [lng,lat]=wgs84ToGcj02([116.404,39.915]);
  assert(Math.abs(lng-116.410244)<0.0001);
  assert(Math.abs(lat-39.916404)<0.0001);
});

test('AMap district names match visited city names across administrative suffixes',()=>{
  assert.equal(normalizeChinaDistrictName('北京市'),'北京');
  assert.equal(normalizeChinaDistrictName('香港特别行政区'),'香港');
  assert.equal(normalizeChinaDistrictName('阿拉善盟'),'阿拉善');
  const visits = [
    {name:'北京',country:'中国'},
    {name:'香港',country:'中国'},
    {name:'东京',country:'日本'}
  ];
  assert.equal(findVisitByDistrictName(visits,'北京市')?.name,'北京');
  assert.equal(findVisitByDistrictName(visits,'香港特别行政区')?.name,'香港');
  assert.equal(findVisitByDistrictName(visits,'东京都'),null);
});
