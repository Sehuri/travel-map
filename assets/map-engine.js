(function (root) {
  "use strict";

  const PI = Math.PI;
  const AXIS = 6378245;
  const ECCENTRICITY = 0.006693421622965943;
  const WISHLIST_MAP_LOCATIONS = Object.freeze({
    "印度尼西亚 · 布罗莫火山与雅加达": { country: "印度尼西亚", coord: [112.95, -7.94], label: "布罗莫火山" },
    "新加坡": { country: "新加坡", coord: [103.82, 1.35], label: "新加坡" },
    "新疆 · 伊犁与赛里木湖": { country: "中国", coord: [81.18, 44.61], label: "赛里木湖" },
    "台湾 · 本岛": { country: "中国", coord: [120.96, 23.70], label: "台湾本岛" },
    "云南 · 大理丽江香格里拉": { country: "中国", coord: [100.23, 26.88], label: "滇西北" },
    "四川 · 川西稻城九寨沟": { country: "中国", coord: [100.30, 29.04], label: "川西" },
    "内蒙古 · 乌兰布统": { country: "中国", coord: [117.25, 42.52], label: "乌兰布统" },
    "广东 · 广州": { country: "中国", coord: [113.26, 23.13], label: "广州" },
    "澳门": { country: "中国", coord: [113.54, 22.20], label: "澳门" },
    "四川 · 成都": { country: "中国", coord: [104.07, 30.67], label: "成都" },
    "重庆": { country: "中国", coord: [106.55, 29.56], label: "重庆" },
    "湖南 · 张家界武陵源": { country: "中国", coord: [110.48, 29.12], label: "张家界" },
    "山西 · 恒山": { country: "中国", coord: [113.72, 39.67], label: "恒山" },
    "浙江 · 雁荡山": { country: "中国", coord: [121.06, 28.37], label: "雁荡山" },
    "韩国 · 釜山": { country: "韩国", coord: [129.08, 35.18], label: "釜山" },
    "吉林 · 长白山": { country: "中国", coord: [128.06, 42.01], label: "长白山" },
    "贵州 · 黄果树瀑布": { country: "中国", coord: [105.67, 25.99], label: "黄果树" },
    "安徽 · 天柱山": { country: "中国", coord: [116.45, 30.73], label: "天柱山" },
    "四川阿坝 · 萨武神山": { country: "中国", coord: [102.36, 31.00], label: "萨武神山" },
    "青海 · 黑独山": { country: "中国", coord: [93.28, 38.50], label: "黑独山" },
    "甘肃 · 敦煌莫高窟与鸣沙山": { country: "中国", coord: [94.66, 40.14], label: "敦煌" },
    "四川 · 峨眉山": { country: "中国", coord: [103.33, 29.52], label: "峨眉山" }
  });

  function outsideChina(lng, lat) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }

  function transformLat(lng, lat) {
    let value = -100 + 2 * lng + 3 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
    value += (20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2 / 3;
    value += (20 * Math.sin(lat * PI) + 40 * Math.sin(lat / 3 * PI)) * 2 / 3;
    return value + (160 * Math.sin(lat / 12 * PI) + 320 * Math.sin(lat * PI / 30)) * 2 / 3;
  }

  function transformLng(lng, lat) {
    let value = 300 + lng + 2 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
    value += (20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2 / 3;
    value += (20 * Math.sin(lng * PI) + 40 * Math.sin(lng / 3 * PI)) * 2 / 3;
    return value + (150 * Math.sin(lng / 12 * PI) + 300 * Math.sin(lng / 30 * PI)) * 2 / 3;
  }

  function wgs84ToGcj02(coord) {
    const [lng, lat] = coord || [];
    if (![lng, lat].every(Number.isFinite) || outsideChina(lng, lat)) return [lng, lat];
    let dLat = transformLat(lng - 105, lat - 35);
    let dLng = transformLng(lng - 105, lat - 35);
    const radLat = lat / 180 * PI;
    let magic = Math.sin(radLat);
    magic = 1 - ECCENTRICITY * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = dLat * 180 / ((AXIS * (1 - ECCENTRICITY)) / (magic * sqrtMagic) * PI);
    dLng = dLng * 180 / (AXIS / sqrtMagic * Math.cos(radLat) * PI);
    return [lng + dLng, lat + dLat];
  }

  function normalizeChinaDistrictName(name) {
    return String(name || "")
      .trim()
      .replace(/(?:特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区|自治州|地区|盟|市)$/u, "");
  }

  function findVisitByDistrictName(visits, districtName) {
    const normalized = normalizeChinaDistrictName(districtName);
    if (!normalized) return null;
    return (visits || []).find((visit) => (
      visit?.country === "中国" && normalizeChinaDistrictName(visit.name) === normalized
    )) || null;
  }

  function getWishlistMapLocation(destination) {
    const configured = WISHLIST_MAP_LOCATIONS[destination?.name];
    const coord = destination?.coord || configured?.coord;
    if (!Array.isArray(coord) || coord.length !== 2 || !coord.every(Number.isFinite)) return null;
    return {
      country: destination?.country || configured?.country || "",
      coord: [...coord],
      label: destination?.mapLabel || configured?.label || destination.name
    };
  }

  const api = {
    outsideChina,
    wgs84ToGcj02,
    normalizeChinaDistrictName,
    findVisitByDistrictName,
    getWishlistMapLocation,
    WISHLIST_MAP_LOCATIONS
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TRAVEL_MAP_ENGINE = api;
})(typeof window !== "undefined" ? window : globalThis);
