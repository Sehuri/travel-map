(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TRAVEL_JOURNEY_ENGINE = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;

  function dateValue(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return NaN;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function inclusiveDays(startDate, endDate) {
    const start = dateValue(startDate);
    const end = dateValue(endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
    return Math.floor((end - start) / DAY_MS) + 1;
  }

  function dayBefore(value) {
    const time = dateValue(value);
    return Number.isFinite(time) ? new Date(time - DAY_MS).toISOString().slice(0, 10) : "";
  }

  // A stop may share its final calendar day with the next city (an evening transfer).
  // A later departure, however, cannot extend beyond the next stop or the journey itself.
  function effectiveStopDates(stops, journeyEndDate) {
    return [...(stops || [])].sort((a, b) => a.stopOrder - b.stopOrder).map((stop, index, ordered) => {
      const arrival = dateValue(stop.arrivalDate);
      if (!Number.isFinite(arrival)) return { ...stop };
      const nextArrival = dateValue(ordered[index + 1]?.arrivalDate);
      const journeyEnd = dateValue(journeyEndDate);
      let departureDate = stop.departureDate || "";
      let departure = dateValue(departureDate);
      let departureEstimated = false;
      if (!Number.isFinite(departure) || departure < arrival) {
        departureDate = Number.isFinite(nextArrival) && nextArrival >= arrival
          ? (nextArrival === arrival ? stop.arrivalDate : dayBefore(ordered[index + 1].arrivalDate))
          : Number.isFinite(journeyEnd) && journeyEnd >= arrival ? journeyEndDate : stop.arrivalDate;
        departure = dateValue(departureDate);
        departureEstimated = true;
      }
      if (Number.isFinite(nextArrival) && nextArrival >= arrival && departure > nextArrival) {
        departureDate = nextArrival === arrival ? stop.arrivalDate : dayBefore(ordered[index + 1].arrivalDate);
        departure = dateValue(departureDate);
        departureEstimated = true;
      }
      if (Number.isFinite(journeyEnd) && journeyEnd >= arrival && departure > journeyEnd) {
        departureDate = journeyEndDate;
        departureEstimated = true;
      }
      return { ...stop, departureDate, departureEstimated };
    });
  }

  function validateJourneyStops(startDate, endDate, stops) {
    const journeyStart = dateValue(startDate);
    const journeyEnd = dateValue(endDate);
    if (!Number.isFinite(journeyStart) || !Number.isFinite(journeyEnd) || journeyEnd < journeyStart) {
      return "请先填写有效的旅程起止日期。";
    }
    for (let index = 0; index < (stops || []).length; index += 1) {
      const stop = stops[index];
      const arrival = dateValue(stop.arrivalDate);
      const departure = stop.departureDate ? dateValue(stop.departureDate) : arrival;
      if (!Number.isFinite(arrival) || !Number.isFinite(departure)) return `第 ${index + 1} 站请填写有效的到达与离开日期。`;
      if (arrival < journeyStart || departure > journeyEnd || departure < arrival) {
        return `第 ${index + 1} 站的日期必须落在旅程起止日期内，且离开不能早于到达。`;
      }
      const nextArrival = dateValue(stops[index + 1]?.arrivalDate);
      if (Number.isFinite(nextArrival) && (nextArrival < arrival || departure > nextArrival)) {
        return `第 ${index + 1} 站不能在下一站到达后才离开；同日换城可以重叠。`;
      }
    }
    return "";
  }

  function expandBasePhotos(journey, photoManifest) {
    const cityNames = journey.photoCities || [];
    return cityNames.flatMap((cityName) => (photoManifest?.[cityName] || []).map((imageUrl, index) => ({
      id: `base:${journey.slug}:${cityName}:${index}`,
      cityName,
      imageUrl,
      caption: "",
      sortOrder: index
    })));
  }

  function normalizeBaseJourney(journey, photoManifest) {
    return {
      id: journey.id || `base:${journey.slug}`,
      slug: journey.slug,
      title: journey.title,
      startDate: journey.startDate,
      endDate: journey.endDate,
      days: inclusiveDays(journey.startDate, journey.endDate),
      coverUrl: journey.coverUrl || "",
      summary: journey.summary || "",
      distanceKm: Number(journey.distanceKm || 0),
      distanceEstimated: journey.distanceEstimated !== false,
      accommodation: journey.accommodation || "",
      budgetAmount: journey.budgetAmount === null || journey.budgetAmount === undefined ? null : Number(journey.budgetAmount),
      budgetCurrency: journey.budgetCurrency || "CNY",
      companions: journey.companions || "",
      planningNotes: journey.planningNotes || "",
      travelNotes: journey.travelNotes || "",
      reflection: journey.reflection || "",
      sortOrder: Number(journey.sortOrder || 0),
      source: "base",
      stops: effectiveStopDates((journey.stops || []).map((stop, index) => ({
        id: stop.id || `base:${journey.slug}:stop:${index}`,
        cityName: stop.cityName,
        stopOrder: Number(stop.stopOrder ?? index),
        arrivalDate: stop.arrivalDate || "",
        departureDate: stop.departureDate || "",
        transportToNext: stop.transportToNext || "",
        distanceToNextKm: Number(stop.distanceToNextKm || 0),
        notes: stop.notes || ""
      })), journey.endDate),
      photos: journey.photos || expandBasePhotos(journey, photoManifest),
      guides: []
    };
  }

  function rowJourney(row, fallback, stops, photos) {
    return {
      ...fallback,
      id: row.id,
      slug: row.slug,
      title: row.title,
      startDate: row.start_date,
      endDate: row.end_date,
      days: inclusiveDays(row.start_date, row.end_date),
      coverUrl: row.cover_url || "",
      summary: row.summary || "",
      distanceKm: Number(row.distance_km || 0),
      distanceEstimated: row.distance_is_estimated !== false,
      accommodation: row.accommodation || "",
      budgetAmount: row.budget_amount === null || row.budget_amount === undefined ? null : Number(row.budget_amount),
      budgetCurrency: row.budget_currency || "CNY",
      companions: row.companions || "",
      planningNotes: row.planning_notes || "",
      travelNotes: row.travel_notes || "",
      reflection: row.reflection || "",
      sortOrder: Number(row.sort_order || 0),
      source: "database",
      stops: effectiveStopDates(stops.map((stop) => ({
        id: stop.id,
        cityName: stop.city_name,
        stopOrder: Number(stop.stop_order),
        arrivalDate: stop.arrival_date || "",
        departureDate: stop.departure_date || "",
        transportToNext: stop.transport_to_next || "",
        distanceToNextKm: Number(stop.distance_to_next_km || 0),
        notes: stop.notes || ""
      })), row.end_date),
      photos: photos.map((photo) => ({
        id: photo.id,
        cityName: photo.city_name || "",
        imageUrl: photo.image_url,
        caption: photo.caption || "",
        sortOrder: Number(photo.sort_order || 0)
      })).sort((a, b) => a.sortOrder - b.sortOrder)
    };
  }

  function mergeJourneys(baseJourneys, rows, stopRows, photoRows, guides, photoManifest) {
    const journeys = new Map(
      (baseJourneys || []).map((journey) => [journey.slug, normalizeBaseJourney(journey, photoManifest)])
    );
    (rows || []).forEach((row) => {
      if (!row?.slug) return;
      if (!row.is_published) {
        journeys.delete(row.slug);
        return;
      }
      const fallback = journeys.get(row.slug) || {};
      const stops = (stopRows || []).filter((stop) => stop.journey_id === row.id);
      const photos = (photoRows || []).filter((photo) => photo.journey_id === row.id);
      journeys.set(row.slug, rowJourney(row, fallback, stops, photos));
    });

    return [...journeys.values()].map((journey) => ({
      ...journey,
      guides: (guides || []).filter((guide) => guide.placeType === "journey"
        && [journey.slug, journey.id].includes(guide.placeName))
    })).sort((a, b) => b.startDate.localeCompare(a.startDate)
      || a.sortOrder - b.sortOrder
      || a.title.localeCompare(b.title, "zh-CN"));
  }

  function journeysForCity(journeys, cityName) {
    return (journeys || []).filter((journey) => journey.stops.some((stop) => stop.cityName === cityName));
  }

  return { dateValue, inclusiveDays, effectiveStopDates, validateJourneyStops, normalizeBaseJourney, mergeJourneys, journeysForCity };
});
