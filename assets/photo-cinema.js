(function () {
  "use strict";

  window.initializePhotoCinema = function (photoDetails, visits, journeys, openWall) {
    const root = document.querySelector("#photo-cinema");
    if (!root) return null;

    const allPhotos = [...photoDetails];
    const photoByUrl = new Map(allPhotos.map(photo => [photo.imageUrl, photo]));
    (journeys || []).forEach(journey => (journey.photos || []).forEach(photo => {
      if (!photo.imageUrl || photoByUrl.has(photo.imageUrl)) return;
      const entry = {
        ...photo,
        cityName: photo.cityName || journey.stops?.[0]?.cityName || "旅程影像",
        caption: photo.caption || ""
      };
      allPhotos.push(entry);
      photoByUrl.set(entry.imageUrl, entry);
    }));
    if (!allPhotos.length) return null;
    root.hidden = false;

    const slides = [...root.querySelectorAll(".cinema-slide")];
    const play = root.querySelector("#cinema-play");
    const count = root.querySelector("#cinema-count");
    const progress = root.querySelector("#cinema-progress");
    const status = root.querySelector("#cinema-status");
    const filmstrip = root.querySelector("#cinema-filmstrip");
    const chapter = root.querySelector("#cinema-chapter");
    const journeySelect = root.querySelector("#cinema-journey");
    const citySelect = root.querySelector("#cinema-city-select");
    const dates = new Map();
    (visits || []).forEach(visit => {
      const values = dates.get(visit.name) || [];
      if (visit.date && !values.includes(visit.date)) values.push(visit.date);
      dates.set(visit.name, values);
    });
    const formatDate = value => String(value || "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, year, month, day) => `${year}.${month}.${day}`);
    const allEntries = allPhotos.map(photo => ({ photo, cityName: photo.cityName, date: (dates.get(photo.cityName) || [])[0] || "" }));
    const cityGroups = new Map();
    allEntries.forEach(entry => {
      const group = cityGroups.get(entry.cityName) || [];
      group.push(entry);
      cityGroups.set(entry.cityName, group);
    });
    const journeyGroups = (journeys || []).map(journey => {
      const stopByCity = new Map((journey.stops || []).map((stop, position) => [stop.cityName, {
        date: stop.arrivalDate || "",
        order: Number(stop.stopOrder ?? position)
      }]));
      const seen = new Set();
      const entries = (journey.photos || []).flatMap((linkedPhoto, position) => {
        if (!linkedPhoto.imageUrl || seen.has(linkedPhoto.imageUrl)) return [];
        seen.add(linkedPhoto.imageUrl);
        const photo = photoByUrl.get(linkedPhoto.imageUrl);
        if (!photo) return [];
        const cityName = linkedPhoto.cityName || photo.cityName;
        const stop = stopByCity.get(cityName);
        return [{
          photo: { ...photo, caption: linkedPhoto.caption || photo.caption },
          cityName,
          date: stop?.date || journey.startDate || "",
          journeyTitle: journey.title,
          order: stop?.order ?? Number.MAX_SAFE_INTEGER,
          photoOrder: Number(linkedPhoto.sortOrder ?? position),
          position
        }];
      }).sort((a, b) => a.order - b.order || a.photoOrder - b.photoOrder || a.position - b.position);
      return { journey, entries };
    }).filter(group => group.entries.length);

    journeyGroups.forEach(({ journey, entries }) => journeySelect.add(new Option(`${journey.title} · ${entries.length} 张`, journey.slug)));
    cityGroups.forEach((entries, city) => citySelect.add(new Option(`${city} · ${entries.length} 张`, city)));
    root.querySelector('[data-cinema-mode="journey"]').disabled = journeyGroups.length === 0;

    let mode = "all";
    let entries = allEntries;
    let index = 0;
    let active = -1;
    let activeEntry = null;
    let playing = false;
    let visible = true;
    let loading = false;
    let timer;
    let chapterTimer;
    let request = 0;

    function schedule() {
      clearTimeout(timer);
      if (playing && visible && !document.hidden && !loading && entries.length > 1) {
        timer = setTimeout(() => show(index + 1), 6500);
      }
    }
    function updatePlayback() {
      play.textContent = playing ? "暂停" : "播放";
      play.setAttribute("aria-pressed", String(playing));
      root.classList.toggle("is-playing", playing && visible && !document.hidden);
      schedule();
    }
    function showChapter(entry) {
      clearTimeout(chapterTimer);
      root.querySelector("#cinema-chapter-city").textContent = entry.cityName;
      root.querySelector("#cinema-chapter-date").textContent = entry.date ? formatDate(entry.date) : entry.journeyTitle || "旅途中的一站";
      chapter.classList.add("is-visible");
      chapter.setAttribute("aria-hidden", "false");
      chapterTimer = setTimeout(() => {
        chapter.classList.remove("is-visible");
        chapter.setAttribute("aria-hidden", "true");
      }, 1100);
    }
    function updateFilmstrip() {
      [...filmstrip.children].forEach((button, position) => {
        if (position === index) button.setAttribute("aria-current", "true");
        else button.removeAttribute("aria-current");
      });
      const selected = filmstrip.children[index];
      if (selected) filmstrip.scrollTo({
        left: selected.offsetLeft - (filmstrip.clientWidth - selected.clientWidth) / 2,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"
      });
    }
    function updateDetails(entry) {
      count.textContent = `${String(index + 1).padStart(2, "0")} / ${entries.length} 张 · ${mode === "all" ? "全部旅行照片" : mode === "journey" ? "旅程照片" : "城市照片"}`;
      progress.max = entries.length;
      progress.value = index + 1;
      root.querySelector("#cinema-context").textContent = entry.journeyTitle || (mode === "city" ? "一座城市的片段" : "旅途中收藏的瞬间");
      root.querySelector("#cinema-city").textContent = entry.cityName;
      const cityDates = dates.get(entry.cityName) || [];
      root.querySelector("#cinema-date").textContent = entry.journeyTitle
        ? `旅程到访 · ${formatDate(entry.date) || "日期待补充"}`
        : `到访记录 · ${cityDates.map(formatDate).join(" / ") || "日期待补充"}`;
      root.querySelector("#cinema-caption").textContent = entry.photo.caption || "有些风景，值得再看一遍。";
      updateFilmstrip();
    }
    async function show(next, options = {}) {
      if (!entries.length) return;
      clearTimeout(timer);
      const token = ++request;
      loading = true;
      index = (next + entries.length) % entries.length;
      const entry = entries[index];
      const target = active === 0 ? 1 : 0;
      status.textContent = "正在打开这一帧回忆…";
      const loaded = await new Promise(resolve => {
        const preload = new Image();
        const timeout = setTimeout(() => resolve(false), 12000);
        preload.onload = () => { clearTimeout(timeout); resolve(true); };
        preload.onerror = () => { clearTimeout(timeout); resolve(false); };
        preload.src = entry.photo.imageUrl;
      });
      if (token !== request) return;
      loading = false;
      if (!loaded) {
        status.textContent = "这张照片暂时未能加载，可以切换下一张。";
        schedule();
        return;
      }
      const slide = slides[target];
      const image = slide.querySelector("img");
      image.src = entry.photo.imageUrl;
      image.alt = entry.photo.caption || `${entry.cityName}的旅行照片`;
      slide.style.setProperty("--photo-background", `url(${JSON.stringify(entry.photo.imageUrl)})`);
      slides.forEach(item => { item.classList.remove("is-current"); item.setAttribute("aria-hidden", "true"); });
      slide.classList.add("is-current");
      slide.setAttribute("aria-hidden", "false");
      if (options.chapter || (activeEntry && activeEntry.cityName !== entry.cityName)) showChapter(entry);
      else {
        clearTimeout(chapterTimer);
        chapter.classList.remove("is-visible");
        chapter.setAttribute("aria-hidden", "true");
      }
      active = target;
      activeEntry = entry;
      updateDetails(entry);
      status.textContent = "";
      if (entries.length > 1) {
        const upcoming = new Image();
        upcoming.src = entries[(index + 1) % entries.length].photo.imageUrl;
      }
      schedule();
    }
    function renderFilmstrip() {
      filmstrip.replaceChildren();
      entries.forEach((entry, position) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "cinema-thumb";
        button.setAttribute("aria-label", `第 ${position + 1} 张：${entry.cityName}${entry.photo.caption ? `，${entry.photo.caption}` : ""}`);
        const image = document.createElement("img");
        image.src = entry.photo.imageUrl;
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        button.append(image);
        button.addEventListener("click", () => show(position));
        filmstrip.append(button);
      });
      updateFilmstrip();
    }
    function selectMode(nextMode) {
      if (nextMode === "journey" && !journeyGroups.length) return;
      mode = nextMode;
      playing = false;
      updatePlayback();
      entries = mode === "journey"
        ? journeyGroups.find(group => group.journey.slug === journeySelect.value)?.entries || []
        : mode === "city" ? cityGroups.get(citySelect.value) || [] : allEntries;
      root.querySelectorAll("[data-cinema-mode]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.cinemaMode === mode));
      });
      root.querySelector("#cinema-journey-wrap").hidden = mode !== "journey";
      root.querySelector("#cinema-city-wrap").hidden = mode !== "city";
      root.querySelector("#cinema-scope-note").textContent = mode === "journey"
        ? "按旅程里的城市顺序，放映已关联的照片。"
        : mode === "city" ? "留在这一座城市，慢慢看完每张照片。" : "从第一张照片开始，重走所有旅途。";
      index = 0;
      renderFilmstrip();
      show(0, { chapter: mode !== "all" });
    }

    root.querySelectorAll("[data-cinema-mode]").forEach(button => button.addEventListener("click", () => selectMode(button.dataset.cinemaMode)));
    journeySelect.addEventListener("change", () => selectMode("journey"));
    citySelect.addEventListener("change", () => selectMode("city"));
    play.addEventListener("click", () => { playing = !playing; updatePlayback(); });
    root.querySelector("#cinema-prev").addEventListener("click", () => show(index - 1));
    root.querySelector("#cinema-next").addEventListener("click", () => show(index + 1));
    root.querySelector("#cinema-wall").addEventListener("click", () => { playing = false; updatePlayback(); openWall(); });
    root.addEventListener("keydown", event => {
      if (event.target.closest("select")) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); show(index - 1); }
      if (event.key === "ArrowRight") { event.preventDefault(); show(index + 1); }
    });
    document.addEventListener("visibilitychange", updatePlayback);
    if (window.IntersectionObserver) new IntersectionObserver(observations => {
      visible = observations[0].isIntersecting;
      updatePlayback();
    }, { threshold: .1 }).observe(root);

    renderFilmstrip();
    updatePlayback();
    show(0);
    return {
      playAll() {
        selectMode("all");
        playing = true;
        updatePlayback();
      }
    };
  };
})();
