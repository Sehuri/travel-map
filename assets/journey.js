(function () {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" });
  const numberFormatter = new Intl.NumberFormat("zh-CN");
  const SVG_NS = "http://www.w3.org/2000/svg";
  let lastPhotoButton = null;
  let allJourneys = [];
  let activeJourney = null;
  let replay = null;
  let replayIndex = 0;
  let replayTimer = null;
  let replayPlaying = false;

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
    if (date) url.searchParams.set("visit", date);
    return url.toString();
  }

  function guideHref(guide) {
    if (guide.fileType !== "html") return guide.fileUrl;
    const viewer = new URL("./guide-viewer.html", window.location.href);
    viewer.searchParams.set("src", guide.fileUrl);
    viewer.searchParams.set("title", guide.title);
    return viewer.toString();
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
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

  function drawReplayMap() {
    const engine = window.TRAVEL_ROUTE_REPLAY_ENGINE;
    const map = byId("route-replay-map");
    map.replaceChildren();
    const title = svgElement("title");
    title.id = "route-replay-map-title";
    title.textContent = `${activeJourney.title}路线地图`;
    const description = svgElement("desc");
    description.id = "route-replay-map-description";
    description.textContent = "按真实地理方位展示旅程城市；播放时会依次点亮站点与交通线路。";
    map.append(title, description);

    const background = svgElement("rect", { x: 0, y: 0, width: 1000, height: 520, class: "route-map-background" });
    map.append(background);
    for (let x = 100; x < 1000; x += 100) {
      map.append(svgElement("line", { x1: x, y1: 0, x2: x, y2: 520, class: "route-map-grid-line" }));
    }
    for (let y = 80; y < 520; y += 80) {
      map.append(svgElement("line", { x1: 0, y1: y, x2: 1000, y2: y, class: "route-map-grid-line" }));
    }

    const positions = engine.projectStops(replay.stops);
    const pointByStop = new Map(positions.map((point) => [point.stopIndex, point]));
    byId("route-replay-map-empty").hidden = positions.length > 0;
    replay.segments.forEach((segment) => {
      const from = pointByStop.get(segment.index);
      const to = pointByStop.get(segment.index + 1);
      if (!from || !to) return;
      const path = svgElement("path", {
        d: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
        class: "route-map-segment",
        "data-segment-index": segment.index,
        stroke: segment.color
      });
      const pathTitle = svgElement("title");
      pathTitle.textContent = `${segment.from}到${segment.to}：${segment.label}，${segment.distanceKm}公里`;
      path.append(pathTitle);
      map.append(path);
    });

    positions.forEach((point) => {
      const stop = replay.stops[point.stopIndex];
      const group = svgElement("g", {
        class: "route-map-stop",
        "data-stop-index": point.stopIndex,
        role: "button",
        tabindex: "0",
        "aria-label": `第${point.stopIndex + 1}站${stop.cityName}`,
        transform: `translate(${point.x} ${point.y})`
      });
      const halo = svgElement("circle", { r: 25, class: "route-map-stop-halo" });
      const dot = svgElement("circle", { r: 8, class: "route-map-stop-dot" });
      const labelOnLeft = point.stopIndex % 2 === 1;
      const number = svgElement("text", { x: 0, y: -19, class: "route-map-stop-number", "text-anchor": "middle" });
      number.textContent = String(point.stopIndex + 1).padStart(2, "0");
      const label = svgElement("text", {
        x: labelOnLeft ? -18 : 18,
        y: 6,
        class: "route-map-stop-label",
        "text-anchor": labelOnLeft ? "end" : "start"
      });
      label.textContent = stop.cityName;
      group.append(halo, dot, number, label);
      group.addEventListener("click", () => setReplayIndex(point.stopIndex));
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setReplayIndex(point.stopIndex);
        }
      });
      map.append(group);
    });
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
    document.querySelectorAll(".route-map-segment").forEach((segment) => {
      const index = Number(segment.dataset.segmentIndex);
      segment.classList.toggle("is-travelled", index < replayIndex);
      segment.classList.toggle("is-current", index === replayIndex - 1);
    });
    document.querySelectorAll(".route-map-stop").forEach((node) => {
      const index = Number(node.dataset.stopIndex);
      node.classList.toggle("is-visited", index <= replayIndex);
      node.classList.toggle("is-active", index === replayIndex);
      node.setAttribute("aria-current", index === replayIndex ? "step" : "false");
    });
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

    const photo = byId("route-replay-photo");
    photo.hidden = !stop.photoUrl;
    if (stop.photoUrl) {
      photo.src = stop.photoUrl;
      photo.alt = replayPhotoAlt(stop);
    } else {
      photo.removeAttribute("src");
      photo.alt = "";
    }
    const arrivalCard = byId("route-arrival-card");
    arrivalCard.classList.toggle("is-text-only", !stop.photoUrl);
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

  function initializeReplay(journey, journeys, visits, photoManifest) {
    const engine = window.TRAVEL_ROUTE_REPLAY_ENGINE;
    if (!engine?.buildReplay) return;
    replay = engine.buildReplay(journey, visits, photoManifest);
    const selector = byId("route-replay-journey");
    selector.replaceChildren();
    journeys.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.slug;
      option.textContent = item.title;
      option.selected = item.slug === journey.slug;
      selector.append(option);
    });
    selector.addEventListener("change", () => {
      const url = new URL("./journey.html", window.location.href);
      url.searchParams.set("slug", selector.value);
      url.searchParams.set("replay", "1");
      url.hash = "route-replay";
      window.location.assign(url);
    });

    if (!replay.stops.length) {
      byId("route-replay-map-empty").hidden = false;
      byId("route-replay-map-empty").textContent = "这趟旅程还没有城市停留，暂时无法播放路线。";
      document.querySelectorAll(".route-replay-controls button, #route-replay-share").forEach((button) => { button.disabled = true; });
      return;
    }
    drawReplayMap();
    renderReplayLegend();
    renderReplayStopList();
    const requestedStop = Number(new URL(window.location.href).searchParams.get("stop")) - 1;
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
    if (new URL(window.location.href).searchParams.get("replay") === "1") {
      window.requestAnimationFrame(() => byId("route-replay").scrollIntoView({ block: "start" }));
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
      city.textContent = stop.cityName;
      const dates = document.createElement("p");
      dates.textContent = stop.departureDate
        ? `${formatDate(stop.arrivalDate)} — ${formatDate(stop.departureDate)}`
        : formatDate(stop.arrivalDate);
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

  function renderPhotos(journey) {
    const grid = byId("journey-photo-grid");
    grid.replaceChildren();
    byId("journey-photo-count").textContent = `${journey.photos.length} 张旅程照片`;
    if (!journey.photos.length) {
      const empty = document.createElement("p");
      empty.className = "journey-empty";
      empty.textContent = "还没有为这趟旅程关联照片。";
      grid.append(empty);
      return;
    }
    journey.photos.forEach((photo, index) => {
      const figure = document.createElement("figure");
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `查看${photo.cityName || "旅程"}照片 ${index + 1}`);
      const image = document.createElement("img");
      image.src = photo.imageUrl;
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

  function renderGuides(journey) {
    const list = byId("journey-guide-list");
    list.replaceChildren();
    if (!journey.guides.length) {
      const empty = document.createElement("p");
      empty.className = "journey-empty";
      empty.textContent = "这趟旅程还没有上传攻略或游记文件。";
      list.append(empty);
      return;
    }
    journey.guides.forEach((guide) => {
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
    byId("journey-city-count").textContent = `${journey.stops.length} 座`;
    byId("journey-distance").textContent = journey.distanceKm
      ? `${journey.distanceEstimated ? "约 " : ""}${new Intl.NumberFormat("zh-CN").format(journey.distanceKm)} km`
      : "待补充";
    byId("journey-budget").textContent = formatBudget(journey);
    byId("journey-companions").textContent = journey.companions || "待补充";
    byId("journey-accommodation").textContent = journey.accommodation || "待补充";
    byId("journey-planning").textContent = journey.planningNotes || "行前计划尚未整理。";
    byId("journey-notes").textContent = journey.travelNotes || "旅途中记录尚未整理。";
    byId("journey-reflection").textContent = journey.reflection || "旅行后的感想尚未整理。";
    const cover = byId("journey-cover");
    if (journey.coverUrl) {
      cover.src = journey.coverUrl;
      cover.alt = `${journey.title}封面`;
      cover.hidden = false;
    }
    renderRoute(journey);
    renderPhotos(journey);
    renderGuides(journey);
  }

  async function initialize() {
    byId("journey-current-year").textContent = new Date().getFullYear();
    if (window.TRAVEL_CONTENT?.ready) await window.TRAVEL_CONTENT.ready;
    const content = window.TRAVEL_CONTENT?.getState?.() || {};
    const journeys = content.journeys || [];
    allJourneys = journeys;
    const slug = new URL(window.location.href).searchParams.get("slug") || "";
    const journey = journeys.find((item) => item.slug === slug);
    if (!journey) {
      byId("journey-loading").textContent = "没有找到这份旅程档案，可能尚未发布或链接已经变化。";
      return;
    }
    renderJourney(journey);
    byId("journey-loading").hidden = true;
    byId("journey-content").hidden = false;
    initializeReplay(journey, allJourneys, content.visits || [], content.photoManifest || {});
    byId("journey-lightbox-close").addEventListener("click", closePhoto);
    byId("journey-lightbox").addEventListener("click", (event) => {
      if (event.target === byId("journey-lightbox")) closePhoto();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !byId("journey-lightbox").hidden) closePhoto();
    });
  }

  initialize();
})();
