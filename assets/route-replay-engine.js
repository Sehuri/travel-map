(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TRAVEL_ROUTE_REPLAY_ENGINE = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;
  const TRANSPORT_TYPES = Object.freeze({
    flight: { label: "飞机", color: "#ffad66", pattern: /飞机|航班|飞行|航空/u },
    rail: { label: "铁路", color: "#e4ff75", pattern: /新干线|高铁|动车|火车|铁路|列车|电车|地铁|\bJR\b/iu },
    road: { label: "驾车", color: "#57d8d0", pattern: /自驾|驾车|汽车|包车|出租|网约车|的士/u },
    transit: { label: "巴士", color: "#b5a3ff", pattern: /巴士|公交|客车|大巴/u },
    ferry: { label: "水路", color: "#69a9ff", pattern: /轮渡|渡轮|游船|坐船|船运|邮轮/u },
    walk: { label: "步行", color: "#f1c7ef", pattern: /步行|徒步|骑行|自行车/u },
    other: { label: "其他", color: "#eef3ea", pattern: /(?:)/u }
  });

  function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const time = Date.UTC(year, month - 1, day);
    const date = new Date(time);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
    return { value: match[0], time };
  }

  function dateBefore(value) {
    const parsed = parseDate(value);
    if (!parsed) return "";
    return new Date(parsed.time - DAY_MS).toISOString().slice(0, 10);
  }

  function inclusiveDays(startDate, endDate) {
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (!start || !end || end.time < start.time) return 0;
    return Math.floor((end.time - start.time) / DAY_MS) + 1;
  }

  function haversineKm(first, second) {
    if (![first, second].every((coord) => Array.isArray(coord) && coord.length === 2 && coord.every(Number.isFinite))) return 0;
    const rad = (value) => value * Math.PI / 180;
    const lat1 = rad(first[1]);
    const lat2 = rad(second[1]);
    const dLat = lat2 - lat1;
    const dLng = rad(second[0] - first[0]);
    const value = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return Math.round(6371 * 2 * Math.asin(Math.sqrt(Math.min(1, value))));
  }

  function distanceFromText(value) {
    const match = String(value || "").replaceAll(",", "").match(/(\d+(?:\.\d+)?)\s*(?:km|公里)/iu);
    return match ? Number(match[1]) : 0;
  }

  function transportType(value, distanceKm = 0) {
    const text = String(value || "");
    const matched = Object.entries(TRANSPORT_TYPES)
      .find(([key, item]) => key !== "other" && item.pattern.test(text));
    if (matched) return matched[0];
    if (distanceKm >= 800) return "flight";
    if (distanceKm >= 120) return "rail";
    return "road";
  }

  function cityProfiles(visits) {
    const profiles = new Map();
    (visits || []).forEach((visit) => {
      if (!visit?.name || profiles.has(visit.name)) return;
      if (!Array.isArray(visit.coord) || visit.coord.length !== 2 || !visit.coord.every(Number.isFinite)) return;
      profiles.set(visit.name, visit);
    });
    return profiles;
  }

  function representativePhoto(journey, cityName, photoManifest) {
    return (journey.photos || []).find((photo) => photo.cityName === cityName)?.imageUrl
      || photoManifest?.[cityName]?.[0]
      || "";
  }

  function buildReplay(journey, visits, photoManifest) {
    const profiles = cityProfiles(visits);
    const rawStops = (journey?.stops || []).map((stop) => ({ ...stop }));
    const stops = rawStops.map((stop, index) => {
      const profile = profiles.get(stop.cityName) || {};
      const next = rawStops[index + 1];
      let departureDate = stop.departureDate || "";
      let departureEstimated = false;
      if (!departureDate && next?.arrivalDate) {
        departureDate = dateBefore(next.arrivalDate);
        departureEstimated = Boolean(departureDate);
      }
      if (!departureDate && index === rawStops.length - 1) {
        departureDate = journey?.endDate || stop.arrivalDate || "";
        departureEstimated = Boolean(departureDate && departureDate !== stop.departureDate);
      }
      if (parseDate(departureDate)?.time < parseDate(stop.arrivalDate)?.time) departureDate = stop.arrivalDate;
      return {
        ...stop,
        coord: Array.isArray(profile.coord) ? [...profile.coord] : null,
        country: profile.country || "",
        description: stop.notes || profile.desc || "",
        departureDate,
        departureEstimated,
        stayDays: inclusiveDays(stop.arrivalDate, departureDate) || (stop.arrivalDate ? 1 : 0),
        photoUrl: representativePhoto(journey || {}, stop.cityName, photoManifest)
      };
    });
    const segments = stops.slice(0, -1).map((stop, index) => {
      const next = stops[index + 1];
      const explicitDistance = Number(stop.distanceToNextKm || 0) || distanceFromText(stop.transportToNext);
      const distanceKm = Math.round(explicitDistance || haversineKm(stop.coord, next.coord));
      const type = transportType(stop.transportToNext, distanceKm);
      return {
        index,
        from: stop.cityName,
        to: next.cityName,
        label: stop.transportToNext || `${TRANSPORT_TYPES[type].label}（估算）`,
        type,
        color: TRANSPORT_TYPES[type].color,
        distanceKm,
        distanceEstimated: !explicitDistance
      };
    });
    return { journey, stops, segments };
  }

  function projectStops(stops, width = 1000, height = 520, padding = 78) {
    const valid = (stops || []).filter((stop) => Array.isArray(stop.coord) && stop.coord.every(Number.isFinite));
    if (!valid.length) return [];
    if (valid.length === 1) return [{ stopIndex: stops.indexOf(valid[0]), x: width / 2, y: height / 2 }];
    const meanLat = valid.reduce((sum, stop) => sum + stop.coord[1], 0) / valid.length;
    const longitudeScale = Math.max(.2, Math.cos(meanLat * Math.PI / 180));
    const points = valid.map((stop) => ({
      stopIndex: stops.indexOf(stop),
      rawX: stop.coord[0] * longitudeScale,
      rawY: -stop.coord[1]
    }));
    const xs = points.map((point) => point.rawX);
    const ys = points.map((point) => point.rawY);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rangeX = Math.max(maxX - minX, .25);
    const rangeY = Math.max(maxY - minY, .25);
    const scale = Math.min((width - padding * 2) / rangeX, (height - padding * 2) / rangeY);
    const usedWidth = (maxX - minX) * scale;
    const usedHeight = (maxY - minY) * scale;
    const left = (width - usedWidth) / 2;
    const top = (height - usedHeight) / 2;
    const projected = points.map((point) => ({
      stopIndex: point.stopIndex,
      x: left + (point.rawX - minX) * scale,
      y: top + (point.rawY - minY) * scale
    }));
    const coordinateGroups = new Map();
    valid.forEach((stop) => {
      const key = stop.coord.map((value) => value.toFixed(5)).join(",");
      if (!coordinateGroups.has(key)) coordinateGroups.set(key, []);
      coordinateGroups.get(key).push(stops.indexOf(stop));
    });
    coordinateGroups.forEach((indices) => {
      if (indices.length < 2) return;
      indices.forEach((stopIndex, index) => {
        const point = projected.find((item) => item.stopIndex === stopIndex);
        if (!point) return;
        point.x = Math.min(width - padding, Math.max(padding, point.x + (index - (indices.length - 1) / 2) * 30));
        point.y = Math.min(height - padding, Math.max(padding, point.y + (index % 2 === 0 ? 1 : -1) * 14));
      });
    });
    for (let pass = 0; pass < 3; pass += 1) {
      projected.forEach((point, index) => {
        projected.slice(0, index).forEach((previous) => {
          const dx = point.x - previous.x;
          const dy = point.y - previous.y;
          const distance = Math.hypot(dx, dy);
          if (distance >= 68) return;
          const push = 68 - distance;
          if (Math.abs(dx) >= Math.abs(dy)) point.x += (dx >= 0 ? 1 : -1) * push;
          else point.y += (dy || (index % 2 ? -1 : 1)) > 0 ? push : -push;
          point.x = Math.min(width - padding, Math.max(padding, point.x));
          point.y = Math.min(height - padding, Math.max(padding, point.y));
        });
      });
    }
    return projected;
  }

  function createShareUrl(href, slug, stopIndex = 0) {
    const url = new URL(href);
    url.searchParams.set("slug", slug);
    url.searchParams.set("replay", "1");
    url.searchParams.set("stop", String(Math.max(0, Number(stopIndex) || 0) + 1));
    url.hash = "route-replay";
    return url.toString();
  }

  return {
    TRANSPORT_TYPES,
    parseDate,
    inclusiveDays,
    haversineKm,
    distanceFromText,
    transportType,
    buildReplay,
    projectStops,
    createShareUrl
  };
});
