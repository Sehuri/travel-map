const test = require('node:test');
const assert = require('node:assert/strict');
const {outsideChina,wgs84ToGcj02} = require('../assets/map-engine.js');

test('coordinates outside China remain unchanged',()=>{
  assert.equal(outsideChina(139.69,35.69),true);
  assert.deepEqual(wgs84ToGcj02([139.69,35.69]),[139.69,35.69]);
});

test('mainland WGS84 coordinates convert to the AMap GCJ-02 system',()=>{
  const [lng,lat]=wgs84ToGcj02([116.404,39.915]);
  assert(Math.abs(lng-116.410244)<0.0001);
  assert(Math.abs(lat-39.916404)<0.0001);
});
