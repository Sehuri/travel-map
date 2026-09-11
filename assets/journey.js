(function () {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" });
  let lastPhotoButton = null;

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
    const journeys = window.TRAVEL_CONTENT?.getState?.().journeys || [];
    const slug = new URL(window.location.href).searchParams.get("slug") || "";
    const journey = journeys.find((item) => item.slug === slug);
    if (!journey) {
      byId("journey-loading").textContent = "没有找到这份旅程档案，可能尚未发布或链接已经变化。";
      return;
    }
    renderJourney(journey);
    byId("journey-loading").hidden = true;
    byId("journey-content").hidden = false;
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
