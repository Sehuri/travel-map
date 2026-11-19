(function () {
  "use strict";
  const photoImages = window.TRAVEL_PHOTOS;
  const data = window.TRAVEL_JOURNEY_DATA;

  const byId = (id) => document.getElementById(id);
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" });
  const numberFormatter = new Intl.NumberFormat("zh-CN");
  let lastPhotoButton = null;
  let allVisits = [];
  let activeJourney = null;
  let galleryPhotos;
  let cityProfilesRequest;
  let replayVisible = false;
  const replayPhotos = new Map();
  let replay = null;
  let replayIndex = 0;
  let replayTimer = null;
  let replayPlaying = false;
  let replayMap = null;
  let amapLoadPromise = null;
  let replayMarkers = [];
  let replaySegmentLines = [];

  function feedback(section, message, retry = false) {
    byId(`journey-${section}-status`).textContent = message;
    byId(`journey-${section}-retry`).hidden = !retry;
  }

  function whenNear(element, callback, rootMargin = "240px") {
    if (!window.IntersectionObserver) {
      callback();
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      callback();
    }, { rootMargin });
    observer.observe(element);
  }

  function formatDate(value) {
    return value ? dateFormatter.format(new Date(`${value}T00:00:00`)) : "日期待补充";
  }

  function formatBudget(journey) {
    if (journey.budgetAmount === null || !Number.isFinite(journey.budgetAmount)) return "待补充";
    try {
      return new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: journey.budgetCurrency || "CNY",
        maximumFractionDigits: 0
      }).format(journey.budgetAmount);
    } catch {
      return `${journey.budgetAmount} ${journey.budgetCurrency || "CNY"}`;
    }
  }

  function cityHref(cityName, date = "") {
    const url = new URL("./index.html", window.location.href);
    url.searchParams.set("city", cityName);
    if (date && allVisits.some(visit => visit.name === cityName && visit.date === date)) url.searchParams.set("visit", date);
    return url.toString();
  }

  function guideHref(guide) {
    if (guide.fileType !== "html") return guide.fileUrl;
    const viewer = new URL("./guide-viewer.html", window.location.href);
    viewer.searchParams.set("src", guide.fileUrl);
    viewer.searchParams.set("title", guide.title);
    return viewer.toString();
  }

  function stopDateText(stop) {
    if (!stop.arrivalDate) return "日期待补充";
    if (!stop.departureDate || stop.departureDate === stop.arrivalDate) return formatDate(stop.arrivalDate);
    return `${formatDate(stop.arrivalDate)} — ${formatDate(stop.departureDate)}`;
  }

  function stopStayText(stop) {
    const days = stop.stayDays ? `${stop.stayDays} 天` : "停留天数待补充";
    return `${stopDateText(stop)} · 停留 ${days}${stop.departureEstimated ? "（按行程推算）" : ""}`;
  }

  function replayPhotoAlt(stop) {
    return `${stop.cityName}代表照片`;
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
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      return nativeOpen.call(this, method, rewrite(url) || url, ...rest);
    };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const rewritten = rewrite(input);
      if (!rewritten || rewritten === (typeof input === "string" ? input : input?.url)) return nativeFetch(input, init);
      return nativeFetch(input instanceof Request ? new Request(rewritten, input) : rewritten, init);
    };
    window.__TRAVEL_AMAP_PROXY_BRIDGE__ = true;
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
      const fail = (message) => {
        window.clearTimeout(timeout);
        script.remove();
        reject(new Error(message));
      };
      const timeout = window.setTimeout(() => fail("高德地图载入超时。"), 15000);
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.jsApiKey)}&plugin=AMap.ToolBar,AMap.Scale`;
      script.referrerPolicy = "strict-origin-when-cross-origin";
      script.onload = () => {
        window.clearTimeout(timeout);
        if (window.AMap?.Map) resolve(window.AMap);
        else fail("高德地图没有正确完成初始化。");
      };
      script.onerror = () => fail("高德地图资源暂时无法载入。");
      document.head.append(script);
    }).catch(error => {
      amapLoadPromise = null;
      throw error;
    });
    return amapLoadPromise;
  }

  function amapPosition(stop) {
    if (!Array.isArray(stop?.coord) || stop.coord.length !== 2 || !stop.coord.every(Number.isFinite)) return null;
    const getAmapCoordinate = window.TRAVEL_MAP_ENGINE?.getAmapCoordinate || ((place) => place.coord);
    return getAmapCoordinate(stop);
  }

  function createReplayMarkerContent(stop, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "route-map-stop";
    button.dataset.stopIndex = String(index);
    button.dataset.labelSide = index % 2 === 1 ? "left" : "right";
    button.setAttribute("aria-label", `第${index + 1}站${stop.cityName}，${stopDateText(stop)}`);
    button.title = `${String(index + 1).padStart(2, "0")} · ${stop.cityName} · ${stopDateText(stop)}`;
    const halo = document.createElement("span");
    halo.className = "route-map-stop-halo";
    halo.setAttribute("aria-hidden", "true");
    const dot = document.createElement("span");
    dot.className = "route-map-stop-dot";
    dot.setAttribute("aria-hidden", "true");
    const number = document.createElement("span");
    number.className = "route-map-stop-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const label = document.createElement("span");
    label.className = "route-map-stop-label";
    label.textContent = stop.cityName;
    button.append(halo, dot, number, label);
    button.addEventListener("click", () => setReplayIndex(index));
    return button;
  }

  function replayMarkerOffsets(positions) {
    const offsets = new Map();
    const groups = new Map();
    positions.forEach((position, index) => {
      if (!position) return;
      const key = position.map((value) => Number(value).toFixed(5)).join(",");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(index);
    });
    groups.forEach((indices) => {
      if (indices.length < 2) return;
      indices.forEach((stopIndex, duplicateIndex) => {
        offsets.set(stopIndex, [(duplicateIndex - (indices.length - 1) / 2) * 34, duplicateIndex % 2 ? -12 : 12]);
      });
    });
    return offsets;
  }

  function updateReplayMapState(announce = false) {
    replaySegmentLines.forEach(({ polyline, index, segment }) => {
      const travelled = index < replayIndex;
      const current = index === replayIndex - 1;
      polyline.setOptions?.({
        strokeColor: segment.color,
        strokeOpacity: current ? 1 : travelled ? .9 : .28,
        strokeWeight: current ? 8 : travelled ? 6 : 4,
        strokeStyle: current || travelled ? "solid" : "dashed"
      });
    });
    replayMarkers.forEach(({ marker, content, index, position }) => {
      content.classList.toggle("is-visited", index <= replayIndex);
      content.classList.toggle("is-active", index === replayIndex);
      content.setAttribute("aria-current", index === replayIndex ? "step" : "false");
      marker.setzIndex?.(index === replayIndex ? 220 : 150 + index);
      if (announce && index === replayIndex) {
        const bounds = replayMap?.getBounds?.();
        if (bounds?.contains && !bounds.contains(position)) replayMap.panTo?.(position, 450);
      }
    });
    const container = byId("route-replay-map");
    container.dataset.travelledSegments = String(Math.max(0, replayIndex));
    container.dataset.currentStop = String(replayIndex);
  }

  async function drawReplayMap() {
    const container = byId("route-replay-map");
    const status = byId("route-replay-map-empty");
    feedback("map", "正在载入高德地图与旅程路线…");
    status.hidden = false;
    try {
      const profiles = await getCityProfiles();
      replay = window.TRAVEL_ROUTE_REPLAY_ENGINE.buildReplay(activeJourney, profiles, {});
      renderReplayLegend();
      updateReplayView(false);
      const positions = replay.stops.map(amapPosition);
      const validPositions = positions.filter(Boolean);
      if (!validPositions.length) {
        feedback("map", "这趟旅程的城市还缺少坐标，暂时无法绘制路线。");
        return;
      }
      const markerOffsets = replayMarkerOffsets(positions);
      const AMap = await loadAmap();
      replayMap?.destroy?.();
      container.replaceChildren();
      replayMap = new AMap.Map(container, {
        viewMode: "2D",
        mapStyle: "amap://styles/normal",
        zoom: 5,
        center: validPositions[0],
        resizeEnable: true,
        showIndoorMap: false
      });
      if (AMap.ToolBar) replayMap.addControl?.(new AMap.ToolBar({ position: "LT" }));
      if (AMap.Scale) replayMap.addControl?.(new AMap.Scale());
      replaySegmentLines = replay.segments.flatMap((segment) => {
        const from = positions[segment.index];
        const to = positions[segment.index + 1];
        if (!from || !to) return [];
        const polyline = new AMap.Polyline({
          path: [from, to],
          strokeColor: segment.color,
          strokeOpacity: .28,
          strokeWeight: 4,
          strokeStyle: "dashed",
          lineJoin: "round",
          lineCap: "round",
          zIndex: 90,
          extData: { segmentIndex: segment.index }
        });
        polyline.setMap(replayMap);
        return [{ polyline, index: segment.index, segment }];
      });
      replayMarkers = replay.stops.flatMap((stop, index) => {
        const position = positions[index];
        if (!position) return [];
        const content = createReplayMarkerContent(stop, index);
        const offset = markerOffsets.get(index);
        const marker = new AMap.Marker({
          position,
          content,
          anchor: "center",
          title: `${String(index + 1).padStart(2, "0")} · ${stop.cityName}`,
          zIndex: 150 + index,
          ...(offset && AMap.Pixel ? { offset: new AMap.Pixel(offset[0], offset[1]) } : {})
        });
        marker.setMap(replayMap);
        return [{ marker, content, index, position }];
      });
      const overlays = [...replaySegmentLines.map((item) => item.polyline), ...replayMarkers.map((item) => item.marker)];
      if (validPositions.length === 1) replayMap.setZoomAndCenter?.(8, validPositions[0]);
      else replayMap.setFitView?.(overlays, false, [70, 80, 170, 80], 9);
      replayMap.resize?.();
      container.dataset.mapProvider = "amap";
      container.dataset.segmentCount = String(replaySegmentLines.length);
      updateReplayMapState(false);
      status.hidden = true;
    } catch {
      feedback("map", "暂时无法绘制地图。可以继续使用路线列表与播放控制。", true);
    }
  }

  function renderReplayLegend() {
    const legend = byId("route-replay-legend");
    legend.replaceChildren();
    const usedTypes = [...new Set(replay.segments.map((segment) => segment.type))];
    usedTypes.forEach((type) => {
      const item = document.createElement("span");
      const swatch = document.createElement("i");
      swatch.style.background = window.TRAVEL_ROUTE_REPLAY_ENGINE.TRANSPORT_TYPES[type].color;
      item.append(swatch, window.TRAVEL_ROUTE_REPLAY_ENGINE.TRANSPORT_TYPES[type].label);
      legend.append(item);
    });
    const note = document.createElement("small");
    note.textContent = "未填写分段里程时，按城市坐标直线估算";
    legend.append(note);
  }

  function renderReplayStopList() {
    const list = byId("route-replay-stop-list");
    list.replaceChildren();
    replay.stops.forEach((stop, index) => {
      const item = document.createElement("li");
      item.dataset.stopIndex = index;
      const button = document.createElement("button");
      button.type = "button";
      const number = document.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      const copy = document.createElement("span");
      const city = document.createElement("strong");
      city.textContent = stop.cityName;
      const date = document.createElement("small");
      date.textContent = stop.arrivalDate || "日期待补充";
      copy.append(city, date);
      button.append(number, copy);
      button.addEventListener("click", () => setReplayIndex(index));
      item.append(button);
      list.append(item);
    });
  }

  function updateReplayUrl() {
    const url = new URL(window.location.href);
    if (url.searchParams.get("replay") !== "1") return;
    url.searchParams.set("stop", String(replayIndex + 1));
    window.history.replaceState(null, "", url);
  }

  function updateReplayView(announce = true) {
    const stop = replay.stops[replayIndex];
    if (!stop) return;
    updateReplayMapState(announce);
    document.querySelectorAll("#route-replay-stop-list li").forEach((item) => {
      const index = Number(item.dataset.stopIndex);
      item.classList.toggle("is-visited", index <= replayIndex);
      item.classList.toggle("is-active", index === replayIndex);
      item.querySelector("button").setAttribute("aria-current", index === replayIndex ? "step" : "false");
    });

    byId("route-replay-counter").textContent = `${String(replayIndex + 1).padStart(2, "0")} / ${String(replay.stops.length).padStart(2, "0")}`;
    byId("route-replay-step-label").textContent = `ARRIVAL ${String(replayIndex + 1).padStart(2, "0")}`;
    byId("route-replay-city").textContent = stop.cityName;
    byId("route-replay-panel-city").textContent = stop.cityName;
    byId("route-replay-date").textContent = stopDateText(stop);
    byId("route-replay-stay").textContent = stopStayText(stop);
    byId("route-replay-description").textContent = stop.description || "这座城市的停留记录仍在整理。";

    const arrivalCard = byId("route-arrival-card");
    showReplayPhoto(stop);
    if (announce) {
      arrivalCard.classList.remove("is-arriving");
      window.requestAnimationFrame(() => arrivalCard.classList.add("is-arriving"));
    }

    const leg = replay.segments[replayIndex];
    const nextLeg = byId("route-replay-next-leg");
    nextLeg.replaceChildren();
    if (leg) {
      const label = document.createElement("span");
      label.textContent = `NEXT · ${leg.from} → ${leg.to}`;
      const route = document.createElement("strong");
      const swatch = document.createElement("i");
      swatch.style.background = leg.color;
      route.append(swatch, leg.label);
      const distance = document.createElement("p");
      distance.textContent = leg.distanceKm
        ? `${leg.distanceEstimated ? "约 " : ""}${numberFormatter.format(leg.distanceKm)} 公里`
        : "里程待补充";
      nextLeg.append(label, route, distance);
    } else {
      const label = document.createElement("span");
      label.textContent = "JOURNEY COMPLETE";
      const route = document.createElement("strong");
      route.textContent = "抵达旅程终点";
      const distance = document.createElement("p");
      const total = replay.segments.reduce((sum, segment) => sum + segment.distanceKm, 0);
      distance.textContent = total ? `路线合计约 ${numberFormatter.format(total)} 公里` : "完整路线已经点亮";
      nextLeg.append(label, route, distance);
    }

    byId("route-replay-previous").disabled = replayIndex === 0;
    byId("route-replay-next").disabled = replayIndex === replay.stops.length - 1;
    byId("route-replay-progress").style.width = replay.stops.length > 1
      ? `${replayIndex / (replay.stops.length - 1) * 100}%`
      : "100%";
    updateReplayUrl();
  }

  function paintReplayPhoto(stop, url) {
    const photo = byId("route-replay-photo");
    const arrivalCard = byId("route-arrival-card");
    photo.hidden = !url;
    arrivalCard.classList.toggle("is-text-only", !url);
    if (!url) photoImages.clearImage(photo);
    else if (photo.dataset.photoOriginal !== url) {
      photo.alt = replayPhotoAlt(stop);
      photoImages.setImage(photo, url, { size: "thumb", loading: "eager" });
    }
  }

  function showReplayPhoto(stop) {
    const city = stop.cityName;
    const photo = byId("route-replay-photo");
    if (photo.dataset.city !== city) {
      photo.dataset.city = city;
      paintReplayPhoto(stop, "");
      feedback("stop-photo", "");
    }
    if (!replayVisible || replayPhotos.has(city)) {
      const cached = replayPhotos.get(city);
      if (typeof cached === "string") paintReplayPhoto(stop, cached);
      else if (cached) feedback("stop-photo", "正在加载本站照片…");
      return;
    }

    const request = data.representativePhoto(activeJourney, city, galleryPhotos);
    replayPhotos.set(city, request);
    const isCurrent = () => replay.stops[replayIndex]?.cityName === city;
    feedback("stop-photo", "正在加载本站照片…");
    request.then(url => {
      replayPhotos.set(city, url);
      if (!isCurrent()) return;
      paintReplayPhoto(stop, url);
      feedback("stop-photo", "");
    }).catch(() => {
      replayPhotos.delete(city);
      if (isCurrent()) feedback("stop-photo", "本站照片暂时无法读取。", true);
    });
  }

  function stopReplay() {
    window.clearInterval(replayTimer);
    replayTimer = null;
    replayPlaying = false;
    const button = byId("route-replay-play");
    button.textContent = "播放";
    button.setAttribute("aria-label", "播放路线");
  }

  function setReplayIndex(index, announce = true) {
    if (!replay?.stops.length) return;
    replayIndex = Math.min(replay.stops.length - 1, Math.max(0, Number(index) || 0));
    updateReplayView(announce);
    if (replayPlaying && replayIndex === replay.stops.length - 1) stopReplay();
  }

  function toggleReplay() {
    if (!replay?.stops.length) return;
    if (replayPlaying) {
      stopReplay();
      return;
    }
    if (replayIndex === replay.stops.length - 1) setReplayIndex(0);
    replayPlaying = true;
    const button = byId("route-replay-play");
    button.textContent = "暂停";
    button.setAttribute("aria-label", "暂停路线");
    replayTimer = window.setInterval(() => setReplayIndex(replayIndex + 1), 2400);
  }

  function copyText(value) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    return copied ? Promise.resolve() : Promise.reject(new Error("copy failed"));
  }

  async function shareReplay() {
    const url = window.TRAVEL_ROUTE_REPLAY_ENGINE.createShareUrl(window.location.href, activeJourney.slug, replayIndex);
    const status = byId("route-replay-share-status");
    try {
      if (navigator.share) {
        await navigator.share({ title: `${activeJourney.title}路线回放`, text: `从${replay.stops[0].cityName}到${replay.stops.at(-1).cityName}，一起重走这趟旅程。`, url });
        status.textContent = "分享面板已打开。";
      } else {
        await copyText(url);
        status.textContent = "独立路线链接已复制，可以直接分享。";
      }
    } catch (error) {
      status.textContent = error?.name === "AbortError" ? "已取消分享。" : `分享链接：${url}`;
    }
  }

  function renderJourneySelector(journeys) {
    const selector = byId("route-replay-journey");
    selector.replaceChildren();
    journeys.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.slug;
      option.textContent = item.title;
      option.selected = item.slug === activeJourney.slug;
      selector.append(option);
    });
  }

  function initializeReplay(journey, url) {
    const profiles = journey.source === "base" ? data.baseVisits(journey) : [];
    replay = window.TRAVEL_ROUTE_REPLAY_ENGINE.buildReplay(journey, profiles, {});
    const selector = byId("route-replay-journey");
    renderJourneySelector([journey]);
    selector.addEventListener("change", () => {
      const url = new URL("./journey.html", window.location.href);
      url.searchParams.set("slug", selector.value);
      url.searchParams.set("replay", "1");
      url.hash = "route-replay";
      window.location.assign(url);
    });

    if (!replay.stops.length) {
      feedback("map", "这趟旅程还没有城市停留，暂时无法播放路线。");
      document.querySelectorAll(".route-replay-controls button, #route-replay-share").forEach((button) => { button.disabled = true; });
      return;
    }
    renderReplayLegend();
    renderReplayStopList();
    const requestedStop = Number(url.searchParams.get("stop")) - 1;
    replayIndex = Number.isInteger(requestedStop) && requestedStop >= 0 ? Math.min(requestedStop, replay.stops.length - 1) : 0;
    updateReplayView(false);
    byId("route-replay-play").addEventListener("click", toggleReplay);
    byId("route-replay-previous").addEventListener("click", () => {
      stopReplay();
      setReplayIndex(replayIndex - 1);
    });
    byId("route-replay-next").addEventListener("click", () => {
      stopReplay();
      setReplayIndex(replayIndex + 1);
    });
    byId("route-replay-share").addEventListener("click", shareReplay);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && replayPlaying) stopReplay();
    });
    const activate = () => {
      replayVisible = true;
      showReplayPhoto(replay.stops[replayIndex]);
      drawReplayMap();
    };
    if (url.searchParams.get("replay") === "1" || url.hash === "#route-replay") {
      window.requestAnimationFrame(() => byId("route-replay").scrollIntoView({ block: "start", behavior: "instant" }));
      activate();
    } else {
      whenNear(byId("route-replay-map"), activate);
    }
  }

  function renderRoute(journey) {
    const route = byId("journey-route");
    route.replaceChildren();
    journey.stops.forEach((stop, index) => {
      const item = document.createElement("article");
      item.className = "journey-stop";
      const number = document.createElement("span");
      number.className = "journey-stop-number";
      number.textContent = String(index + 1).padStart(2, "0");
      const copy = document.createElement("div");
      const city = document.createElement("a");
      city.href = cityHref(stop.cityName, stop.arrivalDate);
      city.dataset.stopIndex = index;
      city.textContent = stop.cityName;
      const dates = document.createElement("p");
      dates.textContent = stop.departureDate
        ? `${formatDate(stop.arrivalDate)} — ${formatDate(stop.departureDate)}`
        : formatDate(stop.arrivalDate);
      if (stop.departureEstimated) dates.textContent += "（按行程推算）";
      const notes = document.createElement("p");
      notes.className = "journey-stop-notes";
      notes.textContent = stop.notes || "城市停留记录待补充。";
      copy.append(city, dates, notes);
      item.append(number, copy);
      route.append(item);

      if (index < journey.stops.length - 1) {
        const transport = document.createElement("div");
        transport.className = "journey-transport";
        transport.innerHTML = "<i aria-hidden=\"true\"></i>";
        const label = document.createElement("span");
        label.textContent = stop.transportToNext || "交通方式待补充";
        transport.append(label);
        route.append(transport);
      }
    });
  }

  function openPhoto(photo, button) {
    lastPhotoButton = button;
    const lightbox = byId("journey-lightbox");
    const image = byId("journey-lightbox-image");
    image.src = photo.imageUrl;
    image.alt = photo.caption || `${photo.cityName}旅程照片`;
    byId("journey-lightbox-caption").textContent = [photo.cityName, photo.caption].filter(Boolean).join(" · ");
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    byId("journey-lightbox-close").focus();
  }

  function closePhoto() {
    byId("journey-lightbox").hidden = true;
    byId("journey-lightbox-image").removeAttribute("src");
    document.body.style.overflow = "";
    lastPhotoButton?.focus({ preventScroll: true });
  }

  function renderPhotos(photos) {
    const grid = byId("journey-photo-grid");
    grid.replaceChildren();
    byId("journey-photo-count").textContent = `${photos.length} 张旅程照片`;
    if (!photos.length) {
      const empty = document.createElement("p");
      empty.className = "journey-empty";
      empty.textContent = "还没有为这趟旅程关联照片。";
      grid.append(empty);
      return;
    }
    photos.forEach((photo, index) => {
      const figure = document.createElement("figure");
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `查看${photo.cityName || "旅程"}照片 ${index + 1}`);
      const image = document.createElement("img");
      photoImages.setImage(image, photo.imageUrl);
      image.alt = photo.caption || `${photo.cityName || "旅程"}照片`;
      image.loading = "lazy";
      button.append(image);
      button.addEventListener("click", () => openPhoto(photo, button));
      const caption = document.createElement("figcaption");
      caption.textContent = photo.caption || photo.cityName || `旅程照片 ${index + 1}`;
      figure.append(button, caption);
      grid.append(figure);
    });
  }

  function renderGuides(guides) {
    const list = byId("journey-guide-list");
    list.replaceChildren();
    if (!guides.length) {
      const empty = document.createElement("p");
      empty.className = "journey-empty";
      empty.textContent = "这趟旅程还没有上传攻略或游记文件。";
      list.append(empty);
      return;
    }
    guides.forEach((guide) => {
      const anchor = document.createElement("a");
      anchor.href = guideHref(guide);
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      const type = document.createElement("span");
      type.textContent = guide.fileType.toUpperCase();
      const title = document.createElement("strong");
      title.textContent = guide.title;
      const arrow = document.createElement("span");
      arrow.textContent = "打开文档 ↗";
      anchor.append(type, title, arrow);
      list.append(anchor);
    });
  }

  function renderJourney(journey) {
    activeJourney = journey;
    document.title = `${journey.title}｜Sehuri 的旅程档案`;
    byId("journey-title").textContent = journey.title;
    byId("journey-date").textContent = `${formatDate(journey.startDate)} — ${formatDate(journey.endDate)}`;
    byId("journey-route-inline").textContent = journey.stops.map((stop) => stop.cityName).join(" → ");
    byId("journey-summary").textContent = journey.summary || "这趟旅程的总结正在整理。";
    byId("journey-days").textContent = `${journey.days} 天`;
    byId("journey-city-count").textContent = `${new Set(journey.stops.map((stop) => stop.cityName)).size} 座`;
    byId("journey-distance").textContent = journey.distanceKm
      ? `${journey.distanceEstimated ? "约 " : ""}${new Intl.NumberFormat("zh-CN").format(journey.distanceKm)} km`
      : "待补充";
    byId("journey-budget").textContent = formatBudget(journey);
    byId("journey-companions").textContent = journey.companions || "待补充";
    byId("journey-accommodation").textContent = journey.accommodation || "待补充";
    byId("journey-planning").textContent = journey.planningNotes || "行前计划尚未整理。";
    byId("journey-notes").textContent = journey.travelNotes || "旅途中记录尚未整理。";
    byId("journey-reflection").textContent = journey.reflection || "旅行后的感想尚未整理。";
    renderRoute(journey);
  }

  function loadCover(journey) {
    const cover = byId("journey-cover");
    const status = byId("journey-cover-status");
    if (!journey.coverUrl) {
      status.textContent = "尚未设置旅程封面";
      status.hidden = false;
      return;
    }
    whenNear(byId("journey-hero"), () => {
      cover.addEventListener("error", () => {
        cover.hidden = true;
        status.textContent = "封面暂时无法载入";
        status.hidden = false;
      }, { once: true });
      cover.alt = `${journey.title}封面`;
      cover.hidden = false;
      photoImages.setImage(cover, journey.coverUrl, { size: "cover", loading: "eager", sizes: "100vw", priority: "high" });
    }, "0px");
  }

  function getCityProfiles() {
    cityProfilesRequest ||= data.cityProfiles(activeJourney).catch(error => {
      cityProfilesRequest = null;
      throw error;
    });
    return cityProfilesRequest;
  }

  function updateCityLinks(visits) {
    allVisits = visits;
    byId("journey-route").querySelectorAll("a[data-stop-index]").forEach(anchor => {
      const stop = activeJourney.stops[Number(anchor.dataset.stopIndex)];
      anchor.href = cityHref(stop.cityName, stop.arrivalDate);
    });
  }

  async function loadCityLinks() {
    if (!activeJourney.stops.length) return;
    feedback("city", "");
    try {
      const profiles = await getCityProfiles();
      updateCityLinks(profiles);
      const dates = await data.visitDates(activeJourney);
      updateCityLinks(window.TRAVEL_VISIT_ENGINE.mergeCityVisits(profiles, [], dates));
    } catch {
      feedback("city", "暂时无法补充到访日期，仍可打开城市记录。", true);
    }
  }

  async function loadPhotos() {
    feedback("photo", "正在加载旅程照片…");
    try {
      galleryPhotos = await data.gallery(activeJourney);
      renderPhotos(galleryPhotos);
      feedback("photo", "");
    } catch {
      feedback("photo", "暂时无法读取旅程照片。", true);
    }
  }

  async function loadGuides() {
    feedback("guide", "正在加载旅程攻略…");
    try {
      renderGuides(await data.guides(activeJourney));
      feedback("guide", "");
    } catch {
      feedback("guide", "暂时无法读取旅程攻略。", true);
    }
  }

  async function loadJourneySelector() {
    feedback("switch", "正在加载可切换的旅程…");
    try {
      const journeys = await data.list();
      if (!journeys.some(journey => journey.slug === activeJourney.slug)) journeys.unshift(activeJourney);
      renderJourneySelector(journeys);
      feedback("switch", "");
    } catch {
      feedback("switch", "暂时无法读取其他旅程。", true);
    }
  }

  async function loadJourney() {
    feedback("load", "正在打开旅程档案…");
    const url = new URL(window.location.href);
    let journey;
    try {
      journey = await data.core(url.searchParams.get("slug") || "");
    } catch {
      feedback("load", "暂时无法载入这份旅程档案。", true);
      return;
    }
    if (!journey) {
      feedback("load", "这份旅程档案当前不可用，可能尚未发布或链接已经变化。");
      return;
    }
    if (journey.source === "base") allVisits = data.baseVisits(journey);
    renderJourney(journey);
    byId("journey-loading").hidden = true;
    byId("journey-content").hidden = false;
    initializeReplay(journey, url);
    loadCover(journey);
    loadCityLinks();
    loadJourneySelector();
    loadGuides();
    whenNear(byId("journey-photos"), loadPhotos);
  }

  function initialize() {
    byId("journey-current-year").textContent = new Date().getFullYear();
    byId("journey-lightbox-close").addEventListener("click", closePhoto);
    byId("journey-lightbox").addEventListener("click", (event) => {
      if (event.target === byId("journey-lightbox")) closePhoto();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !byId("journey-lightbox").hidden) closePhoto();
    });
    byId("journey-load-retry").addEventListener("click", loadJourney);
    byId("journey-switch-retry").addEventListener("click", loadJourneySelector);
    byId("journey-city-retry").addEventListener("click", loadCityLinks);
    byId("journey-photo-retry").addEventListener("click", loadPhotos);
    byId("journey-guide-retry").addEventListener("click", loadGuides);
    byId("journey-map-retry").addEventListener("click", drawReplayMap);
    byId("journey-stop-photo-retry").addEventListener("click", () => showReplayPhoto(replay.stops[replayIndex]));
    byId("route-replay-photo").addEventListener("error", () => {
      const stop = replay.stops[replayIndex];
      paintReplayPhoto(stop, "");
      replayPhotos.delete(stop.cityName);
      feedback("stop-photo", "本站照片暂时无法显示。", true);
    });
    loadJourney();
  }

  initialize();
})();
