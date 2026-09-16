(function () {
  "use strict";

  const baseData = window.TRAVEL_DATA || { visits: [], wishlist: [] };
  const baseJourneys = baseData.journeys || [];
  const basePhotos = window.PHOTO_MANIFEST || {};
  const config = window.SUPABASE_CONFIG || {};
  const wishlistEngine = window.TRAVEL_WISHLIST_ENGINE || {};
  const normalizePriority = wishlistEngine.normalizePriority || ((value, fallback = 2) => {
    const parsed = Number(value);
    return [1, 2, 3].includes(parsed) ? parsed : fallback;
  });
  const sortWishlist = wishlistEngine.sortWishlist || ((items) => [...items].sort((a, b) => (
    b.priorityLevel - a.priorityLevel || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN")
  )));
  function photoDetailsFrom(manifest, rows = []) {
    const rowByUrl = new Map(
      rows.filter((row) => !row.is_hidden && row.image_url).map((row) => [row.image_url, row])
    );
    return Object.entries(manifest || {}).flatMap(([cityName, photos]) =>
      (photos || []).map((imageUrl, index) => {
        const row = rowByUrl.get(imageUrl);
        return {
          cityName,
          imageUrl,
          caption: row?.caption || "",
          createdAt: row?.created_at || "",
          source: row?.storage_path ? "后台上传" : "旅行相册",
          order: index + 1
        };
      })
    );
  }
  let state = {
    visits: [...baseData.visits],
    wishlist: [...baseData.wishlist],
    photoManifest: { ...basePhotos },
    photoDetails: photoDetailsFrom(basePhotos),
    guideDocuments: [...(baseData.guideDocuments || [])],
    journeys: window.TRAVEL_JOURNEY_ENGINE?.mergeJourneys(baseJourneys, [], [], [], baseData.guideDocuments || [], basePhotos) || baseJourneys,
    connected: false
  };

  function configured() {
    return Boolean(window.supabase?.createClient && config.url && config.publishableKey);
  }

  function localWishlist() {
    try {
      const value = JSON.parse(localStorage.getItem("sehuri.travelWishlist.v1") || "[]");
      return Array.isArray(value) ? value.filter((item) => (
        item && typeof item.name === "string" && item.name.trim()
      )) : [];
    } catch {
      return [];
    }
  }

  function mergeLocalWishlist(items) {
    const wishes = new Map(items.map((item) => [item.name, { ...item }]));
    localWishlist().forEach((item, index) => {
      wishes.set(item.name, {
        icon: "签",
        desc: "从随机旅行工具保存的目的地",
        guide: "出发前请重新核对交通、天气和开放信息。",
        ...wishes.get(item.name),
        ...item,
        priorityLevel: normalizePriority(item.priorityLevel, 1),
        sortOrder: Number(item.sortOrder ?? items.length + index)
      });
    });
    return sortWishlist([...wishes.values()].map((item) => ({
      ...item,
      priorityLevel: normalizePriority(item.priorityLevel)
    })));
  }

  function mergeWishlist(rows) {
    const wishes = new Map(baseData.wishlist.map((item, index) => [item.name, {
      ...item,
      priorityLevel: normalizePriority(item.priorityLevel),
      sortOrder: index
    }]));
    (rows || []).forEach((row) => {
      if (row.name === "成都 · 重庆") return;
      if (row.is_hidden) {
        wishes.delete(row.name);
        return;
      }
      const current = wishes.get(row.name) || {};
      wishes.set(row.name, {
        ...current,
        name: row.name,
        icon: row.icon || current.icon || "○",
        desc: row.description ?? current.desc ?? "",
        guide: row.guide ?? current.guide ?? "",
        plannedTime: row.planned_time ?? current.plannedTime ?? "",
        priorityLevel: normalizePriority(row.priority_level, current.priorityLevel),
        sortOrder: Number(row.sort_order ?? current.sortOrder ?? 0)
      });
    });
    return sortWishlist([...wishes.values()]);
  }

  async function loadWishlistRows(client) {
    const withPriority = await client.from("travel_wishlist")
      .select("name,icon,description,guide,planned_time,priority_level,sort_order,is_hidden");
    if (!withPriority.error) return withPriority;
    const legacy = await client.from("travel_wishlist")
      .select("name,icon,description,guide,planned_time,sort_order,is_hidden");
    return legacy;
  }

  function mergePhotos(rows) {
    const result = { ...basePhotos };
    const groups = new Map();
    (rows || []).forEach((row) => {
      if (!groups.has(row.city_name)) groups.set(row.city_name, []);
      groups.get(row.city_name).push(row);
    });
    groups.forEach((photos, cityName) => {
      result[cityName] = photos
        .filter((photo) => !photo.is_hidden)
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
        .map((photo) => photo.image_url);
    });
    return result;
  }

  function mergeGuides(rows) {
    return (rows || [])
      .filter((row) => !row.is_hidden && ["visited", "wishlist", "journey"].includes(row.place_type))
      .map((row) => ({
        id: row.id,
        placeType: row.place_type,
        placeName: row.place_name,
        title: row.title,
        fileType: row.file_type,
        fileUrl: row.file_url,
        fileSize: Number(row.file_size || 0),
        createdAt: row.created_at
      }));
  }

  async function load() {
    if (!configured()) return state;
    const client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    try {
      const [cities, visitDates, wishes, photos, guides, journeys, journeyStops, journeyPhotos] = await Promise.all([
        client.from("travel_cities").select("name,country,region,visit_date,longitude,latitude,description,cover_url,is_hidden"),
        client.from("travel_city_visits").select("id,city_name,visit_date"),
        loadWishlistRows(client),
        client.from("city_photos").select("city_name,image_url,storage_path,caption,sort_order,created_at,is_hidden"),
        client.from("travel_guides").select("id,place_type,place_name,title,file_type,file_url,file_size,created_at,is_hidden"),
        client.from("travel_journeys").select("id,slug,title,start_date,end_date,cover_url,summary,distance_km,distance_is_estimated,accommodation,budget_amount,budget_currency,companions,planning_notes,travel_notes,reflection,sort_order,is_published"),
        client.from("travel_journey_stops").select("id,journey_id,city_name,stop_order,arrival_date,departure_date,transport_to_next,notes"),
        client.from("travel_journey_photos").select("id,journey_id,city_name,image_url,caption,sort_order")
      ]);
      const hasError = cities.error || wishes.error || photos.error;
      if (hasError) return state;
      const photoManifest = mergePhotos(photos.data);
      const guideDocuments = guides.error ? [...(baseData.guideDocuments || [])] : mergeGuides(guides.data);
      const journeyTablesReady = !journeys.error && !journeyStops.error && !journeyPhotos.error;
      state = {
        visits: window.TRAVEL_VISIT_ENGINE.mergeCityVisits(baseData.visits, cities.data, visitDates.error ? [] : visitDates.data),
        wishlist: mergeLocalWishlist(mergeWishlist(wishes.data)),
        photoManifest,
        photoDetails: photoDetailsFrom(photoManifest, photos.data),
        guideDocuments,
        journeys: window.TRAVEL_JOURNEY_ENGINE?.mergeJourneys(
          baseJourneys,
          journeyTablesReady ? journeys.data : [],
          journeyTablesReady ? journeyStops.data : [],
          journeyTablesReady ? journeyPhotos.data : [],
          guideDocuments,
          photoManifest
        ) || baseJourneys,
        journeyTablesReady,
        connected: true
      };
      return state;
    } catch {
      return state;
    }
  }

  state.wishlist = mergeLocalWishlist(mergeWishlist([]));
  const ready = load();
  window.TRAVEL_CONTENT = {
    ready,
    getState: () => state
  };
})();
