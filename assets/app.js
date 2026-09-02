(function () {
  "use strict";

  let visits = [];
  let wishlist = [];
  let photoManifest = {};
  const chinaBounds = [[17, 73], [54, 136]];
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const originalTitle = document.title;
  const regionGroups = {
    "中国 · 华东": ["日照", "淮安", "青岛", "南京", "杭州", "泰州", "上海", "苏州", "扬州", "合肥", "九江", "南昌", "芜湖", "上饶", "黄山", "泰安", "镇江", "济南", "烟台", "马鞍山", "无锡", "常州", "嘉兴", "厦门", "福州", "漳州", "威海", "宁波", "台州", "六安", "绍兴"],
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
  const filterSummary = document.querySelector("#filter-summary");
  const rankingList = document.querySelector("#ranking-list");
  const rankingStatus = document.querySelector("#ranking-status");
  const cityDialog = document.querySelector("#city-dialog");
  const guideDialog = document.querySelector("#guide-dialog");
  const lightbox = document.querySelector("#lightbox");
  let travelMap;
  let markerLayer;
  let markers = [];
  let activeMarker = null;
  let activeCity = null;
  let syncingHistory = false;
  let ratingSummaries = new Map();
  let ratingsLoaded = false;
  let ratingsFailed = false;

  function countUp(element, target) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.textContent = target;
      return;
    }
    const duration = 900;
    const started = performance.now();
    function tick(now) {
      const progress = Math.min((now - started) / duration, 1);
      element.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function initializeStats() {
    const countries = new Set(visits.map((visit) => visit.country));
    const years = new Set(visits.map((visit) => visit.date.slice(0, 4)));
    countUp(document.querySelector("#city-count"), visits.length);
    countUp(document.querySelector("#country-count"), countries.size);
    countUp(document.querySelector("#year-count"), years.size);
    countUp(document.querySelector("#route-city-count"), visits.length);
    countUp(document.querySelector("#route-country-count"), countries.size);
    document.querySelector("#current-year").textContent = new Date().getFullYear();
  }

  function initializeExtremeFootprints() {
    const grid = document.querySelector("#extremes-grid");
    const findExtreme = (axis, comparison) => visits.reduce((extreme, visit) => (
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
        .map((visit, index) => [visit.name, index + 1])
    );
    const hasActiveFilters = yearFilter.value !== "all"
      || locationFilter.value !== "all"
      || ratingFilter.value !== "all"
      || citySearch.value.trim();
    filterSummary.textContent = hasActiveFilters
      ? `找到 ${filtered.length} 座城市`
      : `共 ${visits.length} 座城市`;

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
      heading.textContent = year;

      const cities = document.createElement("div");
      cities.className = "year-cities";

      entries
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach((visit) => cities.append(createCityCard(visit, routeOrder.get(visit.name))));

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
    button.setAttribute("aria-label", `查看${visit.name}旅行详情`);

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

    button.append(number, routeNode, arrow, name, meta, coordinate, score);
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

    const ranked = visits
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

  function initializeMap() {
    const container = document.querySelector("#travel-map");
    if (!window.L) {
      container.innerHTML = '<p class="noscript">地图资源暂时无法载入，请通过下方时间线浏览城市。</p>';
      return;
    }

    travelMap = L.map(container, {
      zoomControl: true,
      minZoom: 2,
      worldCopyJump: true
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_2er4_1_991de9fa689e4c42aeee39c4", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO',
      subdomains: "abcd",
      maxZoom: 19
    }).addTo(travelMap);

    markerLayer = L.layerGroup().addTo(travelMap);
    markers = visits.map((visit) => {
      const icon = L.divIcon({
        className: "",
        html: '<span class="travel-marker" aria-hidden="true"></span>',
        iconSize: [21, 21],
        iconAnchor: [10, 10]
      });
      const marker = L.marker([visit.coord[1], visit.coord[0]], {
        icon,
        title: visit.name,
        keyboard: true
      });
      marker.bindTooltip(`${visit.name} · ${visit.date.slice(0, 4)}`, {
        className: "map-tooltip",
        direction: "top",
        offset: [0, -8]
      });
      marker.on("click", () => {
        setActiveMarker(marker);
        openCity(visit);
      });
      marker.addTo(markerLayer);
      return { marker, visit };
    });

    setMapView("world");
    document.querySelectorAll(".map-switch-button").forEach((button) => {
      button.addEventListener("click", () => setMapView(button.dataset.view));
    });
  }

  function setMapView(view) {
    if (!travelMap) return;
    document.querySelectorAll(".map-switch-button").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const visitedBounds = L.latLngBounds(visits.map((visit) => [visit.coord[1], visit.coord[0]])).pad(.16);
    travelMap.fitBounds(view === "china" ? chinaBounds : visitedBounds, {
      padding: [18, 18],
      animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    });
  }

  function setActiveMarker(marker) {
    if (activeMarker) {
      const previous = activeMarker.getElement()?.querySelector(".travel-marker");
      previous?.classList.remove("active");
    }
    activeMarker = marker;
    activeMarker.getElement()?.querySelector(".travel-marker")?.classList.add("active");
  }

  function getCityUrl(cityName) {
    const url = new URL(window.location.href);
    url.searchParams.set("city", cityName);
    url.hash = "";
    return url;
  }

  function updateCityUrl(visit) {
    const currentName = new URL(window.location.href).searchParams.get("city");
    if (currentName !== visit.name) {
      history.pushState({ travelCity: visit.name }, "", getCityUrl(visit.name));
    }
  }

  async function openCity(visit, { updateUrl = true } = {}) {
    activeCity = visit;
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
    document.querySelector("#photo-grid").replaceChildren();
    document.querySelector("#photo-status").textContent = "正在寻找这座城市的旅行照片…";
    if (!cityDialog.open) cityDialog.showModal();
    loadPhotos(visit.name);
    window.TRAVEL_COMMUNITY?.showCity(visit.name);
    document.title = `${visit.name}｜Sehuri 的旅行足迹`;
    if (updateUrl) updateCityUrl(visit);
  }

  function syncCityFromUrl() {
    const cityName = new URL(window.location.href).searchParams.get("city");
    const visit = visits.find((entry) => entry.name === cityName);
    syncingHistory = true;
    if (visit) {
      const markerEntry = markers.find((entry) => entry.visit.name === visit.name);
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
    const url = getCityUrl(activeCity.name).toString();
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
      url: getCityUrl(activeCity.name).toString()
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
    const grid = document.querySelector("#wish-grid");
    document.querySelector("#wishlist-count").textContent = wishlist.length;
    wishlist.forEach((destination) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "wish-card";
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

      button.append(icon, arrow, name, description);
      button.addEventListener("click", () => openGuide(destination));
      grid.append(button);
    });
  }

  function initializeHomeTabs() {
    const tabs = [...document.querySelectorAll("[data-home-tab]")];
    const panels = {
      journeys: document.querySelector("#journeys-panel"),
      wishlist: document.querySelector("#wishlist-panel")
    };

    function activateTab(name, { focus = false, scroll = false } = {}) {
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
      if (scroll) {
        document.querySelector("#top").scrollIntoView({
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
        activateTab(link.dataset.homeTabTarget, { scroll: true });
      });
    });

    if (window.location.hash === "#wishlist-panel") activateTab("wishlist");
  }

  function openGuide(destination) {
    document.querySelector("#guide-title").textContent = destination.name;
    document.querySelector("#guide-description").textContent = destination.desc;
    document.querySelector("#guide-copy").textContent = destination.guide;
    const links = document.querySelector("#guide-links");
    links.replaceChildren();

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
    image.src = source;
    image.alt = alt;
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    document.querySelector("#lightbox-close").focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.querySelector("#lightbox-image").removeAttribute("src");
    document.body.style.overflow = "";
  }

  function initializeDialogs() {
    document.querySelector("#dialog-close").addEventListener("click", () => cityDialog.close());
    document.querySelector("#copy-city-link").addEventListener("click", copyCityLink);
    document.querySelector("#share-city").addEventListener("click", shareCity);
    document.querySelector("#guide-close").addEventListener("click", () => guideDialog.close());
    document.querySelector("#lightbox-close").addEventListener("click", closeLightbox);
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) closeLightbox();
    });
    [cityDialog, guideDialog].forEach((dialog) => {
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
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !lightbox.hidden) closeLightbox();
    });
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
    initializeStats();
    initializeExtremeFootprints();
    initializeFilters();
    initializeRatings();
    renderTimeline();
    renderRanking();
    initializeMap();
    initializeWishlist();
    initializeHomeTabs();
    initializeDialogs();
    syncCityFromUrl();
  }

  initialize();
})();
