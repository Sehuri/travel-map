(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TRAVEL_MEMORY_ENGINE = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;

  function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const time = Date.UTC(year, month - 1, day);
    const date = new Date(time);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
    return { value: match[0], year, month, day, time };
  }

  function localToday(date = new Date()) {
    if (typeof date === "string") return parseDate(date)?.value || "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function daysSince(date, today) {
    const start = parseDate(date);
    const end = parseDate(localToday(today));
    if (!start || !end || start.time > end.time) return null;
    return Math.floor((end.time - start.time) / DAY_MS);
  }

  function validVisits(visits) {
    return (visits || []).filter((visit) => visit?.name && parseDate(visit.date));
  }

  function cityMemories(visits) {
    const groups = new Map();
    validVisits(visits).forEach((visit) => {
      if (!groups.has(visit.name)) groups.set(visit.name, []);
      if (!groups.get(visit.name).some((item) => item.date === visit.date)) groups.get(visit.name).push(visit);
    });
    return [...groups.entries()].map(([name, items]) => {
      const ordered = [...items].sort((a, b) => a.date.localeCompare(b.date));
      return {
        name,
        visits: ordered,
        first: ordered[0],
        latest: ordered[ordered.length - 1],
        count: ordered.length
      };
    }).sort((a, b) => b.latest.date.localeCompare(a.latest.date) || a.name.localeCompare(b.name, "zh-CN"));
  }

  function buildMemorySnapshot(visits, journeys, today = new Date()) {
    const todayValue = localToday(today);
    const current = parseDate(todayValue);
    const items = validVisits(visits);
    const onThisDay = items.filter((visit) => {
      const date = parseDate(visit.date);
      return date.year < current.year && date.month === current.month && date.day === current.day;
    }).sort((a, b) => b.date.localeCompare(a.date));
    const monthVisits = items.filter((visit) => {
      const date = parseDate(visit.date);
      return date.time < current.time && date.month === current.month;
    }).sort((a, b) => b.date.localeCompare(a.date));
    const journeyAges = (journeys || []).map((journey) => ({
      ...journey,
      daysSince: daysSince(journey.endDate, todayValue)
    })).filter((journey) => journey.daysSince !== null)
      .sort((a, b) => b.endDate.localeCompare(a.endDate));
    const cities = cityMemories(items);
    const repeatCities = cities.filter((city) => city.count > 1)
      .sort((a, b) => b.count - a.count || b.latest.date.localeCompare(a.latest.date));
    return {
      today: todayValue,
      month: current.month,
      onThisDay,
      monthVisits,
      latestJourney: journeyAges[0] || null,
      journeyAges,
      cities,
      repeatCities
    };
  }

  function randomCityMemory(visits, random = Math.random, excludeName = "") {
    const cities = cityMemories(visits);
    const choices = cities.length > 1 && excludeName
      ? cities.filter((city) => city.name !== excludeName)
      : cities;
    if (!choices.length) return null;
    const index = Math.min(choices.length - 1, Math.max(0, Math.floor(Number(random()) * choices.length)));
    return choices[index];
  }

  return { parseDate, localToday, daysSince, cityMemories, buildMemorySnapshot, randomCityMemory };
});
