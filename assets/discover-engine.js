(function (root) {
  "use strict";
  const validCoord = c => Array.isArray(c) && c.length === 2 && c.every(Number.isFinite) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
  function distance(a, b) {
    const rad = x => x * Math.PI / 180;
    const dlat = rad(b[1] - a[1]), dlon = rad(b[0] - a[0]);
    const h = Math.sin(dlat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dlon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  const radiusForDays = days => days <= 2 ? 350 : days <= 4 ? 800 : days <= 7 ? 1600 : Infinity;
  function candidates(cities, options) {
    const { origin, days, radius = "auto", province = "", exclude = [] } = options;
    if (!origin || !validCoord(origin.coord)) throw new Error("请从城市列表选择出发地。");
    if (!Number.isInteger(days) || days < 1 || days > 14) throw new Error("游玩天数请填写 1—14 的整数。");
    const limit = radius === "auto" ? radiusForDays(days) : Number(radius);
    if (!(limit > 0)) throw new Error("请选择有效的距离范围。");
    return cities.filter(c => c.id !== origin.id && validCoord(c.coord) && (!province || c.province === province) && !exclude.includes(c.id))
      .map(c => ({ ...c, distance: distance(origin.coord, c.coord) })).filter(c => c.distance <= limit);
  }
  function draw(pool, seen = new Set(), rng = Math.random) {
    if (!pool.length) return null;
    let available = pool.filter(c => !seen.has(c.id));
    if (!available.length) { seen.clear(); available = pool; }
    const city = available[Math.min(available.length - 1, Math.floor(Math.max(0, rng()) * available.length))];
    seen.add(city.id);
    return city;
  }
  // Only named cities are included, not ordinary counties, districts or subdistricts.
  // Municipalities live at province level; province-administered county cities may live at city level.
  function flattenDistricts(roots) {
    const result = new Map();
    function walk(node, province = "", parent = "") {
      if (!node || typeof node.name !== "string") return;
      if (node.level === "province") province = node.name;
      const special = /^(香港|澳门)特别行政区$/.test(node.name);
      const isCity = ["province", "city", "district"].includes(node.level) && /市$/.test(node.name);
      const coord = typeof node.center === "string" ? node.center.split(",").map(Number) : [];
      if ((isCity || special) && validCoord(coord) && /^\d{6}$/.test(node.adcode)) {
        const hierarchy = [...new Set([province, parent, node.name].filter(Boolean))];
        result.set(node.adcode, { id: node.adcode, name: node.name, province, parent, label: hierarchy.join(" · "), coord, level: node.level });
      }
      for (const child of node.districts || []) walk(child, province, node.level === "city" ? node.name : parent);
    }
    for (const root of roots || []) walk(root);
    return [...result.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
  const api = { distance, radiusForDays, candidates, draw, flattenDistricts, validCoord };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TRAVEL_DISCOVER_ENGINE = api;
})(typeof window !== "undefined" ? window : globalThis);
