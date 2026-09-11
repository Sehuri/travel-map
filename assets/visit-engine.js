(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TRAVEL_VISIT_ENGINE = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function uniqueCities(visits) {
    const cities = new Map();
    (visits || []).forEach((visit) => {
      if (visit?.name) cities.set(visit.name, visit);
    });
    return [...cities.values()];
  }

  function mergeCityVisits(baseVisits, cityRows, additionalRows) {
    const profiles = new Map();
    const dates = new Map();

    (baseVisits || []).forEach((visit) => {
      if (!visit?.name || !validDate(visit.date)) return;
      if (!profiles.has(visit.name)) profiles.set(visit.name, { ...visit });
      if (!dates.has(visit.name)) dates.set(visit.name, []);
      dates.get(visit.name).push({ date: visit.date, visitId: visit.visitId || `base:${visit.name}:${visit.date}` });
    });

    (cityRows || []).forEach((row) => {
      if (!row?.name) return;
      if (row.is_hidden) {
        profiles.delete(row.name);
        dates.delete(row.name);
        return;
      }
      if (!row.country || !validDate(row.visit_date) || row.longitude === null || row.latitude === null) return;
      const current = profiles.get(row.name) || {};
      const existingDates = dates.get(row.name) || [];
      const remainingDates = existingDates.slice(1);
      profiles.set(row.name, {
        ...current,
        name: row.name,
        country: row.country,
        region: row.region || current.region || "",
        coord: [Number(row.longitude), Number(row.latitude)],
        desc: row.description ?? current.desc ?? "",
        coverUrl: row.cover_url || ""
      });
      dates.set(row.name, [
        { date: row.visit_date, visitId: `primary:${row.name}:${row.visit_date}` },
        ...remainingDates
      ]);
    });

    (additionalRows || []).forEach((row) => {
      if (!row?.city_name || !profiles.has(row.city_name) || !validDate(row.visit_date)) return;
      if (!dates.has(row.city_name)) dates.set(row.city_name, []);
      dates.get(row.city_name).push({
        date: row.visit_date,
        visitId: row.id || `extra:${row.city_name}:${row.visit_date}`
      });
    });

    return [...profiles.entries()].flatMap(([name, profile]) => {
      const seen = new Set();
      return (dates.get(name) || [])
        .filter(({ date }) => !seen.has(date) && seen.add(date))
        .map(({ date, visitId }) => ({ ...profile, name, date, visitId }));
    }).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "zh-CN"));
  }

  return { validDate, uniqueCities, mergeCityVisits };
});
