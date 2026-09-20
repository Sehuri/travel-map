(function () {
  "use strict";

  let visits = [];
  let wishlist = [];
  let photoManifest = {};
  let photoDetails = [];
  let guideDocuments = [];
  let journeys = [];
  let personalStats = null;
  let memorySnapshot = null;
  let randomMemory = null;
  let repeatMemoryIndex = 0;
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const originalTitle = document.title;
  const regionGroups = {
    "中国 · 华东": ["日照", "滁州", "淮安", "青岛", "南京", "杭州", "泰州", "上海", "苏州", "扬州", "合肥", "九江", "南昌", "芜湖", "上饶", "黄山", "泰安", "镇江", "济南", "烟台", "马鞍山", "无锡", "常州", "嘉兴", "厦门", "福州", "漳州", "威海", "宁波", "台州", "六安", "绍兴"],
    "中国 · 华中": ["武汉", "洛阳", "郑州", "长沙", "湘潭", "衡阳"],
    "中国 · 华南": ["三亚", "香港", "深圳"],
    "中国 · 华北": ["北京"],
    "中国 · 东北": ["大连", "哈尔滨", "沈阳"],
    "中国 · 西北": ["渭南", "西安", "银川", "阿拉善盟"],
    "日本 · 关西": ["大阪", "京都"],
    "日本 · 关东": ["东京", "镰仓"]
  };
  const regionByCity = new Map(
    Object.entries(regionGroups).flatMap(([region, cities]) => cities.map((city) => [city, region]))
  );

  const timeline = document.querySelector("#timeline");
  const yearFilter = document.querySelector("#year-filter");
  const locationFilter = document.querySelector("#location-filter");
  const ratingFilter = document.querySelector("#rating-filter");
  const citySearch = document.querySelector("#city-search");
  const clearFiltersButton = document.querySelector("#clear-filters");
  const filterSummary = document.querySelector("#filter-summary");
  const rankingList = document.querySelector("#ranking-list");
  const rankingStatus = document.querySelector("#ranking-status");
  const statsDialog = document.querySelector("#stats-dialog");
  const cityDialog = document.querySelector("#city-dialog");
  const guideDialog = document.querySelector("#guide-dialog");
  const lightbox = document.querySelector("#lightbox");
  let chinaMap;
  let worldMap;
  let worldJourneyLayer;
  let worldWishlistLayer;
  let worldMarkers = [];
  let worldWishlistMarkers = [];
  let mapView = "china";
  let chinaMarkers = [];
  let wishlistMarkers = [];
  let chinaDistrictLayer;
  let chinaMapPromise;
  let amapLoadPromise;
  let activeMarker = null;
  let activeWishlistMarker = null;
  let activeCity = null;
  let mapMode = "journeys";
  let visibleJourneyVisits = [];
  let filtersActive = false;
  let syncingHistory = false;
  let lightboxReturnState = null;
  let lightboxReturnFocus = null;
  const wishlistEngine = window.TRAVEL_WISHLIST_ENGINE || {};
  const normalizeWishPriority = wishlistEngine.normalizePriority || ((value) => [1, 2, 3].includes(Number(value)) ? Number(value) : 2);
  const wishPriorityMeta = wishlistEngine.priorityMeta || ((value) => ({
    level: normalizeWishPriority(value),
    label: ({ 1: "有机会去", 2: "很想去", 3: "最想去" })[normalizeWishPriority(value)],
    heading: ({ 1: "有机会去 · 慢慢收藏", 2: "很想去 · 等待合适时机", 3: "最想去 · 优先计划" })[normalizeWishPriority(value)],
    description: ""
  }));
  const groupWishlist = wishlistEngine.groupWishlist || ((items) => [{
    ...wishPriorityMeta(2),
    items
  }]);
  let ratingSummaries = new Map();
  let ratingsLoaded = false;
  let ratingsFailed = false;
  const statAnimations = new WeakMap();

  function countUp(element, target) {
    const previousAnimation = statAnimations.get(element);
    if (previousAnimation) cancelAnimationFrame(previousAnimation);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.textContent = target;
      statAnimations.delete(element);
      return;
    }
    const duration = 900;
    const started = performance.now();
    function tick(now) {
      const progress = Math.min((now - started) / duration, 1);
      element.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) statAnimations.set(element, requestAnimationFrame(tick));
      else statAnimations.delete(element);
    }
    statAnimations.set(element, requestAnimationFrame(tick));
  }

  function uniqueCityVisits(items) {
    if (window.TRAVEL_VISIT_ENGINE?.uniqueCities) return window.TRAVEL_VISIT_ENGINE.uniqueCities(items);
    return [...new Map(items.map((visit) => [visit.name, visit])).values()];
  }

  function visitKey(visit) {
    return visit.visitId || `${visit.name}:${visit.date}`;
  }

  function formatResultCount(items) {
    const cityTotal = uniqueCityVisits(items).length;
    return items.length === cityTotal
      ? `${cityTotal} 座城市`
      : `${items.length} 次到访 · ${cityTotal} 座城市`;
  }

  function updateTravelStats(items, animate = false) {
    const cityTotal = uniqueCityVisits(items).length;
    const countries = new Set(items.map((visit) => visit.country));
    const years = new Set(items.map((visit) => visit.date.slice(0, 4)));
    const update = (selector, value) => {
      const element = document.querySelector(selector);
      if (animate) countUp(element, value);
      else {
        const animation = statAnimations.get(element);
        if (animation) cancelAnimationFrame(animation);
        statAnimations.delete(element);
        element.textContent = value;
      }
    };
    update("#city-count", cityTotal);
    update("#country-count", countries.size);
    update("#year-count", years.size);
    update("#route-city-count", items.length);
    update("#route-country-count", countries.size);
  }

  function initializeStats() {
    updateTravelStats(visits, true);
    document.querySelector("#current-year").textContent = new Date().getFullYear();
  }

  function initializePersonalStats() {
    const engine = window.TRAVEL_STATS_ENGINE;
    if (!engine?.buildTravelStats) return;
    const stats = engine.buildTravelStats(visits, photoManifest);
    personalStats = stats;
    const number = new Intl.NumberFormat("zh-CN");
    const setText = (selector, value) => {
      const element = document.querySelector(selector);
      if (element) element.textContent = value;
    };

    setText("#stat-travel-days", number.format(stats.elapsedDays));
    const firstVisitLabel = stats.firstVisitDate
      ? dateFormatter.format(new Date(`${stats.firstVisitDate}T00:00:00`))
      : "第一次出发";
    setText("#stat-trip-count", `${stats.firstVisitName ? `首站${stats.firstVisitName} · ` : ""}从 ${firstVisitLabel} 计至今天`);
    setText("#stat-distance", number.format(stats.distanceKm));
    setText("#stat-province-count", stats.provinceCount);
    setText("#stat-province-percent", `${stats.provincePercent}% 中国省级地区`);
    setText("#stat-country-count", stats.countryCount);
    setText("#stat-country-percent", `${stats.countryPercent}% 全球国家和地区`);
    setText("#stat-photo-count", number.format(stats.photoCount));
    setText("#stat-photo-cities", `${stats.photoCityCount} 座城市留有影像`);

    const provinceProgress = document.querySelector("#stat-province-progress");
    const countryProgress = document.querySelector("#stat-country-progress");
    if (provinceProgress) provinceProgress.style.width = `${stats.provincePercent}%`;
    if (countryProgress) countryProgress.style.width = `${stats.countryPercent}%`;

    if (stats.repeatCities.length) {
      const highestCount = stats.repeatCities[0][1];
      const leaders = stats.repeatCities
        .filter(([, count]) => count === highestCount)
        .map(([city]) => city);
      const visibleLeaders = leaders.slice(0, 2).join("、") + (leaders.length > 2 ? "等" : "");
      setText("#stat-repeat-city", visibleLeaders);
      setText("#stat-repeat-count", `各到访 ${highestCount} 次${stats.repeatCities.length > leaders.length ? ` · 共 ${stats.repeatCities.length} 座城市曾重游` : ""}`);
    }

    const heatmap = document.querySelector("#month-heatmap");
    if (!heatmap) return;
    heatmap.replaceChildren();
    const maxCount = Math.max(...stats.monthCounts, 1);
    stats.monthCounts.forEach((count, index) => {
      const cell = document.createElement("div");
      cell.className = "month-heat-cell";
      cell.style.setProperty("--heat", count ? String(.16 + count / maxCount * .84) : "0");
      cell.setAttribute("aria-label", `${index + 1}月，${count}次到访`);
      const month = document.createElement("span");
      month.textContent = `${String(index + 1).padStart(2, "0")} 月`;
      const value = document.createElement("strong");
      value.textContent = count;
      cell.append(month, value);
      heatmap.append(cell);
    });

    const busiest = Math.max(...stats.monthCounts);
    const busiestMonths = stats.monthCounts
      .map((count, index) => count === busiest ? `${index + 1} 月` : "")
      .filter(Boolean)
      .join("、");
    setText("#month-heatmap-summary", busiest ? `${busiestMonths}最常出发 · ${busiest} 次城市到访` : "按每次城市到访日期统计");
  }

  function detailHeading(text) {
    const heading = document.createElement("h3");
    heading.className = "stats-detail-heading";
    heading.textContent = text;
    return heading;
  }

  function detailPill(text, className = "") {
    const pill = document.createElement("span");
    pill.className = `stats-detail-pill ${className}`.trim();
    pill.textContent = text;
    return pill;
  }

  function setStatsDialogHeader(kicker, title, description) {
    document.querySelector("#stats-dialog-kicker").textContent = kicker;
    document.querySelector("#stats-dialog-title").textContent = title;
    document.querySelector("#stats-dialog-description").textContent = description;
  }

  function renderProvinceDetails(body) {
    setStatsDialogHeader(
      "PROVINCIAL COVERAGE",
      "省级地区覆盖",
      `已抵达 ${personalStats.provinceCount} 个，尚有 ${personalStats.provinceTotal - personalStats.provinceCount} 个等待探索。直辖市、自治区及特别行政区均按省级地区统计。`
    );
    const visited = personalStats.provinceDetails.filter((item) => item.visited);
    const awaiting = personalStats.provinceDetails.filter((item) => !item.visited);
    body.append(detailHeading(`已经抵达 · ${visited.length}`));
    const visitedGrid = document.createElement("div");
    visitedGrid.className = "coverage-detail-grid";
    visited.forEach((item) => {
      const card = document.createElement("article");
      card.className = "coverage-detail-card is-visited";
      const status = document.createElement("span");
      status.textContent = `${item.visitCount} 次到访`;
      const name = document.createElement("strong");
      name.textContent = item.name;
      const cities = document.createElement("p");
      cities.textContent = item.cities.join("、");
      card.append(status, name, cities);
      visitedGrid.append(card);
    });
    body.append(visitedGrid, detailHeading(`仍在期待 · ${awaiting.length}`));
    const awaitingGrid = document.createElement("div");
    awaitingGrid.className = "stats-detail-pills";
    awaiting.forEach((item) => awaitingGrid.append(detailPill(item.name, "is-muted")));
    body.append(awaitingGrid);
  }

  function renderCountryDetails(body) {
    setStatsDialogHeader(
      "COUNTRIES & REGIONS",
      "国家和地区覆盖",
      `目前记录了 ${personalStats.countryCount} 个国家和地区，共 ${visits.length} 次城市到访。`
    );
    const list = document.createElement("div");
    list.className = "country-detail-list";
    personalStats.countryDetails.forEach((item) => {
      const card = document.createElement("article");
      card.className = "country-detail-card";
      const heading = document.createElement("div");
      const name = document.createElement("h3");
      name.textContent = item.name;
      const count = document.createElement("strong");
      count.textContent = `${item.visitCount} 次到访 · ${item.cities.length} 座城市`;
      heading.append(name, count);
      const range = document.createElement("p");
      range.textContent = item.firstDate === item.lastDate
        ? `记录日期 ${item.firstDate}`
        : `从 ${item.firstDate} 到 ${item.lastDate}`;
      const cities = document.createElement("div");
      cities.className = "stats-detail-pills";
      item.cities.forEach((city) => cities.append(detailPill(city)));
      card.append(heading, range, cities);
      list.append(card);
    });
    body.append(list);
  }

  function renderRepeatDetails(body) {
    setStatsDialogHeader(
      "RETURN JOURNEYS",
      "重游过的城市",
      personalStats.repeatDetails.length
        ? `共有 ${personalStats.repeatDetails.length} 座城市不止一次出现在时间线上。`
        : "每座城市目前只记录了一次到访。"
    );
    if (!personalStats.repeatDetails.length) {
      const empty = document.createElement("p");
      empty.className = "stats-detail-empty";
      empty.textContent = "等下一次故地重游，这里就会自动留下记录。";
      body.append(empty);
      return;
    }
    const list = document.createElement("div");
    list.className = "repeat-detail-list";
    personalStats.repeatDetails.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "repeat-detail-card";
      const rank = document.createElement("span");
      rank.className = "repeat-detail-rank";
      rank.textContent = String(index + 1).padStart(2, "0");
      const copy = document.createElement("div");
      const name = document.createElement("h3");
      name.textContent = item.name;
      const dates = document.createElement("div");
      dates.className = "repeat-date-list";
      item.dates.forEach((date) => dates.append(detailPill(date)));
      copy.append(name, dates);
      const count = document.createElement("strong");
      count.textContent = `${item.count} 次`;
      card.append(rank, copy, count);
      list.append(card);
    });
    body.append(list);
  }

  function renderPhotoDetails(body) {
    setStatsDialogHeader(
      "PHOTO ARCHIVE",
      "全部旅行照片",
      `${personalStats.photoCityCount} 座城市，共收藏 ${personalStats.photoCount} 张照片。点击照片可以放大查看。`
    );
    if (!photoDetails.length) {
      const empty = document.createElement("p");
      empty.className = "stats-detail-empty";
      empty.textContent = "旅行相册目前还是空的。";
      body.append(empty);
      return;
    }
    const visitDatesByCity = new Map();
    visits.forEach((visit) => {
      if (!visitDatesByCity.has(visit.name)) visitDatesByCity.set(visit.name, []);
      if (!visitDatesByCity.get(visit.name).includes(visit.date)) visitDatesByCity.get(visit.name).push(visit.date);
    });
    const gallery = document.createElement("div");
    gallery.className = "photo-archive-grid";
    const toolbar = document.createElement("div");
    toolbar.className = "photo-wall-toolbar";
    const label = document.createElement("label");
    label.textContent = "按城市回忆 ";
    const filter = document.createElement("select");
    filter.id = "photo-wall-city";
    filter.add(new Option("所有城市", ""));
    [...new Set(photoDetails.map(photo => photo.cityName))].forEach(city => filter.add(new Option(city, city)));
    label.append(filter);
    const total = document.createElement("span");
    total.className = "photo-wall-count";
    total.setAttribute("role", "status");
    total.textContent = `${photoDetails.length} 张记忆`;
    const slideshow = document.createElement("button");
    slideshow.type = "button";
    slideshow.textContent = "▶ 放映全部照片";
    slideshow.addEventListener("click", () => {
      statsDialog.close();
      document.querySelector("#photo-cinema").scrollIntoView({ behavior: "smooth", block: "center" });
      const play = document.querySelector("#cinema-play");
      if (play.getAttribute("aria-pressed") !== "true") play.click();
      play.focus({ preventScroll: true });
    });
    toolbar.append(label, total, slideshow);
    filter.addEventListener("change", () => {
      let visible = 0;
      [...gallery.children].forEach(card => {
        card.hidden = !!filter.value && card.dataset.city !== filter.value;
        if (!card.hidden) visible++;
      });
      total.textContent = `${visible} 张记忆`;
    });
    photoDetails.forEach((photo) => {
      const figure = document.createElement("figure");
      figure.className = "photo-archive-card";
      figure.dataset.city = photo.cityName;
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `放大查看${photo.cityName}第${photo.order}张照片`);
      const image = document.createElement("img");
      image.src = photo.imageUrl;
      image.alt = photo.caption || `${photo.cityName}旅行照片 ${photo.order}`;
      image.loading = "lazy";
      button.append(image);
      button.addEventListener("click", () => {
        lightboxReturnState = {
          dialog: statsDialog,
          scrollTop: statsDialog.scrollTop,
          focusTarget: button
        };
        statsDialog.close();
        requestAnimationFrame(() => openLightbox(photo.imageUrl, image.alt));
      });
      const caption = document.createElement("figcaption");
      const city = document.createElement("strong");
      city.textContent = photo.cityName;
      const description = document.createElement("span");
      description.textContent = photo.caption || `旅行照片 ${photo.order}`;
      const dates = document.createElement("small");
      dates.textContent = `到访：${(visitDatesByCity.get(photo.cityName) || []).join("、") || "日期待补充"}`;
      caption.append(city, description, dates);
      figure.append(button, caption);
      gallery.append(figure);
    });
    body.append(toolbar, gallery);
  }

  function openStatsDetail(type) {
    if (!personalStats || !statsDialog) return;
    const body = document.querySelector("#stats-detail-body");
    body.replaceChildren();
    statsDialog.classList.toggle("stats-dialog--photos", type === "photos");
    if (type === "provinces") renderProvinceDetails(body);
    if (type === "countries") renderCountryDetails(body);
    if (type === "repeats") renderRepeatDetails(body);
    if (type === "photos") renderPhotoDetails(body);
    statsDialog.showModal();
  }

  function initializeStatsDetails() {
    document.querySelectorAll("[data-stat-detail]").forEach((card) => {
      card.addEventListener("click", () => openStatsDetail(card.dataset.statDetail));
      card.addEventListener("keydown", (event) => {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        openStatsDetail(card.dataset.statDetail);
      });
    });
  }

  function initializeExtremeFootprints(items = visits) {
    const grid = document.querySelector("#extremes-grid");
    grid.replaceChildren();
    if (!items.length) return;
    const findExtreme = (axis, comparison) => items.reduce((extreme, visit) => (
      comparison(visit.coord[axis], extreme.coord[axis]) ? visit : extreme
    ));
    const extremes = [
      { direction: "N", label: "最北足迹", visit: findExtreme(1, (value, current) => value > current), axis: 1 },
      { direction: "S", label: "最南足迹", visit: findExtreme(1, (value, current) => value < current), axis: 1 },
      { direction: "E", label: "最东足迹", visit: findExtreme(0, (value, current) => value > current), axis: 0 },
      { direction: "W", label: "最西足迹", visit: findExtreme(0, (value, current) => value < current), axis: 0 }
    ];

    extremes.forEach(({ direction, label, visit, axis }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "extreme-card";
      button.setAttribute("aria-label", `${label}：${visit.name}`);

      const compass = document.createElement("span");
      compass.className = "extreme-direction";
      compass.setAttribute("aria-hidden", "true");
      compass.textContent = direction;

      const copy = document.createElement("span");
      copy.className = "extreme-copy";
      const caption = document.createElement("small");
      caption.textContent = label;
      const city = document.createElement("strong");
      city.textContent = visit.name;
      const coordinate = document.createElement("span");
      const coordinateValue = visit.coord[axis];
      const suffix = axis === 1
        ? (coordinateValue >= 0 ? "N" : "S")
        : (coordinateValue >= 0 ? "E" : "W");
      coordinate.textContent = `${Math.abs(coordinateValue).toFixed(2)}° ${suffix} · ${visit.country}`;
      copy.append(caption, city, coordinate);

      const arrow = document.createElement("span");
      arrow.className = "extreme-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";

      button.append(compass, copy, arrow);
      button.addEventListener("click", () => openCity(visit));
      grid.append(button);
    });
  }

  function initializeFilters() {
    const years = [...new Set(visits.map((visit) => visit.date.slice(0, 4)))].sort().reverse();
    years.forEach((year) => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = `${year} 年`;
      yearFilter.append(option);
    });

    const countryGroup = document.createElement("optgroup");
    countryGroup.label = "国家";
    [...new Set(visits.map((visit) => visit.country))].sort().forEach((country) => {
      const option = document.createElement("option");
      option.value = `country:${country}`;
      option.textContent = country;
      countryGroup.append(option);
    });

    const regionGroup = document.createElement("optgroup");
    regionGroup.label = "地区";
    const regions = [...new Set(visits
      .map((visit) => getRegion(visit))
      .filter((region, index) => region && region !== visits[index].country))]
      .sort((a, b) => a.localeCompare(b, "zh-CN"));
    regions.forEach((region) => {
      const option = document.createElement("option");
      option.value = `region:${region}`;
      option.textContent = region;
      regionGroup.append(option);
    });
    locationFilter.append(countryGroup, regionGroup);

    yearFilter.addEventListener("change", renderTimeline);
    locationFilter.addEventListener("change", renderTimeline);
    ratingFilter.addEventListener("change", renderTimeline);
    citySearch.addEventListener("input", renderTimeline);
    clearFiltersButton.addEventListener("click", () => {
      citySearch.value = "";
      yearFilter.value = "all";
      locationFilter.value = "all";
      ratingFilter.value = "all";
      renderTimeline();
      citySearch.focus();
    });
  }

  function applyRatingState(state) {
    ratingsLoaded = Boolean(state?.loaded);
    ratingsFailed = Boolean(state?.error);
    ratingSummaries = new Map((state?.ratings || []).map((rating) => [rating.cityName, rating]));
    ratingFilter.disabled = !ratingsLoaded || ratingsFailed;
    renderTimeline();
    renderRanking();
  }

  async function loadRatingSummariesDirectly() {
    if (ratingsLoaded && !ratingsFailed) return;
    const config = window.SUPABASE_CONFIG || {};
    if (!window.supabase?.createClient || !config.url || !config.publishableKey) {
      applyRatingState({ loaded: true, error: true, ratings: [] });
      return;
    }

    try {
      const fallbackClient = window.supabase.createClient(config.url, config.publishableKey);
      const { data, error } = await fallbackClient
        .from("city_rating_summary")
        .select("city_name, average_score, rating_count");
      applyRatingState({
        loaded: true,
        error: Boolean(error),
        ratings: (data || []).map((rating) => ({
          cityName: rating.city_name,
          averageScore: Number(rating.average_score),
          ratingCount: Number(rating.rating_count)
        }))
      });
    } catch {
      applyRatingState({ loaded: true, error: true, ratings: [] });
    }
  }

  function initializeRatings() {
    window.addEventListener("travel:ratings-updated", (event) => applyRatingState(event.detail));
    const initialState = window.TRAVEL_COMMUNITY?.getRatingState?.();
    if (initialState) applyRatingState(initialState);
    else loadRatingSummariesDirectly();
    window.setTimeout(loadRatingSummariesDirectly, 4000);
  }

  function getFilteredVisits() {
    const query = citySearch.value.trim().toLocaleLowerCase("zh-CN");
    const selectedYear = yearFilter.value;
    const selectedLocation = locationFilter.value;
    const selectedRating = ratingFilter.value;

    return visits.filter((visit) => {
      const matchesYear = selectedYear === "all" || visit.date.startsWith(selectedYear);
      const matchesQuery = !query || visit.name.toLocaleLowerCase("zh-CN").includes(query);
      const [locationType, locationValue] = selectedLocation.split(":");
      const matchesLocation = selectedLocation === "all"
        || (locationType === "country" && visit.country === locationValue)
        || (locationType === "region" && getRegion(visit) === locationValue);
      const rating = ratingSummaries.get(visit.name);
      const hasRating = Boolean(rating?.ratingCount);
      const matchesRating = selectedRating === "all"
        || (selectedRating === "rated" && hasRating)
        || (selectedRating === "unrated" && !hasRating)
        || (hasRating && Number(rating.averageScore) >= Number(selectedRating));
      return matchesYear && matchesQuery && matchesLocation && matchesRating;
    });
  }

  function getRegion(visit) {
    return visit.region || regionByCity.get(visit.name) || visit.country;
  }

  function renderTimeline() {
    timeline.replaceChildren();
    const filtered = getFilteredVisits();
    const routeOrder = new Map(
      visits
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "zh-CN"))
        .map((visit, index) => [visitKey(visit), index + 1])
    );
    const hasActiveFilters = yearFilter.value !== "all"
      || locationFilter.value !== "all"
      || ratingFilter.value !== "all"
      || citySearch.value.trim();
    filtersActive = Boolean(hasActiveFilters);
    visibleJourneyVisits = filtered;
    clearFiltersButton.hidden = !filtersActive;
    updateTravelStats(filtered);
    initializeExtremeFootprints(filtered);
    applyMapMode();
    filterSummary.textContent = hasActiveFilters
      ? `找到 ${formatResultCount(filtered)}`
      : `共 ${formatResultCount(visits)}`;

    if (!filtered.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "没有找到符合条件的城市，试试调整搜索或筛选条件。";
      timeline.append(empty);
      return;
    }

    const groups = Map.groupBy
      ? Map.groupBy(filtered, (visit) => visit.date.slice(0, 4))
      : filtered.reduce((map, visit) => {
          const year = visit.date.slice(0, 4);
          if (!map.has(year)) map.set(year, []);
          map.get(year).push(visit);
          return map;
        }, new Map());

    [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).forEach(([year, entries]) => {
      const group = document.createElement("section");
      group.className = "year-group";
      group.setAttribute("aria-labelledby", `year-${year}`);

      const heading = document.createElement("h3");
      heading.className = "year-label";
      heading.id = `year-${year}`;

      const cities = document.createElement("div");
      cities.className = "year-cities";
      cities.id = `year-cities-${year}`;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "year-toggle";
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-controls", cities.id);
      toggle.innerHTML = `<span>${year}</span><span class="year-toggle-icon" aria-hidden="true">−</span>`;
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!expanded));
        toggle.querySelector(".year-toggle-icon").textContent = expanded ? "+" : "−";
        cities.hidden = expanded;
      });
      heading.append(toggle);

      entries
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach((visit) => cities.append(createCityCard(visit, routeOrder.get(visitKey(visit)))));

      group.append(heading, cities);
      timeline.append(group);
    });
  }

  function formatCoordinate(value, positive, negative) {
    return `${Math.abs(value).toFixed(2)}°${value >= 0 ? positive : negative}`;
  }

  function createCityCard(visit, routeIndex) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "city-card";
    button.setAttribute("aria-label", `查看${visit.name}${visit.date}旅行详情`);

    const number = document.createElement("span");
    number.className = "index";
    number.textContent = `STOP ${String(routeIndex).padStart(3, "0")}`;

    const routeNode = document.createElement("span");
    routeNode.className = "route-node";
    routeNode.setAttribute("aria-hidden", "true");

    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";

    const name = document.createElement("h3");
    name.textContent = visit.name;

    const meta = document.createElement("p");
    meta.textContent = `${dateFormatter.format(new Date(`${visit.date}T00:00:00`))} · ${visit.country}`;

    const coordinate = document.createElement("span");
    coordinate.className = "city-card-coordinate";
    coordinate.textContent = `${formatCoordinate(visit.coord[1], "N", "S")} / ${formatCoordinate(visit.coord[0], "E", "W")}`;

    const rating = ratingSummaries.get(visit.name);
    const score = document.createElement("span");
    score.className = "city-card-score";
    score.textContent = rating?.ratingCount
      ? `★ ${Number(rating.averageScore).toFixed(1)} · ${rating.ratingCount} 人`
      : "暂无评分";

    const guideCount = guidesFor("visited", visit.name).length;
    const guideBadge = document.createElement("span");
    guideBadge.className = "guide-count-badge";
    guideBadge.textContent = guideCount ? `攻略 ${guideCount}` : "";
    guideBadge.hidden = !guideCount;

    button.append(number, routeNode, arrow, name, meta, coordinate, score, guideBadge);
    button.addEventListener("click", () => openCity(visit));
    return button;
  }

  function renderRanking() {
    rankingList.replaceChildren();
    if (!ratingsLoaded) {
      rankingStatus.textContent = "正在载入城市评分…";
      return;
    }
    if (ratingsFailed) {
      rankingStatus.textContent = "城市评分暂时无法载入，请稍后刷新页面。";
      return;
    }

    const ranked = uniqueCityVisits(visits)
      .map((visit) => ({ visit, rating: ratingSummaries.get(visit.name) }))
      .filter(({ rating }) => rating?.ratingCount > 0)
      .sort((a, b) => Number(b.rating.averageScore) - Number(a.rating.averageScore)
        || b.rating.ratingCount - a.rating.ratingCount
        || a.visit.name.localeCompare(b.visit.name, "zh-CN"));

    if (!ranked.length) {
      rankingStatus.textContent = "还没有城市获得评分，打开城市详情即可成为第一位评分者。";
      return;
    }

    const visible = ranked.slice(0, 10);
    rankingStatus.textContent = ranked.length > visible.length
      ? `目前 ${ranked.length} 座城市参与排行，展示前 ${visible.length} 名。`
      : `目前 ${ranked.length} 座城市参与排行。`;

    visible.forEach(({ visit, rating }, index) => {
      const item = document.createElement("li");
      item.className = "ranking-item";
      if (index < 3) item.classList.add("top-three");

      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `第${index + 1}名，${visit.name}，${Number(rating.averageScore).toFixed(1)}分`);

      const rank = document.createElement("span");
      rank.className = "ranking-position";
      rank.textContent = String(index + 1).padStart(2, "0");

      const city = document.createElement("span");
      city.className = "ranking-city";
      const name = document.createElement("strong");
      name.textContent = visit.name;
      const location = document.createElement("small");
      location.textContent = `${visit.country} · ${getRegion(visit).replace(`${visit.country} · `, "")}`;
      city.append(name, location);

      const score = document.createElement("span");
      score.className = "ranking-score";
      const average = document.createElement("strong");
      average.textContent = Number(rating.averageScore).toFixed(1);
      const count = document.createElement("small");
      count.textContent = `${rating.ratingCount} 人评分`;
      score.append(average, count);

      const arrow = document.createElement("span");
      arrow.className = "ranking-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";

      button.append(rank, city, score, arrow);
      button.addEventListener("click", () => openCity(visit));
      item.append(button);
      rankingList.append(item);
    });
  }

  function initializeWorldMap() {
    if (!window.L) return false;
    worldMap = L.map("world-map", { zoomControl: true, minZoom: 2, worldCopyJump: true });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=cb1_2er4_1_991de9fa689e4c42aeee39c4", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19
    }).addTo(worldMap);
    worldJourneyLayer = L.layerGroup().addTo(worldMap);
    worldWishlistLayer = L.layerGroup().addTo(worldMap);
    worldMarkers = uniqueCityVisits(visits).map((visit) => {
      const content = document.createElement("span");
      content.className = "world-map-marker";
      const dot = document.createElement("span");
      dot.className = "travel-marker";
      content.append(dot);
      const marker = L.marker([visit.coord[1], visit.coord[0]], {
        icon: L.divIcon({ className: "world-map-icon", html: content, iconSize: [28, 28], iconAnchor: [14, 14] }),
        title: visit.name,
        keyboard: true
      });
      const tooltip = document.createElement("span");
      tooltip.textContent = `${visit.name} · ${visit.date.slice(0, 4)}`;
      marker.bindTooltip(tooltip, { direction: "top", offset: [0, -8] });
      marker.on("click", () => openCity(visit));
      return { marker, visit };
    });
    const getWishlistMapLocation = window.TRAVEL_MAP_ENGINE?.getWishlistMapLocation || (() => null);
    worldWishlistMarkers = wishlist.flatMap((destination) => {
      const location = getWishlistMapLocation(destination);
      if (!location) return [];
      const priority = wishPriorityMeta(destination.priorityLevel);
      const content = document.createElement("span");
      content.className = "world-map-marker world-map-wishlist";
      content.dataset.priority = String(priority.level);
      const dot = document.createElement("span");
      dot.className = "wishlist-marker";
      content.append(dot);
      const marker = L.marker([location.coord[1], location.coord[0]], {
        icon: L.divIcon({ className: "world-map-icon", html: content, iconSize: [34, 34], iconAnchor: [17, 17] }),
        title: `${destination.name} · ${priority.label}`,
        keyboard: true
      });
      const tooltip = document.createElement("span");
      tooltip.textContent = `${location.label} · ${priority.label}`;
      marker.bindTooltip(tooltip, { direction: "top", offset: [0, -10] });
      marker.on("click", () => openGuide(destination));
      return { marker, destination };
    });
    updateWorldMapMode();
    return true;
  }

  function updateWorldMapMode() {
    if (!worldMap) return;
    worldJourneyLayer.clearLayers();
    worldWishlistLayer.clearLayers();
    const isWishlist = mapMode === "wishlist";
    const visibleNames = new Set(visibleJourneyVisits.map((visit) => visit.name));
    const entries = isWishlist
      ? worldWishlistMarkers
      : worldMarkers.filter(({ visit }) => visibleNames.has(visit.name));
    entries.forEach(({ marker }) => marker.addTo(isWishlist ? worldWishlistLayer : worldJourneyLayer));
    if (entries.length && mapView === "world" && !document.querySelector("#world-map").hidden) {
      worldMap.invalidateSize(false);
      worldMap.fitBounds(L.featureGroup(entries.map(({ marker }) => marker)).getBounds().pad(.04), {
        padding: [28, 28], maxZoom: isWishlist ? 5 : 7, animate: false
      });
    }
    refreshWorldActiveMarker();
  }

  function refreshWorldActiveMarker() {
    worldMarkers.forEach(({ marker, visit }) => {
      marker.getElement()?.querySelector(".world-map-marker")?.classList.toggle("active", activeCity?.name === visit.name);
    });
  }

  function setMapView(view) {
    mapView = view === "china" ? "china" : "world";
    if (mapView === "world" && !worldMap) mapView = "china";
    document.querySelector("#world-map").hidden = mapView !== "world";
    document.querySelector("#china-map").hidden = mapView !== "china";
    document.querySelectorAll(".map-switch-button").forEach((button) => {
      const active = button.dataset.view === mapView;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (mapView === "world") {
      worldMap.invalidateSize(false);
    } else if (chinaMap) {
      chinaMap.resize();
    }
    applyMapMode();
  }

  async function initializeMap() {
    initializeWorldMap();
    document.querySelectorAll(".map-switch-button").forEach((button) => {
      button.addEventListener("click", () => setMapView(button.dataset.view));
    });
    setMapView("china");
    const status = document.querySelector("#china-map-status");
    status.textContent = "正在载入高德旅行地图…";
    status.hidden = false;
    try {
      await initializeChinaMap();
      chinaMap.resize();
      applyMapMode();
      status.hidden = true;
    } catch (error) {
      status.textContent = `${error.message || "高德地图暂时无法载入。"} ${worldMap ? "已自动切换到全球地图。" : "下方时间线仍可继续浏览。"}`;
      status.hidden = false;
      if (worldMap) setMapView("world");
    }
  }

  function loadAmap() {
    if (window.AMap?.Map) return Promise.resolve(window.AMap);
    if (amapLoadPromise) return amapLoadPromise;
    const config = window.AMAP_MAP_CONFIG || {};
    if (!config.jsApiKey) return Promise.reject(new Error("高德 Web端（JS API）Key 尚未配置。"));
    if (!config.serviceHost) return Promise.reject(new Error("高德安全代理尚未配置。"));
    installAmapProxyBridge(config);
    window._AMapSecurityConfig = { serviceHost: config.serviceHost.replace(/\/$/, "") };
    amapLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = window.setTimeout(() => reject(new Error("高德地图载入超时。")), 15000);
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.jsApiKey)}&plugin=AMap.ToolBar,AMap.DistrictLayer`;
      script.referrerPolicy = "strict-origin-when-cross-origin";
      script.onload = () => {
        window.clearTimeout(timeout);
        if (window.AMap?.Map) resolve(window.AMap);
        else reject(new Error("高德地图没有正确完成初始化。"));
      };
      script.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("高德地图资源暂时无法载入。"));
      };
      document.head.append(script);
    });
    return amapLoadPromise;
  }

  function installAmapProxyBridge(config) {
    if (window.__TRAVEL_AMAP_PROXY_BRIDGE__) return;
    if (!config.proxyTarget) throw new Error("高德安全代理目标尚未配置。");
    const publicBase = config.serviceHost.replace(/\/$/, "");
    const proxyBase = config.proxyTarget.replace(/\/$/, "");
    const rewrite = (value) => {
      const url = typeof value === "string" || value instanceof URL ? String(value) : value?.url;
      if (!url || !url.startsWith(`${publicBase}/`)) return url;
      return `${proxyBase}${url.slice(publicBase.length)}`;
    };

    const nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      return nativeOpen.call(this, method, rewrite(url) || url, ...rest);
    };

    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const rewritten = rewrite(input);
      if (!rewritten || rewritten === (typeof input === "string" ? input : input?.url)) {
        return nativeFetch(input, init);
      }
      return nativeFetch(input instanceof Request ? new Request(rewritten, input) : rewritten, init);
    };
    window.__TRAVEL_AMAP_PROXY_BRIDGE__ = true;
  }

  async function initializeChinaMap() {
    if (chinaMap) return chinaMap;
    if (chinaMapPromise) return chinaMapPromise;
    chinaMapPromise = loadAmap().then((AMap) => {
      chinaMap = new AMap.Map("china-map", {
        viewMode: "2D",
        mapStyle: "amap://styles/normal",
        zoom: 4,
        center: [105, 35],
        resizeEnable: true
      });
      chinaMap.addControl(new AMap.ToolBar({ position: "LT" }));
      const mapEngine = window.TRAVEL_MAP_ENGINE || {};
      const normalizeDistrictName = mapEngine.normalizeChinaDistrictName || ((name) => String(name || "").replace(/市$/u, ""));
      const uniqueVisits = uniqueCityVisits(visits);
      const chinaVisits = uniqueVisits.filter((visit) => visit.country === "中国");
      const eastAsiaVisits = uniqueVisits.filter((visit) => visit.country === "中国" || visit.country === "日本");
      const visitsByDistrict = new Map(chinaVisits.map((visit) => [normalizeDistrictName(visit.name), visit]));
      const getDistrictVisit = (properties) => visitsByDistrict.get(normalizeDistrictName(properties?.NAME_CHN)) || null;
      const getDistrictEventVisit = (event) => {
        const properties = event?.properties || event?.props || event?.rawData || event?.data || event?.feature?.properties;
        return getDistrictVisit(properties);
      };

      chinaDistrictLayer = new AMap.DistrictLayer.Country({
        SOC: "CHN",
        depth: 2,
        zIndex: 12,
        zooms: [3, 10]
      });
      chinaDistrictLayer.setStyles(createChinaDistrictStyles(getDistrictVisit));
      chinaMap.add(chinaDistrictLayer);
      chinaDistrictLayer.on?.("click", (event) => {
        if (mapMode !== "journeys") return;
        const visit = getDistrictEventVisit(event);
        if (visit && visibleJourneyVisits.some((visible) => visible.name === visit.name)) {
          openCity(visibleJourneyVisits.find((visible) => visible.name === visit.name) || visit);
        }
      });

      const getAmapCoordinate = mapEngine.getAmapCoordinate || ((place) => place.coord);
      chinaMarkers = eastAsiaVisits.map((visit) => {
        const content = document.createElement("button");
        content.type = "button";
        content.className = "amap-marker-button";
        content.dataset.city = visit.name;
        content.title = `${visit.name} · ${visit.date.slice(0, 4)}`;
        content.setAttribute("aria-label", `查看${visit.name}旅行详情`);
        const dot = document.createElement("span");
        dot.className = "travel-marker";
        dot.setAttribute("aria-hidden", "true");
        content.append(dot);
        if (visit.country === "日本") {
          content.classList.add("amap-japan-marker-button");
          const label = document.createElement("span");
          label.className = "amap-japan-marker-label";
          label.setAttribute("aria-hidden", "true");
          label.textContent = visit.name;
          content.append(label);
        }
        const marker = new AMap.Marker({
          position: getAmapCoordinate(visit),
          content,
          anchor: "center",
          title: visit.name,
          zIndex: 110
        });
        content.addEventListener("click", () => {
          openCity(visit);
        });
        marker.setMap(chinaMap);
        return { marker, visit };
      });
      const getWishlistMapLocation = mapEngine.getWishlistMapLocation || (() => null);
      wishlistMarkers = wishlist.flatMap((destination, index) => {
        const location = getWishlistMapLocation(destination);
        if (!location) return [];
        const priority = wishPriorityMeta(destination.priorityLevel);
        const content = document.createElement("button");
        content.type = "button";
        content.className = "amap-wishlist-marker-button";
        content.dataset.destination = destination.name;
        content.dataset.priority = String(priority.level);
        content.dataset.labelSide = index % 3 === 0 ? "left" : "right";
        content.title = `${destination.name} · ${priority.label}`;
        content.setAttribute("aria-label", `查看${priority.label}目的地${destination.name}旅行攻略`);

        const dot = document.createElement("span");
        dot.className = "wishlist-marker";
        dot.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.className = "amap-wishlist-marker-label";
        label.setAttribute("aria-hidden", "true");
        label.textContent = location.label;
        content.append(dot, label);

        const position = getAmapCoordinate({
          name: destination.name,
          country: location.country,
          coord: location.coord,
          coordinateSystem: location.coordinateSystem
        });
        const marker = new AMap.Marker({
          position,
          content,
          anchor: "center",
          title: destination.name,
          zIndex: 120 + priority.level
        });
        content.addEventListener("click", () => {
          setActiveWishlistMarker(marker);
          openGuide(destination);
        });
        marker.setMap(null);
        return [{ marker, destination }];
      });
      return chinaMap;
    }).catch((error) => {
      chinaMapPromise = null;
      throw error;
    });
    return chinaMapPromise;
  }

  function createChinaDistrictStyles(getDistrictVisit) {
    const selectedName = activeCity?.country === "中国" ? activeCity.name : "";
    return {
      "stroke-width": 1,
      "nation-stroke": "rgba(15, 78, 96, .78)",
      "coastline-stroke": "rgba(15, 119, 143, .72)",
      "province-stroke": "rgba(39, 91, 106, .48)",
      "city-stroke": "rgba(21, 139, 158, .32)",
      fill(properties) {
        if (mapMode !== "journeys") return "rgba(255, 255, 255, 0)";
        const visit = getDistrictVisit(properties);
        if (!visit || !visibleJourneyVisits.some((visible) => visible.name === visit.name)) return "rgba(255, 255, 255, 0)";
        return visit.name === selectedName
          ? "rgba(255, 142, 76, .68)"
          : "rgba(14, 183, 199, .52)";
      }
    };
  }

  function refreshChinaDistrictStyles() {
    if (!chinaDistrictLayer?.setStyles) return;
    const mapEngine = window.TRAVEL_MAP_ENGINE || {};
    const findVisit = mapEngine.findVisitByDistrictName || ((items, name) => (
      items.find((visit) => visit.country === "中国" && visit.name === String(name || "").replace(/市$/u, ""))
    ));
    chinaDistrictLayer.setStyles(createChinaDistrictStyles((properties) => (
      findVisit(visibleJourneyVisits, properties?.NAME_CHN)
    )));
  }

  function setActiveMarker(marker) {
    if (activeMarker) {
      const previousElement = activeMarker.getElement?.() || activeMarker.getContent?.();
      const previous = previousElement?.matches?.(".travel-marker") ? previousElement : previousElement?.querySelector?.(".travel-marker");
      previous?.classList.remove("active");
    }
    activeMarker = marker;
    const element = activeMarker.getElement?.() || activeMarker.getContent?.();
    const dot = element?.matches?.(".travel-marker") ? element : element?.querySelector?.(".travel-marker");
    dot?.classList.add("active");
    refreshChinaDistrictStyles();
  }

  function setActiveWishlistMarker(marker) {
    if (activeWishlistMarker) {
      const previous = activeWishlistMarker.getElement?.() || activeWishlistMarker.getContent?.();
      previous?.querySelector?.(".wishlist-marker")?.classList.remove("active");
    }
    activeWishlistMarker = marker;
    const element = marker?.getElement?.() || marker?.getContent?.();
    element?.querySelector?.(".wishlist-marker")?.classList.add("active");
  }

  function applyMapMode() {
    const isWishlist = mapMode === "wishlist";
    const mapRoot = document.querySelector("#travel-map");
    mapRoot.dataset.mapMode = mapMode;
    mapRoot.setAttribute("aria-label", isWishlist ? "想去目的地互动地图" : "旅行城市互动地图");
    document.querySelector("#china-map").setAttribute("aria-label", isWishlist ? "想去目的地高德地图" : "中国足迹高德地图");
    document.querySelector("#world-map").setAttribute("aria-label", isWishlist ? "全球想去目的地地图" : "全球旅行足迹地图");
    document.querySelector("#map-title").textContent = isWishlist ? "把愿望放到地图上" : "把旅程摊开来看";
    document.querySelector("#map-primary-label").textContent = isWishlist
      ? "想去目的地"
      : (filtersActive ? `筛选结果 ${uniqueCityVisits(visibleJourneyVisits).length}` : "已到访");
    document.querySelector("#map-secondary-label").textContent = isWishlist ? "当前选择" : "当前城市";
    document.querySelector("#map-primary-dot").className = `legend-dot ${isWishlist ? "wishlist" : "visited"}`;
    document.querySelector("#map-interaction-hint").textContent = isWishlist
      ? "光点越大代表越想去，点击可查看对应旅行攻略"
      : (filtersActive
          ? `地图已同步展示筛选后的 ${uniqueCityVisits(visibleJourneyVisits).length} 座城市`
          : (mapView === "world" ? "中国与海外足迹都能在全球地图上查看" : "中国足迹按市域填色，日本足迹以城市光点标记"));
    document.querySelector("#footprint-extremes").hidden = isWishlist || !visibleJourneyVisits.length;
    updateWorldMapMode();
    refreshChinaDistrictStyles();
    if (!chinaMap) return;

    const visibleJourneyNames = new Set(visibleJourneyVisits.map((visit) => visit.name));
    chinaMarkers.forEach(({ marker, visit }) => marker.setMap(
      !isWishlist && visibleJourneyNames.has(visit.name) ? chinaMap : null
    ));
    wishlistMarkers.forEach(({ marker }) => marker.setMap(isWishlist ? chinaMap : null));
    const visibleMarkers = (isWishlist
      ? wishlistMarkers
      : chinaMarkers.filter(({ visit }) => visibleJourneyNames.has(visit.name)))
      .map(({ marker }) => marker);
    if (visibleMarkers.length) {
      chinaMap.setFitView(visibleMarkers, false, [54, 54, 54, 54], isWishlist ? 5 : 7);
    }
    if (!isWishlist && activeCity) {
      const selected = chinaMarkers.find((entry) => entry.visit.name === activeCity.name);
      if (selected) setActiveMarker(selected.marker);
    }
  }

  function setMapMode(mode) {
    mapMode = mode === "wishlist" ? "wishlist" : "journeys";
    applyMapMode();
  }

  function getCityUrl(cityName, visitDate = "") {
    const url = new URL(window.location.href);
    url.searchParams.set("city", cityName);
    if (visitDate) url.searchParams.set("visit", visitDate);
    else url.searchParams.delete("visit");
    url.hash = "";
    return url;
  }

  function guidesFor(placeType, placeName) {
    return guideDocuments.filter((guide) => guide.placeType === placeType && guide.placeName === placeName);
  }

  function journeyHref(slug) {
    const url = new URL("./journey.html", window.location.href);
    url.searchParams.set("slug", slug);
    return url.toString();
  }

  function renderJourneyArchive() {
    const grid = document.querySelector("#journey-card-grid");
    if (!grid) return;
    grid.replaceChildren();
    if (!journeys.length) {
      const empty = document.createElement("p");
      empty.className = "journey-archive-empty";
      empty.textContent = "旅程档案正在整理中。";
      grid.append(empty);
      return;
    }
    journeys.forEach((journey, index) => {
      const anchor = document.createElement("a");
      anchor.className = "journey-card";
      anchor.href = journeyHref(journey.slug);
      anchor.setAttribute("aria-label", `打开旅程：${journey.title}`);
      const media = document.createElement("span");
      media.className = "journey-card-media";
      if (journey.coverUrl) {
        const image = document.createElement("img");
        image.src = journey.coverUrl;
        image.alt = `${journey.title}封面`;
        image.loading = "lazy";
        media.append(image);
      }
      const number = document.createElement("span");
      number.className = "journey-card-number";
      number.textContent = String(index + 1).padStart(2, "0");
      media.append(number);
      const copy = document.createElement("span");
      copy.className = "journey-card-copy";
      const date = document.createElement("time");
      date.dateTime = journey.startDate;
      date.textContent = `${journey.startDate} — ${journey.endDate}`;
      const title = document.createElement("strong");
      title.textContent = journey.title;
      const route = document.createElement("span");
      route.className = "journey-card-route";
      route.textContent = journey.stops.map((stop) => stop.cityName).join(" → ");
      const summary = document.createElement("span");
      summary.className = "journey-card-summary";
      summary.textContent = journey.summary || "这趟旅程的故事正在整理。";
      const meta = document.createElement("span");
      meta.className = "journey-card-meta";
      const distance = journey.distanceKm
        ? `${journey.distanceEstimated ? "约 " : ""}${new Intl.NumberFormat("zh-CN").format(journey.distanceKm)} 公里`
        : "里程待补充";
      meta.textContent = `${journey.days} 天 · ${journey.stops.length} 座城市 · ${distance}`;
      const action = document.createElement("span");
      action.className = "journey-card-action";
      action.textContent = "打开旅程档案 ↗";
      copy.append(date, title, route, summary, meta, action);
      anchor.append(media, copy);
      grid.append(anchor);
    });
  }

  function renderCityJourneyHistory(cityName) {
    const cityVisits = visits
      .filter((visit) => visit.name === cityName)
      .sort((a, b) => a.date.localeCompare(b.date));
    document.querySelector("#city-visit-total").textContent = `${cityVisits.length} 次`;
    const dates = document.querySelector("#city-visit-dates");
    dates.replaceChildren();
    cityVisits.forEach((visit) => {
      const time = document.createElement("time");
      time.dateTime = visit.date;
      time.textContent = dateFormatter.format(new Date(`${visit.date}T00:00:00`));
      dates.append(time);
    });

    const related = window.TRAVEL_JOURNEY_ENGINE?.journeysForCity(journeys, cityName)
      || journeys.filter((journey) => journey.stops.some((stop) => stop.cityName === cityName));
    const container = document.querySelector("#city-related-journeys");
    container.replaceChildren();
    if (!related.length) {
      const empty = document.createElement("p");
      empty.className = "guide-document-empty";
      empty.textContent = "这座城市还没有归入正式旅程档案。";
      container.append(empty);
      return;
    }
    related.forEach((journey) => {
      const anchor = document.createElement("a");
      anchor.href = journeyHref(journey.slug);
      const title = document.createElement("strong");
      title.textContent = journey.title;
      const meta = document.createElement("span");
      meta.textContent = `${journey.startDate} — ${journey.endDate} · ${journey.days} 天`;
      const arrow = document.createElement("span");
      arrow.textContent = "查看旅程 ↗";
      anchor.append(title, meta, arrow);
      container.append(anchor);
    });
  }

  function visitButton(visit, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => openCity(visit));
    return button;
  }

  function renderRandomMemory(next = false) {
    const engine = window.TRAVEL_MEMORY_ENGINE;
    if (!engine) return;
    if (next || !randomMemory) {
      randomMemory = engine.randomCityMemory(visits, Math.random, next ? randomMemory?.name : "");
    }
    const openButton = document.querySelector("#memory-random-open");
    const refreshButton = document.querySelector("#memory-random-refresh");
    if (!randomMemory) {
      document.querySelector("#memory-random-image").closest(".memory-rewind-card--random").classList.add("is-text-only");
      document.querySelector("#memory-random-city").textContent = "还没有城市记忆";
      document.querySelector("#memory-random-description").textContent = "时间线加入第一座城市后，这里会为你随机翻开一页。";
      document.querySelector("#memory-random-meta").textContent = "";
      openButton.disabled = true;
      refreshButton.disabled = true;
      return;
    }
    const latest = randomMemory.latest;
    document.querySelector("#memory-random-city").textContent = randomMemory.name;
    document.querySelector("#memory-random-description").textContent = latest.desc || "这座城市的故事仍在继续。";
    document.querySelector("#memory-random-meta").textContent = randomMemory.count > 1
      ? `${randomMemory.count} 次到访 · ${randomMemory.first.date} — ${latest.date}`
      : `到访于 ${latest.date}`;
    const image = document.querySelector("#memory-random-image");
    const imageUrl = latest.coverUrl || photoManifest[randomMemory.name]?.[0] || "";
    image.closest(".memory-rewind-card--random").classList.toggle("is-text-only", !imageUrl);
    image.hidden = !imageUrl;
    if (imageUrl) {
      image.src = imageUrl;
      image.alt = `${randomMemory.name}旅行回忆`;
    } else {
      image.removeAttribute("src");
      image.alt = "";
    }
    openButton.disabled = false;
    refreshButton.disabled = memorySnapshot?.cities.length < 2;
    openButton.onclick = () => openCity(latest);
  }

  function renderRepeatMemory() {
    const repeats = memorySnapshot?.repeatCities || [];
    const comparison = document.querySelector("#memory-return-comparison");
    const openButton = document.querySelector("#memory-return-open");
    const nextButton = document.querySelector("#memory-return-next");
    comparison.replaceChildren();
    if (!repeats.length) {
      document.querySelector("#memory-return-city").textContent = "等待下一次重逢";
      document.querySelector("#memory-return-count").textContent = "";
      const empty = document.createElement("p");
      empty.className = "memory-return-empty";
      empty.textContent = "目前每座城市只记录了一次到访；增加再次到访日期后，这里会自动生成今昔对比。";
      comparison.append(empty);
      openButton.disabled = true;
      nextButton.disabled = true;
      return;
    }
    repeatMemoryIndex %= repeats.length;
    const memory = repeats[repeatMemoryIndex];
    document.querySelector("#memory-return-city").textContent = memory.name;
    document.querySelector("#memory-return-count").textContent = `${memory.count} 次`;
    const moment = (kicker, text, visit) => {
      const node = document.createElement("div");
      node.className = "memory-return-moment";
      const label = document.createElement("span");
      label.textContent = kicker;
      const title = document.createElement("strong");
      title.textContent = text;
      const time = document.createElement("time");
      time.dateTime = visit.date;
      time.textContent = dateFormatter.format(new Date(`${visit.date}T00:00:00`));
      node.append(label, title, time);
      return node;
    };
    const arrow = document.createElement("span");
    arrow.className = "memory-return-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    comparison.append(
      moment("FIRST ARRIVAL", `${memory.first.date.slice(0, 4)} 年第一次来到${memory.name}`, memory.first),
      arrow,
      moment("LATEST RETURN", `${memory.latest.date.slice(0, 4)} 年再次回到这里`, memory.latest)
    );
    openButton.disabled = false;
    nextButton.disabled = repeats.length < 2;
    openButton.onclick = () => openCity(memory.latest);
  }

  function renderMemoryRewind() {
    const engine = window.TRAVEL_MEMORY_ENGINE;
    if (!engine?.buildMemorySnapshot) return;
    memorySnapshot = engine.buildMemorySnapshot(visits, journeys);
    const today = new Intl.DateTimeFormat("zh-CN", {
      year: "numeric", month: "long", day: "numeric", weekday: "long"
    }).format(new Date(`${memorySnapshot.today}T00:00:00`));
    document.querySelector("#memory-today-label").textContent = `${today} · 每次打开都会重新计算`;

    const todayList = document.querySelector("#memory-today-list");
    todayList.replaceChildren();
    if (memorySnapshot.onThisDay.length) {
      const cityNames = [...new Set(memorySnapshot.onThisDay.map((visit) => visit.name))];
      document.querySelector("#memory-today-title").textContent = `往年今天，我在${cityNames.join("、")}`;
      document.querySelector("#memory-today-copy").textContent = `找到 ${memorySnapshot.onThisDay.length} 段与今天月日相同的旅行记录。`;
      memorySnapshot.onThisDay.forEach((visit) => {
        todayList.append(visitButton(visit, `${visit.date.slice(0, 4)} · ${visit.name}`));
      });
    } else {
      document.querySelector("#memory-today-title").textContent = "今天没有重合的坐标";
      document.querySelector("#memory-today-copy").textContent = `不过在往年的 ${memorySnapshot.month} 月，我留下了 ${memorySnapshot.monthVisits.length} 次城市到访。`;
    }

    const journey = memorySnapshot.latestJourney;
    const journeyLink = document.querySelector("#memory-journey-link");
    if (journey) {
      document.querySelector("#memory-journey-title").textContent = journey.title;
      document.querySelector("#memory-journey-days").replaceChildren(
        document.createTextNode(new Intl.NumberFormat("zh-CN").format(journey.daysSince)),
        Object.assign(document.createElement("small"), { textContent: "天" })
      );
      journeyLink.href = journeyHref(journey.slug);
      journeyLink.hidden = false;
    } else {
      document.querySelector("#memory-journey-title").textContent = "还没有已完成的正式旅程";
      document.querySelector("#memory-journey-days").textContent = "—";
      journeyLink.hidden = true;
    }

    const monthList = document.querySelector("#memory-month-list");
    monthList.replaceChildren();
    document.querySelector("#memory-month-title").textContent = `${memorySnapshot.month} 月的历史旅行`;
    document.querySelector("#memory-month-copy").textContent = memorySnapshot.monthVisits.length
      ? `跨越 ${new Set(memorySnapshot.monthVisits.map((visit) => visit.date.slice(0, 4))).size} 个年份，共找到 ${memorySnapshot.monthVisits.length} 次城市到访。`
      : "这个月份还没有留下旅行记录。";
    memorySnapshot.monthVisits.forEach((visit) => {
      monthList.append(visitButton(visit, `${visit.date.slice(0, 4)} · ${visit.name}`));
    });

    randomMemory = null;
    repeatMemoryIndex = 0;
    renderRandomMemory();
    renderRepeatMemory();
    document.querySelector("#memory-random-refresh").onclick = () => renderRandomMemory(true);
    document.querySelector("#memory-return-next").onclick = () => {
      repeatMemoryIndex += 1;
      renderRepeatMemory();
    };
  }

  function guideHref(guide) {
    if (guide.fileType !== "html") return guide.fileUrl;
    const viewer = new URL("./guide-viewer.html", window.location.href);
    viewer.searchParams.set("src", guide.fileUrl);
    viewer.searchParams.set("title", guide.title);
    return viewer.toString();
  }

  function renderGuideLinks(container, guides, emptyMessage = "这座城市还没有上传攻略文件。") {
    container.replaceChildren();
    if (!guides.length) {
      const empty = document.createElement("p");
      empty.className = "guide-document-empty";
      empty.textContent = emptyMessage;
      container.append(empty);
      return;
    }
    guides.forEach((guide) => {
      const anchor = document.createElement("a");
      anchor.href = guideHref(guide);
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.className = "guide-document-link";
      const type = document.createElement("span");
      type.textContent = guide.fileType.toUpperCase();
      const title = document.createElement("strong");
      title.textContent = guide.title;
      const arrow = document.createElement("span");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      anchor.append(type, title, arrow);
      container.append(anchor);
    });
  }

  function updateCityUrl(visit) {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get("city") !== visit.name || currentUrl.searchParams.get("visit") !== visit.date) {
      history.pushState({ travelCity: visit.name, visitDate: visit.date }, "", getCityUrl(visit.name, visit.date));
    }
  }

  async function openCity(visit, { updateUrl = true } = {}) {
    activeCity = visit;
    refreshWorldActiveMarker();
    const markerEntry = chinaMarkers.find((entry) => entry.visit.name === visit.name);
    if (markerEntry && markerEntry.marker !== activeMarker) setActiveMarker(markerEntry.marker);
    else refreshChinaDistrictStyles();
    document.querySelector("#dialog-country").textContent = visit.country;
    document.querySelector("#dialog-region").textContent = getRegion(visit).replace(`${visit.country} · `, "");
    document.querySelector("#dialog-date").dateTime = visit.date;
    document.querySelector("#dialog-date").textContent = dateFormatter.format(new Date(`${visit.date}T00:00:00`));
    document.querySelector("#dialog-title").textContent = visit.name;
    document.querySelector("#dialog-description").textContent = visit.desc;
    const cover = document.querySelector("#dialog-cover");
    cover.hidden = !visit.coverUrl;
    if (visit.coverUrl) {
      cover.src = visit.coverUrl;
      cover.alt = `${visit.name}城市封面`;
    } else {
      cover.removeAttribute("src");
      cover.alt = "";
    }
    document.querySelector("#share-status").textContent = "";
    renderCityJourneyHistory(visit.name);
    renderGuideLinks(document.querySelector("#city-guide-documents"), guidesFor("visited", visit.name));
    document.querySelector("#photo-grid").replaceChildren();
    document.querySelector("#photo-status").textContent = "正在寻找这座城市的旅行照片…";
    if (!cityDialog.open) cityDialog.showModal();
    loadPhotos(visit.name);
    window.TRAVEL_COMMUNITY?.showCity(visit.name);
    document.title = `${visit.name}｜Sehuri 的旅行足迹`;
    if (updateUrl) updateCityUrl(visit);
  }

  function syncCityFromUrl() {
    const url = new URL(window.location.href);
    const cityName = url.searchParams.get("city");
    const visitDate = url.searchParams.get("visit");
    const visit = visits.find((entry) => entry.name === cityName && (!visitDate || entry.date === visitDate));
    syncingHistory = true;
    if (visit) {
      const markerEntry = chinaMarkers.find((entry) => entry.visit.name === visit.name);
      if (markerEntry) setActiveMarker(markerEntry.marker);
      openCity(visit, { updateUrl: false });
    } else if (cityDialog.open) {
      cityDialog.close();
    }
    syncingHistory = false;
  }

  function clearCityUrl() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("city")) return;
    url.searchParams.delete("city");
    url.searchParams.delete("visit");
    history.replaceState(null, "", url);
  }

  function setShareStatus(message) {
    const status = document.querySelector("#share-status");
    status.textContent = message;
    window.setTimeout(() => {
      if (status.textContent === message) status.textContent = "";
    }, 2400);
  }

  async function copyCityLink() {
    if (!activeCity) return;
    const url = getCityUrl(activeCity.name, activeCity.date).toString();
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("链接已复制");
    } catch {
      const input = document.createElement("textarea");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      setShareStatus(copied ? "链接已复制" : "复制失败，请手动复制地址栏链接");
    }
  }

  async function shareCity() {
    if (!activeCity) return;
    const shareData = {
      title: `${activeCity.name}｜Sehuri 的旅行足迹`,
      text: `看看 Sehuri 在${activeCity.name}的旅行记忆`,
      url: getCityUrl(activeCity.name, activeCity.date).toString()
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setShareStatus("分享成功");
      } catch (error) {
        if (error.name !== "AbortError") setShareStatus("分享失败，请复制链接");
      }
    } else {
      await copyCityLink();
    }
  }

  function loadPhotos(cityName) {
    const status = document.querySelector("#photo-status");
    const grid = document.querySelector("#photo-grid");
    const photos = photoManifest[cityName] || [];
    status.textContent = photos.length ? `${photos.length} 张旅行照片` : "这座城市还没有照片。";
    photos.forEach((source) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `放大查看${cityName}照片`);
      const image = document.createElement("img");
      image.src = source;
      image.alt = `${cityName}旅行照片`;
      image.loading = "lazy";
      button.append(image);
      button.addEventListener("click", () => openLightbox(source, image.alt));
      grid.append(button);
    });
  }

  function initializeWishlist() {
    const board = document.querySelector("#wish-grid");
    board.replaceChildren();
    document.querySelector("#wishlist-count").textContent = wishlist.length;
    groupWishlist(wishlist).forEach((group) => {
      const section = document.createElement("section");
      section.className = "wish-priority-group";
      section.dataset.priority = String(group.level);

      const heading = document.createElement("header");
      const headingCopy = document.createElement("div");
      const eyebrow = document.createElement("p");
      eyebrow.className = "eyebrow";
      eyebrow.textContent = `PRIORITY 0${group.level}`;
      const title = document.createElement("h3");
      title.textContent = group.heading;
      const explanation = document.createElement("p");
      explanation.textContent = group.description;
      headingCopy.append(eyebrow, title, explanation);
      const count = document.createElement("span");
      count.className = "wish-priority-count";
      count.textContent = `${group.items.length} 个目的地`;
      heading.append(headingCopy, count);

      const grid = document.createElement("div");
      grid.className = "wish-grid";
      group.items.forEach((destination) => {
      const priority = wishPriorityMeta(destination.priorityLevel);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "wish-card";
      button.dataset.priority = String(priority.level);
      button.setAttribute("aria-label", `查看${destination.name}旅行笔记`);

      const icon = document.createElement("span");
      icon.className = "wish-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = destination.icon;

      const arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";

      const name = document.createElement("h3");
      name.textContent = destination.name;
      const description = document.createElement("p");
      description.textContent = destination.desc;

      const guideCount = guidesFor("wishlist", destination.name).length;
      const guideBadge = document.createElement("span");
      guideBadge.className = "guide-count-badge";
      guideBadge.textContent = guideCount ? `攻略 ${guideCount}` : "";
      guideBadge.hidden = !guideCount;

      button.append(icon, arrow);
      const priorityBadge = document.createElement("span");
      priorityBadge.className = "wish-priority-badge";
      priorityBadge.textContent = `${priority.label} · ${priority.level}/3`;
      button.append(priorityBadge);
      if (destination.plannedTime) {
        const plannedTime = document.createElement("span");
        plannedTime.className = "wish-planned-time";
        plannedTime.textContent = `计划 · ${destination.plannedTime}`;
        button.append(plannedTime);
      }
      button.append(name, description, guideBadge);
      button.addEventListener("click", () => openGuide(destination));
      grid.append(button);
      });
      section.append(heading, grid);
      board.append(section);
    });
  }

  function initializeHomeTabs() {
    const tabs = [...document.querySelectorAll("[data-home-tab]")];
    const panels = {
      journeys: document.querySelector("#journeys-panel"),
      wishlist: document.querySelector("#wishlist-panel")
    };

    function activateTab(name, { focus = false, scroll = false, scrollTarget = "#top" } = {}) {
      if (!panels[name]) return;
      tabs.forEach((tab) => {
        const active = tab.dataset.homeTab === name;
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        if (active && focus) tab.focus();
      });
      Object.entries(panels).forEach(([panelName, panel]) => {
        panel.hidden = panelName !== name;
      });
      setMapMode(name);
      if (scroll) {
        document.querySelector(scrollTarget)?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
        });
      }
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activateTab(tab.dataset.homeTab));
      tab.addEventListener("keydown", (event) => {
        let nextIndex = null;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        activateTab(tabs[nextIndex].dataset.homeTab, { focus: true });
      });
    });

    document.querySelectorAll("[data-home-tab-target]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        activateTab(link.dataset.homeTabTarget, {
          scroll: true,
          scrollTarget: link.dataset.scrollTarget || "#top"
        });
      });
    });

    if (window.location.hash === "#wishlist-panel") activateTab("wishlist");
  }

  function openGuide(destination) {
    const markerEntry = wishlistMarkers.find((entry) => entry.destination.name === destination.name);
    if (markerEntry) setActiveWishlistMarker(markerEntry.marker);
    document.querySelector("#guide-title").textContent = destination.name;
    document.querySelector("#guide-description").textContent = destination.desc;
    const plannedTime = document.querySelector("#guide-planned-time");
    plannedTime.textContent = destination.plannedTime ? `计划去的时间 · ${destination.plannedTime}` : "";
    plannedTime.hidden = !destination.plannedTime;
    document.querySelector("#guide-copy").textContent = destination.guide;
    const links = document.querySelector("#guide-links");
    links.replaceChildren();

    renderGuideLinks(
      document.querySelector("#wishlist-guide-documents"),
      guidesFor("wishlist", destination.name),
      "这个目的地还没有上传攻略文件。"
    );

    const sources = [
      ["小红书", `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(destination.name)}`],
      ["马蜂窝", `https://www.mafengwo.cn/search/s.php?q=${encodeURIComponent(destination.name)}`],
      ["携程攻略", `https://you.ctrip.com/searchsite/?query=${encodeURIComponent(destination.name)}`]
    ];
    sources.forEach(([label, url]) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = `${label} ↗`;
      links.append(anchor);
    });
    guideDialog.showModal();
  }

  function openLightbox(source, alt) {
    const image = document.querySelector("#lightbox-image");
    lightboxReturnFocus = document.activeElement;
    image.src = source;
    image.alt = alt;
    lightbox.showModal();
    document.querySelector("#lightbox-close").focus();
  }

  function closeLightbox() {
    if (!lightbox.open) return;
    const returnState = lightboxReturnState;
    lightboxReturnState = null;
    const focusTarget = lightboxReturnFocus;
    lightboxReturnFocus = null;
    lightbox.close();
    document.querySelector("#lightbox-image").removeAttribute("src");
    if (returnState?.dialog && !returnState.dialog.open) {
      returnState.dialog.showModal();
      requestAnimationFrame(() => {
        returnState.dialog.scrollTop = returnState.scrollTop;
        returnState.focusTarget?.focus({ preventScroll: true });
      });
    } else if (focusTarget?.isConnected) {
      focusTarget.focus({ preventScroll: true });
    }
  }

  function initializeDialogs() {
    document.querySelector("#stats-dialog-close").addEventListener("click", () => statsDialog.close());
    document.querySelector("#dialog-close").addEventListener("click", () => cityDialog.close());
    document.querySelector("#copy-city-link").addEventListener("click", copyCityLink);
    document.querySelector("#share-city").addEventListener("click", shareCity);
    document.querySelector("#guide-close").addEventListener("click", () => guideDialog.close());
    document.querySelector("#lightbox-close").addEventListener("click", closeLightbox);
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) closeLightbox();
    });
    lightbox.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeLightbox();
    });
    [statsDialog, cityDialog, guideDialog].forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        const bounds = dialog.getBoundingClientRect();
        const inside = event.clientX >= bounds.left && event.clientX <= bounds.right
          && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
        if (!inside) dialog.close();
      });
    });
    cityDialog.addEventListener("close", () => {
      activeCity = null;
      document.title = originalTitle;
      if (!syncingHistory) clearCityUrl();
    });
    window.addEventListener("popstate", syncCityFromUrl);
  }

  async function initialize() {
    if (window.TRAVEL_CONTENT?.ready) await window.TRAVEL_CONTENT.ready;
    const content = window.TRAVEL_CONTENT?.getState?.() || {
      visits: window.TRAVEL_DATA?.visits || [],
      wishlist: window.TRAVEL_DATA?.wishlist || [],
      photoManifest: window.PHOTO_MANIFEST || {}
    };
    visits = content.visits;
    wishlist = content.wishlist;
    photoManifest = content.photoManifest;
    photoDetails = content.photoDetails || Object.entries(photoManifest).flatMap(([cityName, photos]) =>
      photos.map((imageUrl, index) => ({ cityName, imageUrl, caption: "", order: index + 1 }))
    );
    guideDocuments = content.guideDocuments || [];
    journeys = content.journeys || [];
    initializeStats();
    initializePersonalStats();
    initializeStatsDetails();
    renderJourneyArchive();
    renderMemoryRewind();
    initializeExtremeFootprints();
    initializeFilters();
    initializeRatings();
    renderTimeline();
    renderRanking();
    initializeMap();
    initializeWishlist();
    initializeHomeTabs();
    initializeDialogs();
    window.initializePhotoCinema?.(photoDetails, visits, () => openStatsDetail("photos"));
    syncCityFromUrl();
  }

  initialize();
})();
