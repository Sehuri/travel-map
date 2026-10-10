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
  wishlistRowMapFields,
  isValidCoordinate,
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
test('coordinates already supplied by AMap are not converted twice',()=>{
  const coord=[120.585,30.004];
  assert.deepEqual(getAmapCoordinate({name:'绍兴市',country:'中国',coord,coordinateSystem:'GCJ-02'}),coord);
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
  assert.equal(Object.keys(WISHLIST_MAP_LOCATIONS).length,31);
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
  assert.equal(destinations.length,27);
  assert.deepEqual(
    destinations.filter((destination)=>!getWishlistMapLocation(destination)).map((destination)=>destination.name),
    []
  );
  assert.deepEqual(
    destinations.filter((destination)=>destination.priorityLevel===3).map((destination)=>destination.name),
    ['意大利','法国']
  );
  assert.equal(destinations.find((destination)=>destination.name==='意大利').plannedTime,'2027 国庆');
  assert.equal(destinations.find((destination)=>destination.name==='宣城 · 皖南川藏线').plannedTime,'2026 年 10 月或 11 月');
  assert.equal(destinations.filter((destination)=>destination.priorityLevel===1).length,6);
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
    label:'测试坐标',
    coordinateSystem:'WGS84'
  });
  assert.equal(getWishlistMapLocation({name:'未配置地点'}),null);
});

test('manually added Switzerland uses the planned Jungfrau-region representative point',()=>{
  const location = getWishlistMapLocation({name:'瑞士'});
  assert.deepEqual(location, {country:'瑞士', coord:[8.0341,46.6243], label:'瑞士', coordinateSystem:'WGS84'});
  assert.deepEqual(getAmapCoordinate({name:'瑞士', ...location}), location.coord);
});

test('database map fields preserve valid zero values and never turn missing values into zero',()=>{
  assert.deepEqual(wishlistRowMapFields({country:'测试', longitude:'0', latitude:'0', coordinate_system:'WGS84', map_label:'赤道'}),
    {country:'测试', coord:[0,0], coordinateSystem:'WGS84', mapLabel:'赤道'});
  for (const row of [{}, {longitude:null,latitude:null}, {longitude:'',latitude:''}, {longitude:8,latitude:null}, {longitude:181,latitude:46}]) {
    assert.equal(wishlistRowMapFields(row).coord, undefined);
  }
  for (const coord of [[181,46], [8,91], [8,NaN], ['8',46], [8], null]) {
    assert.equal(isValidCoordinate(coord), false);
    assert.equal(getWishlistMapLocation({name:'未知目的地',coord}), null);
  }
  const place={name:'瑞士',...wishlistRowMapFields({country:'瑞士',longitude:'8.5417',latitude:'47.3769',map_label:'苏黎世'})};
  assert.deepEqual(getWishlistMapLocation(place).coord,[8.5417,47.3769]);
  assert.equal(getWishlistMapLocation(place).label,'苏黎世');
});
