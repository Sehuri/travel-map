(function () {
  "use strict";

  const { visits, wishlist } = window.TRAVEL_DATA;
  const photoManifest = window.PHOTO_MANIFEST || {};
  const chinaBounds = [[17, 73], [54, 136]];
  const worldBounds = [[-5, 65], [58, 145]];
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const timeline = document.querySelector("#timeline");
  const yearFilter = document.querySelector("#year-filter");
  const cityDialog = document.querySelector("#city-dialog");
  const guideDialog = document.querySelector("#guide-dialog");
  const lightbox = document.querySelector("#lightbox");
  let travelMap;
  let markerLayer;
  let markers = [];
  let activeMarker = null;

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
    document.querySelector("#current-year").textContent = new Date().getFullYear();
  }

  function initializeYearFilter() {
    const years = [...new Set(visits.map((visit) => visit.date.slice(0, 4)))].sort().reverse();
    years.forEach((year) => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = `${year} 年`;
      yearFilter.append(option);
    });
    yearFilter.addEventListener("change", () => renderTimeline(yearFilter.value));
  }

  function renderTimeline(selectedYear = "all") {
    timeline.replaceChildren();
    const filtered = selectedYear === "all"
      ? visits
      : visits.filter((visit) => visit.date.startsWith(selectedYear));
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
        .forEach((visit, index) => cities.append(createCityCard(visit, index)));

      group.append(heading, cities);
      timeline.append(group);
    });
  }

  function createCityCard(visit, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "city-card";
    button.setAttribute("aria-label", `查看${visit.name}旅行详情`);

    const number = document.createElement("span");
    number.className = "index";
    number.textContent = String(index + 1).padStart(2, "0");

    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";

    const name = document.createElement("h3");
    name.textContent = visit.name;

    const meta = document.createElement("p");
    meta.textContent = `${dateFormatter.format(new Date(`${visit.date}T00:00:00`))} · ${visit.country}`;

    button.append(number, arrow, name, meta);
    button.addEventListener("click", () => openCity(visit));
    return button;
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

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
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
    travelMap.fitBounds(view === "china" ? chinaBounds : worldBounds, {
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

  async function openCity(visit) {
    document.querySelector("#dialog-country").textContent = visit.country;
    document.querySelector("#dialog-date").dateTime = visit.date;
    document.querySelector("#dialog-date").textContent = dateFormatter.format(new Date(`${visit.date}T00:00:00`));
    document.querySelector("#dialog-title").textContent = visit.name;
    document.querySelector("#dialog-description").textContent = visit.desc;
    document.querySelector("#photo-grid").replaceChildren();
    document.querySelector("#photo-status").textContent = "正在寻找这座城市的旅行照片…";
    if (!cityDialog.open) cityDialog.showModal();
    loadPhotos(visit.name);
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
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !lightbox.hidden) closeLightbox();
    });
  }

  initializeStats();
  initializeYearFilter();
  renderTimeline();
  initializeMap();
  initializeWishlist();
  initializeDialogs();
})();
