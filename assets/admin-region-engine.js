(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TRAVEL_ADMIN_REGION_ENGINE = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const countryAliases = new Map([
    ["chn", "中国"], ["china", "中国"], ["中华人民共和国", "中国"],
    ["jpn", "日本"], ["japan", "日本"], ["日本国", "日本"],
    ["sgp", "新加坡"], ["singapore", "新加坡"], ["新加坡共和国", "新加坡"],
    ["idn", "印度尼西亚"], ["indonesia", "印度尼西亚"], ["印尼", "印度尼西亚"], ["印度尼西亚共和国", "印度尼西亚"]
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

  function normalizeCountryName(value) {
    const name = String(value || "").trim();
    return countryAliases.get(name.toLowerCase()) || name;
  }

  function regionForVisit(visit, provinceByCity) {
    if (!visit) return "";
    const country = normalizeCountryName(visit.country);
    if (!country) return "";
    // Overseas footprints are whole countries, irrespective of city/admin1 names.
    if (country !== "中国") return country;
    const explicit = visit.admin1 || visit.province || visit.state || visit.prefecture;
    if (explicit) return normalizeRegionName(explicit);
    return normalizeRegionName(provinceByCity?.get(visit.name));
  }

  function regionsByCountry(visits, provinceByCity) {
    const regions = new Map();
    for (const visit of visits || []) {
      const region = regionForVisit(visit, provinceByCity);
      if (!region) continue;
      const country = normalizeCountryName(visit.country);
      if (!regions.has(country)) regions.set(country, new Map());
      if (!regions.get(country).has(region)) regions.get(country).set(region, []);
      if (!regions.get(country).get(region).includes(visit.name)) regions.get(country).get(region).push(visit.name);
    }
    return regions;
  }

  function districtRegion(properties) {
    return normalizeRegionName(properties?.NAME_CHN || properties?.NAME_ENG || properties?.name);
  }

  function districtCountry(properties) {
    return countryAliases.get(String(properties?.SOC || "").toLowerCase())
      || normalizeCountryName(properties?.NAME_CHN || properties?.NAME_ENG || properties?.SOC);
  }

  return { normalizeRegionName, normalizeCountryName, regionForVisit, regionsByCountry, districtRegion, districtCountry };
});
