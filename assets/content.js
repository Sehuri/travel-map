(function () {
  "use strict";

  const baseData = window.TRAVEL_DATA || { visits: [], wishlist: [] };
  const basePhotos = window.PHOTO_MANIFEST || {};
  const config = window.SUPABASE_CONFIG || {};
  let state = {
    visits: [...baseData.visits],
    wishlist: [...baseData.wishlist],
    photoManifest: { ...basePhotos },
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
        sortOrder: Number(item.sortOrder ?? items.length + index)
      });
    });
    return [...wishes.values()].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
  }

  function mergeCities(rows) {
    const cities = new Map(baseData.visits.map((visit) => [visit.name, { ...visit }]));
    (rows || []).forEach((row) => {
      if (row.is_hidden) {
        cities.delete(row.name);
        return;
      }
      const current = cities.get(row.name) || {};
      if (!row.country || !row.visit_date || row.longitude === null || row.latitude === null) return;
      cities.set(row.name, {
        ...current,
        name: row.name,
        country: row.country,
        region: row.region || current.region || "",
        date: row.visit_date,
        coord: [Number(row.longitude), Number(row.latitude)],
        desc: row.description ?? current.desc ?? "",
        coverUrl: row.cover_url || ""
      });
    });
    return [...cities.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function mergeWishlist(rows) {
    const wishes = new Map(baseData.wishlist.map((item, index) => [item.name, { ...item, sortOrder: index }]));
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
        sortOrder: Number(row.sort_order ?? current.sortOrder ?? 0)
      });
    });
    return [...wishes.values()]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));
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

  async function load() {
    if (!configured()) return state;
    const client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    try {
      const [cities, wishes, photos] = await Promise.all([
        client.from("travel_cities").select("name,country,region,visit_date,longitude,latitude,description,cover_url,is_hidden"),
        client.from("travel_wishlist").select("name,icon,description,guide,planned_time,sort_order,is_hidden"),
        client.from("city_photos").select("city_name,image_url,sort_order,created_at,is_hidden")
      ]);
      const hasError = cities.error || wishes.error || photos.error;
      if (hasError) return state;
      state = {
        visits: mergeCities(cities.data),
        wishlist: mergeLocalWishlist(mergeWishlist(wishes.data)),
        photoManifest: mergePhotos(photos.data),
        connected: true
      };
      return state;
    } catch {
      return state;
    }
  }

  state.wishlist = mergeLocalWishlist(state.wishlist);
  const ready = load();
  window.TRAVEL_CONTENT = {
    ready,
    getState: () => state
  };
})();
