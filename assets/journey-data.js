(function () {
  "use strict";

  const config = window.SUPABASE_CONFIG || {};
  const base = window.TRAVEL_DATA || {};
  const photos = window.PHOTO_MANIFEST || {};
  const summaryFields = "id,slug,title,start_date,sort_order";
  const journeyFields = `${summaryFields},end_date,is_published,cover_url,summary,distance_km,distance_is_estimated,accommodation,budget_amount,budget_currency,companions,planning_notes,travel_notes,reflection`;
  const stopFields = "id,journey_id,city_name,stop_order,arrival_date,departure_date,transport_to_next,notes";
  const photoFields = "id,city_name,image_url,caption,sort_order";
  const visits = window.TRAVEL_VISIT_ENGINE;
  const engine = window.TRAVEL_JOURNEY_ENGINE;
  const staticJourneys = new Map(engine.staticJourneys(base.journeys).map(journey => [journey.slug, journey]));
  let client;

  function configured() {
    return window.supabase?.createClient && config.url && config.publishableKey;
  }

  function getClient() {
    if (!configured()) throw new Error("旅程读取服务暂不可用");
    client ||= window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return client;
  }

  async function bounded(read) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => read(getClient(), controller.signal)),
        new Promise((_, reject) => {
          timer = window.setTimeout(() => {
            reject(new Error("旅程数据请求超时"));
            controller.abort();
          }, 8000);
        })
      ]);
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function rows(query, signal) {
    const result = await query.abortSignal(signal);
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function core(slug) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
    const staticJourney = staticJourneys.get(slug);
    if (staticJourney) return engine.mergeJourneys([staticJourney], [], [], [], base.guideDocuments, photos)[0];

    return bounded(async (db, signal) => {
      const query = (fields) => db.from("travel_journeys").select(fields).eq("slug", slug).eq("is_published", true).limit(1);
      const embedded = await rows(query(`${journeyFields},travel_journey_stops(${stopFields})`), signal).catch(error => {
        if (["PGRST200", "PGRST201"].includes(error.code)) return null;
        throw error;
      });
      if (embedded?.length === 0) return null;

      let row = embedded?.[0];
      let stops = row?.travel_journey_stops;
      if (!Array.isArray(stops)) {
        [row] = await rows(query(journeyFields), signal);
        if (!row) return null;
        stops = await rows(db.from("travel_journey_stops").select(stopFields).eq("journey_id", row.id), signal);
      }
      return engine.mergeJourneys([], [row], stops, [], [], {})[0] || null;
    });
  }

  function list() {
    const source = [...staticJourneys.values()];
    if (!configured() && source.length) return Promise.resolve(source);
    return bounded(async (db, signal) => {
      const summaries = await rows(db.from("travel_journeys").select(summaryFields).eq("is_published", true), signal);
      const publicSummaries = summaries.filter(row => !staticJourneys.has(row.slug)).map(row => ({
        id: row.id, slug: row.slug, title: row.title, startDate: row.start_date, sortOrder: row.sort_order
      }));
      return [...source, ...publicSummaries].sort((a, b) => b.startDate.localeCompare(a.startDate)
        || (a.sortOrder || 0) - (b.sortOrder || 0) || a.title.localeCompare(b.title, "zh-CN"));
    });
  }

  function gallery(journey) {
    if (journey.source === "base") {
      const source = staticJourneys.get(journey.slug);
      if (!configured() || source.photos || !source.photoCities?.length) return Promise.resolve(journey.photos);
      return bounded(async (db, signal) => {
        const records = await rows(db.from("city_photos").select("city_name,image_url,is_hidden,sort_order,created_at")
          .in("city_name", source.photoCities), signal);
        const manifest = window.TRAVEL_PHOTOS.mergeCityPhotoManifest(photos, records);
        return engine.normalizeBaseJourney(source, manifest).photos;
      });
    }
    return bounded(async (db, signal) => engine.normalizeJourneyPhotos(
      await rows(db.from("travel_journey_photos").select(photoFields).eq("journey_id", journey.id)
        .order("sort_order").order("id"), signal)
    ));
  }

  function guides(journey) {
    if (journey.source === "base" && !configured()) return Promise.resolve(journey.guides);
    return bounded(async (db, signal) => {
      const records = await rows(db.from("travel_guides").select("id,title,file_type,file_url")
        .eq("place_type", "journey").eq("is_hidden", false).in("place_name", [journey.slug, journey.id])
        .order("created_at", { ascending: false }), signal);
      return records.map(row => ({ id: row.id, title: row.title, fileType: row.file_type, fileUrl: row.file_url }));
    });
  }

  function baseVisits(journey) {
    const names = new Set(journey.stops.map(stop => stop.cityName));
    return (base.visits || []).filter(visit => names.has(visit.name));
  }

  function cityProfiles(journey) {
    const local = baseVisits(journey);
    const names = [...new Set(journey.stops.map(stop => stop.cityName))];
    if (!names.length || (!configured() && journey.source === "base")) return Promise.resolve(local);
    return bounded(async (db, signal) => visits.mergeCityVisits(local, await rows(
      db.from("travel_cities").select("name,country,region,visit_date,longitude,latitude,description,cover_url,is_hidden")
        .in("name", names), signal
    ), []));
  }

  function visitDates(journey) {
    const names = [...new Set(journey.stops.map(stop => stop.cityName))];
    const dates = [...new Set(journey.stops.map(stop => stop.arrivalDate).filter(Boolean))];
    if (!names.length || !dates.length || (!configured() && journey.source === "base")) return Promise.resolve([]);
    return bounded((db, signal) => rows(db.from("travel_city_visits").select("id,city_name,visit_date")
      .in("city_name", names).in("visit_date", dates), signal));
  }

  function representativePhoto(journey, city, galleryPhotos) {
    const localCityPhoto = photos[city]?.[0] || "";
    const fromGallery = galleryPhotos?.find(photo => photo.cityName === city)?.imageUrl;
    if (fromGallery) return Promise.resolve(fromGallery);
    if (journey.source === "base") {
      const linked = staticJourneys.get(journey.slug).photos?.find(photo => photo.cityName === city)?.imageUrl;
      if (linked || !configured()) return Promise.resolve(linked || localCityPhoto);
    }
    return bounded(async (db, signal) => {
      if (journey.source === "database" && !galleryPhotos) {
        const [linked] = await rows(db.from("travel_journey_photos").select("image_url")
          .eq("journey_id", journey.id).eq("city_name", city).order("sort_order").order("id").limit(1), signal);
        if (linked?.image_url) return linked.image_url;
      }
      // A hidden-only album replaces the built-in album just like it does on the homepage.
      const [first] = await rows(db.from("city_photos").select("image_url,is_hidden").eq("city_name", city)
        .order("is_hidden").order("sort_order").order("created_at").limit(1), signal);
      return first ? (first.is_hidden ? "" : first.image_url) : localCityPhoto;
    });
  }

  window.TRAVEL_JOURNEY_DATA = { core, list, gallery, guides, baseVisits, cityProfiles, visitDates, representativePhoto };
})();
