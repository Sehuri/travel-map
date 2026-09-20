(function () {
  "use strict";
  window.initializePhotoCinema = function (photos, visits, openWall) {
    const root = document.querySelector("#photo-cinema");
    if (!root || !photos.length) return;
    root.hidden = false;
    const slides = [...root.querySelectorAll(".cinema-slide")];
    const play = root.querySelector("#cinema-play");
    const count = root.querySelector("#cinema-count");
    const status = root.querySelector("#cinema-status");
    let index = 0, active = -1, playing = false, visible = true, loading = false, timer, request = 0;
    const dates = new Map();
    visits.forEach(visit => {
      const values = dates.get(visit.name) || [];
      if (!values.includes(visit.date)) values.push(visit.date);
      dates.set(visit.name, values);
    });
    function schedule() {
      clearTimeout(timer);
      if (playing && visible && !document.hidden && !loading) timer = setTimeout(() => show(index + 1), 6500);
    }
    function updatePlayback() {
      play.textContent = playing ? "暂停放映" : "播放所有照片";
      play.setAttribute("aria-pressed", String(playing));
      root.classList.toggle("is-playing", playing && visible && !document.hidden);
      schedule();
    }
    async function show(next) {
      clearTimeout(timer);
      const token = ++request;
      loading = true;
      index = (next + photos.length) % photos.length;
      const photo = photos[index];
      const target = active === 0 ? 1 : 0;
      const slide = slides[target];
      const image = slide.querySelector("img");
      status.textContent = "正在打开这一帧回忆…";
      // Load offscreen; stale loads may not replace a newer selection.
      const loaded = await new Promise(resolve => {
        const preload = new Image();
        const timeout = setTimeout(() => resolve(false), 12000);
        preload.onload = () => { clearTimeout(timeout); resolve(true); };
        preload.onerror = () => { clearTimeout(timeout); resolve(false); };
        preload.src = photo.imageUrl;
      });
      if (token !== request) return;
      loading = false;
      count.textContent = `${String(index + 1).padStart(2, "0")} / ${photos.length} 张 · 全部旅行照片`;
      if (!loaded) {
        status.textContent = "这张照片暂时未能加载，可以切换下一张。";
        schedule();
        return;
      }
      image.src = photo.imageUrl;
      image.alt = photo.caption || `${photo.cityName}的旅行照片`;
      slide.style.setProperty("--photo-background", `url(${JSON.stringify(photo.imageUrl)})`);
      if (active >= 0) {
        const previous = slides[active].querySelector("img");
        previous.style.transform = getComputedStyle(previous).transform;
      }
      image.style.transform = "";
      slides.forEach(item => { item.classList.remove("is-current"); item.setAttribute("aria-hidden", "true"); });
      slide.classList.add("is-current");
      slide.setAttribute("aria-hidden", "false");
      active = target;
      root.querySelector("#cinema-city").textContent = photo.cityName;
      root.querySelector("#cinema-date").textContent = `到访 · ${(dates.get(photo.cityName) || []).join(" / ") || "日期待补充"}`;
      root.querySelector("#cinema-caption").textContent = photo.caption || "有些风景，值得再看一遍。";
      status.textContent = "";
      if (photos.length > 1) {
        const upcoming = new Image();
        upcoming.src = photos[(index + 1) % photos.length].imageUrl;
      }
      schedule();
    }
    play.addEventListener("click", () => { playing = !playing; updatePlayback(); });
    root.querySelector("#cinema-prev").addEventListener("click", () => show(index - 1));
    root.querySelector("#cinema-next").addEventListener("click", () => show(index + 1));
    root.querySelector("#cinema-wall").addEventListener("click", () => { playing = false; updatePlayback(); openWall(); });
    document.addEventListener("visibilitychange", updatePlayback);
    if (window.IntersectionObserver) new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      updatePlayback();
    }, { threshold: .1 }).observe(root);
    updatePlayback();
    show(0);
  };
})();
