(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TRAVEL_ADMIN_REGION_ENGINE = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const japanesePrefectureByCity = new Map([
    ["大阪", "大阪"], ["京都", "京都"], ["东京", "东京"], ["镰仓", "神奈川"]
  ]);
  const japaneseNames = new Map([
    ["osaka", "大阪"], ["kyoto", "京都"], ["tokyo", "东京"],
    ["kanagawa", "神奈川"], ["tōkyō", "东京"]
  ]);

  function normalizeRegionName(value) {
    const name = String(value || "").trim().toLowerCase();
    const japanese = japaneseNames.get(name);
    if (japanese) return japanese;
    if (["大阪", "京都", "东京", "神奈川"].includes(name)) return name;
    return name
      .replace(/(?:壮族|回族|维吾尔)自治区$|自治区$|特别行政区$|行政区$|省$|市$|[都道府县県]$/u, "")
      .replace(/^內蒙古$/u, "内蒙古")
      .replace(/^黑龍江$/u, "黑龙江")
      .replace(/^東京$/u, "东京")
      .replace(/^神奈川県?$/u, "神奈川");
  }

  function regionForVisit(visit, provinceByCity) {
    if (!visit) return "";
    const explicit = visit.admin1 || visit.province || visit.state || visit.prefecture;
    if (explicit) return normalizeRegionName(explicit);
    if (visit.country === "中国") return normalizeRegionName(provinceByCity?.get(visit.name));
    if (visit.country === "日本") return normalizeRegionName(japanesePrefectureByCity.get(visit.name));
    return "";
  }

  function regionsByCountry(visits, provinceByCity) {
    const regions = new Map();
    for (const visit of visits || []) {
      const region = regionForVisit(visit, provinceByCity);
      if (!region) continue;
      if (!regions.has(visit.country)) regions.set(visit.country, new Map());
      if (!regions.get(visit.country).has(region)) regions.get(visit.country).set(region, []);
      if (!regions.get(visit.country).get(region).includes(visit.name)) regions.get(visit.country).get(region).push(visit.name);
    }
    return regions;
  }

  function districtRegion(properties) {
    return normalizeRegionName(properties?.NAME_CHN || properties?.NAME_ENG || properties?.name);
  }

  return { normalizeRegionName, regionForVisit, regionsByCountry, districtRegion };
});
