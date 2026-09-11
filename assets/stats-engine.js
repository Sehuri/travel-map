(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TRAVEL_STATS_ENGINE = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_TRIP_GAP_DAYS = 5;
  const TOTAL_PROVINCIAL_REGIONS = 34;
  const TOTAL_COUNTRIES_AND_REGIONS = 195;
  const NANJING = Object.freeze({ name: "南京", coord: [118.79, 32.06] });
  const PROVINCIAL_REGIONS = Object.freeze([
    "北京", "天津", "河北", "山西", "内蒙古", "辽宁", "吉林", "黑龙江",
    "上海", "江苏", "浙江", "安徽", "福建", "江西", "山东", "河南",
    "湖北", "湖南", "广东", "广西", "海南", "重庆", "四川", "贵州",
    "云南", "西藏", "陕西", "甘肃", "青海", "宁夏", "新疆", "香港",
    "澳门", "台湾"
  ]);

  const provinceCities = {
    山东: ["日照", "青岛", "济南", "烟台", "威海", "泰安"],
    江苏: ["淮安", "南京", "苏州", "扬州", "镇江", "无锡", "常州", "泰州"],
    安徽: ["滁州", "合肥", "芜湖", "马鞍山", "六安", "黄山"],
    浙江: ["杭州", "嘉兴", "宁波", "台州", "绍兴"],
    湖北: ["武汉"],
    上海: ["上海"],
    河南: ["洛阳", "郑州"],
    江西: ["九江", "南昌", "上饶"],
    北京: ["北京"],
    福建: ["厦门", "福州", "漳州"],
    海南: ["三亚"],
    香港: ["香港"],
    广东: ["深圳"],
    陕西: ["渭南", "西安"],
    宁夏: ["银川"],
    内蒙古: ["阿拉善盟"],
    辽宁: ["大连", "沈阳"],
    黑龙江: ["哈尔滨"],
    湖南: ["长沙", "湘潭", "衡阳"]
  };
  const provinceByCity = new Map(
    Object.entries(provinceCities).flatMap(([province, cities]) => cities.map((city) => [city, province]))
  );

  function dateValue(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return NaN;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function validCoord(coord) {
    return Array.isArray(coord) && coord.length === 2 && coord.every(Number.isFinite);
  }

  function elapsedDaysSinceFirstVisit(visits, today = new Date()) {
    const firstTime = Math.min(...(visits || []).map((visit) => dateValue(visit?.date)).filter(Number.isFinite));
    if (!Number.isFinite(firstTime)) return 0;
    const todayTime = typeof today === "string"
      ? dateValue(today)
      : Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    if (!Number.isFinite(todayTime) || todayTime < firstTime) return 0;
    return Math.floor((todayTime - firstTime) / DAY_MS) + 1;
  }

  function groupTrips(visits, maxGapDays = DEFAULT_TRIP_GAP_DAYS) {
    const sorted = (visits || [])
      .map((visit, index) => ({ visit, index, time: dateValue(visit?.date) }))
      .filter((entry) => Number.isFinite(entry.time))
      .sort((a, b) => a.time - b.time || a.index - b.index);
    const trips = [];
    sorted.forEach((entry) => {
      const current = trips[trips.length - 1];
      if (!current || (entry.time - current.endTime) / DAY_MS > maxGapDays) {
        trips.push({
          startDate: entry.visit.date,
          endDate: entry.visit.date,
          startTime: entry.time,
          endTime: entry.time,
          visits: [entry.visit]
        });
        return;
      }
      current.visits.push(entry.visit);
      current.endDate = entry.visit.date;
      current.endTime = entry.time;
    });
    return trips.map((trip) => ({
      startDate: trip.startDate,
      endDate: trip.endDate,
      days: Math.round((trip.endTime - trip.startTime) / DAY_MS) + 1,
      visits: trip.visits
    }));
  }

  function distanceKm(from, to) {
    if (!validCoord(from) || !validCoord(to)) return 0;
    const radians = (degrees) => degrees * Math.PI / 180;
    const latitudeDelta = radians(to[1] - from[1]);
    const longitudeDelta = radians(to[0] - from[0]);
    const a = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(radians(from[1])) * Math.cos(radians(to[1])) * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
  }

  function estimateTripDistance(trip, origin = NANJING.coord) {
    const stops = (trip?.visits || []).map((visit) => visit.coord).filter(validCoord);
    if (!stops.length) return 0;
    const route = [origin, ...stops, origin];
    return route.slice(1).reduce((total, stop, index) => total + distanceKm(route[index], stop), 0);
  }

  function countPhotos(photoManifest) {
    return Object.values(photoManifest || {}).reduce(
      (summary, photos) => {
        if (!Array.isArray(photos) || !photos.length) return summary;
        summary.total += photos.length;
        summary.cities += 1;
        return summary;
      },
      { total: 0, cities: 0 }
    );
  }

  function buildTravelStats(visits, photoManifest, options = {}) {
    const items = visits || [];
    const trips = groupTrips(items, options.maxGapDays ?? DEFAULT_TRIP_GAP_DAYS);
    const provinces = new Set(
      items
        .filter((visit) => visit.country === "中国")
        .map((visit) => provinceByCity.get(visit.name))
        .filter(Boolean)
    );
    const countries = new Set(items.map((visit) => visit.country).filter(Boolean));
    const provinceDetails = PROVINCIAL_REGIONS.map((province) => {
      const provinceVisits = items.filter((visit) => visit.country === "中国" && provinceByCity.get(visit.name) === province);
      return {
        name: province,
        visited: provinceVisits.length > 0,
        visitCount: provinceVisits.length,
        cities: [...new Set(provinceVisits.map((visit) => visit.name))]
      };
    });
    const countryDetails = [...countries].map((country) => {
      const countryVisits = items
        .filter((visit) => visit.country === country)
        .sort((a, b) => a.date.localeCompare(b.date));
      return {
        name: country,
        visitCount: countryVisits.length,
        cities: [...new Set(countryVisits.map((visit) => visit.name))],
        firstDate: countryVisits[0]?.date || "",
        lastDate: countryVisits[countryVisits.length - 1]?.date || ""
      };
    }).sort((a, b) => b.visitCount - a.visitCount || a.name.localeCompare(b.name, "zh-CN"));
    const repeatCounts = new Map();
    items.forEach((visit) => {
      if (visit?.name) repeatCounts.set(visit.name, (repeatCounts.get(visit.name) || 0) + 1);
    });
    const repeatCities = [...repeatCounts.entries()]
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
    const repeatDetails = repeatCities.map(([name, count]) => {
      const cityVisits = items.filter((visit) => visit.name === name).sort((a, b) => a.date.localeCompare(b.date));
      return {
        name,
        count,
        country: cityVisits[0]?.country || "",
        dates: cityVisits.map((visit) => visit.date)
      };
    });
    const monthCounts = Array(12).fill(0);
    items.forEach((visit) => {
      const match = /^\d{4}-(\d{2})-\d{2}$/.exec(String(visit?.date || ""));
      const month = match ? Number(match[1]) : 0;
      if (month >= 1 && month <= 12) monthCounts[month - 1] += 1;
    });
    const photos = countPhotos(photoManifest);
    const totalDistanceKm = trips.reduce((total, trip) => total + estimateTripDistance(trip, options.originCoord || NANJING.coord), 0);
    const datedVisits = items.filter((visit) => Number.isFinite(dateValue(visit?.date)));
    const firstVisit = datedVisits.reduce(
      (earliest, visit) => !earliest || visit.date < earliest.date ? visit : earliest,
      null
    );

    return {
      trips,
      tripCount: trips.length,
      elapsedDays: elapsedDaysSinceFirstVisit(items, options.today),
      firstVisitDate: firstVisit?.date || "",
      firstVisitName: firstVisit?.name || "",
      distanceKm: Math.round(totalDistanceKm / 100) * 100,
      provinceCount: provinces.size,
      provinceTotal: TOTAL_PROVINCIAL_REGIONS,
      provincePercent: Math.round(provinces.size / TOTAL_PROVINCIAL_REGIONS * 100),
      provinceDetails,
      countryCount: countries.size,
      countryTotal: TOTAL_COUNTRIES_AND_REGIONS,
      countryPercent: Math.round(countries.size / TOTAL_COUNTRIES_AND_REGIONS * 100),
      countryDetails,
      repeatCities,
      repeatDetails,
      photoCount: photos.total,
      photoCityCount: photos.cities,
      monthCounts
    };
  }

  return {
    DEFAULT_TRIP_GAP_DAYS,
    NANJING,
    PROVINCIAL_REGIONS,
    provinceByCity,
    elapsedDaysSinceFirstVisit,
    groupTrips,
    distanceKm,
    estimateTripDistance,
    countPhotos,
    buildTravelStats
  };
});
