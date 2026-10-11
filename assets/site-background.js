(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root.document) root.TRAVEL_BACKGROUND = { ...api, ...api.initialize(root) };
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const BACKGROUNDS = Object.freeze([
    { id: "osaka", file: "osaka-mario-hero.jpg", label: "大阪 · 环球影城", desktopPosition: "center 58%", mobilePosition: "64% center" },
    { id: "bromo", file: "bromo-sunrise-hero.jpg", label: "印度尼西亚 · 布罗莫日出", desktopPosition: "center 50%", mobilePosition: "70% center" },
    { id: "changi", file: "changi-jewel-hero.jpg", label: "新加坡 · 星耀樟宜", desktopPosition: "center 50%", mobilePosition: "50% center" },
    { id: "merlion", file: "singapore-merlion-hero.jpg", label: "新加坡 · 鱼尾狮公园", desktopPosition: "center 55%", mobilePosition: "54% center" }
  ].map(Object.freeze));

  function selectBackground(random = Math.random) {
    const value = Number(random());
    const index = Number.isFinite(value) ? Math.min(BACKGROUNDS.length - 1, Math.max(0, Math.floor(value * BACKGROUNDS.length))) : 0;
    return BACKGROUNDS[index];
  }

  function initialize(window) {
    const document = window.document;
    const base = new URL(".", document.currentScript?.src || new URL("assets/site-background.js", document.baseURI));
    let current = selectBackground();

    function updateCaption() {
      document.querySelectorAll("[data-background-caption]").forEach((element) => {
        element.textContent = current.label;
      });
    }

    function apply(background) {
      current = background;
      const root = document.documentElement;
      root.dataset.backgroundId = current.id;
      root.style.setProperty("--site-background-image", `url("${new URL(current.file, base).href}")`);
      root.style.setProperty("--site-background-position", current.desktopPosition);
      root.style.setProperty("--site-background-mobile-position", current.mobilePosition);
      updateCaption();
    }

    // Select before the stylesheet is parsed so only this photo is requested.
    // The selection is per document load, not a slideshow or a saved preference.
    apply(current);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", updateCaption, { once: true });
    const ready = new Promise((resolve) => {
      function load(background, allowFallback) {
        const image = new window.Image();
        image.onload = () => resolve(current);
        image.onerror = () => {
          if (allowFallback && background.id !== BACKGROUNDS[0].id) {
            apply(BACKGROUNDS[0]);
            load(BACKGROUNDS[0], false);
          } else resolve(current);
        };
        image.src = new URL(background.file, base).href;
      }
      load(current, true);
    });
    return { ready, getCurrentBackground: () => current };
  }

  return { BACKGROUNDS, selectBackground, initialize };
});
