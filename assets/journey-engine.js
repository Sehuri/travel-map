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
      stops: (journey.stops || []).map((stop, index) => ({
        id: stop.id || `base:${journey.slug}:stop:${index}`,
        cityName: stop.cityName,
        stopOrder: Number(stop.stopOrder ?? index),
        arrivalDate: stop.arrivalDate || "",
        departureDate: stop.departureDate || "",
        transportToNext: stop.transportToNext || "",
        distanceToNextKm: Number(stop.distanceToNextKm || 0),
        notes: stop.notes || ""
      })).sort((a, b) => a.stopOrder - b.stopOrder),
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
      stops: stops.map((stop) => ({
        id: stop.id,
        cityName: stop.city_name,
        stopOrder: Number(stop.stop_order),
        arrivalDate: stop.arrival_date || "",
        departureDate: stop.departure_date || "",
        transportToNext: stop.transport_to_next || "",
        distanceToNextKm: Number(stop.distance_to_next_km || 0),
        notes: stop.notes || ""
      })).sort((a, b) => a.stopOrder - b.stopOrder),
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

  return { dateValue, inclusiveDays, normalizeBaseJourney, mergeJourneys, journeysForCity };
});
