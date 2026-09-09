const test = require('node:test');
const assert = require('node:assert/strict');
const {
  outsideChina,
  wgs84ToGcj02,
  isMainlandChina,
  getAmapCoordinate,
  normalizeChinaDistrictName,
  findVisitByDistrictName,
  getWishlistMapLocation,
  WISHLIST_MAP_LOCATIONS
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

test('only explicitly mainland Chinese places receive GCJ-02 conversion',()=>{
  const mainland={name:'北京',country:'中国',coord:[116.404,39.915]};
  const unchanged=[
    {name:'大阪',country:'日本',coord:[135.50,34.69]},
    {name:'釜山',country:'韩国',coord:[129.08,35.18]},
    {name:'台湾 · 本岛',country:'中国',coord:[120.96,23.70]},
    {name:'香港',country:'中国',coord:[114.17,22.28]},
    {name:'澳门',country:'中国',coord:[113.54,22.20]}
  ];
  assert.equal(isMainlandChina(mainland),true);
  assert.notDeepEqual(getAmapCoordinate(mainland),mainland.coord);
  unchanged.forEach((place)=>{
    assert.equal(isMainlandChina(place),false,place.name);
    assert.deepEqual(getAmapCoordinate(place),place.coord,place.name);
  });
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

test('every configured wishlist destination resolves to a valid map location',()=>{
  assert.equal(Object.keys(WISHLIST_MAP_LOCATIONS).length,22);
  Object.keys(WISHLIST_MAP_LOCATIONS).forEach((name)=>{
    const location=getWishlistMapLocation({name});
    assert.equal(location.coord.length,2);
    assert(location.coord.every(Number.isFinite));
    assert(location.label);
  });
});

test('every built-in wishlist card has a map location',()=>{
  const previousWindow=global.window;
  global.window={};
  delete require.cache[require.resolve('../assets/data.js')];
  require('../assets/data.js');
  const destinations=global.window.TRAVEL_DATA.wishlist;
  global.window=previousWindow;
  assert.equal(destinations.length,22);
  assert.deepEqual(
    destinations.filter((destination)=>!getWishlistMapLocation(destination)).map((destination)=>destination.name),
    []
  );
});

test('wishlist records can override their fallback map metadata',()=>{
  assert.deepEqual(getWishlistMapLocation({
    name:'新加坡',
    country:'测试地区',
    coord:[1,2],
    mapLabel:'测试坐标'
  }),{
    country:'测试地区',
    coord:[1,2],
    label:'测试坐标'
  });
  assert.equal(getWishlistMapLocation({name:'未配置地点'}),null);
});
