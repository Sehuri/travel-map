(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TRAVEL_WISHLIST_ENGINE = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const LEVELS = Object.freeze({
    3: Object.freeze({
      level: 3,
      label: "最想去",
      heading: "最想去 · 优先计划",
      description: "已经很接近下一次出发的方向"
    }),
    2: Object.freeze({
      level: 2,
      label: "很想去",
      heading: "很想去 · 等待合适时机",
      description: "认真期待，等时间与路线慢慢成形"
    }),
    1: Object.freeze({
      level: 1,
      label: "有机会去",
      heading: "有机会去 · 慢慢收藏",
      description: "先留在愿望里，等待未来的契机"
    })
  });

  function normalizePriority(value, fallback = 2) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && LEVELS[parsed]) return parsed;
    const fallbackValue = Number(fallback);
    return Number.isInteger(fallbackValue) && LEVELS[fallbackValue] ? fallbackValue : 2;
  }

  function priorityMeta(value) {
    return LEVELS[normalizePriority(value)];
  }

  function sortWishlist(items) {
    return [...(items || [])].sort((a, b) => {
      const priorityDifference = normalizePriority(b?.priorityLevel) - normalizePriority(a?.priorityLevel);
      if (priorityDifference) return priorityDifference;
      const orderDifference = Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0);
      return orderDifference || String(a?.name || "").localeCompare(String(b?.name || ""), "zh-CN");
    });
  }

  function groupWishlist(items) {
    const sorted = sortWishlist(items);
    return [3, 2, 1].map((level) => ({
      ...LEVELS[level],
      items: sorted.filter((item) => normalizePriority(item?.priorityLevel) === level)
    })).filter((group) => group.items.length);
  }

  return { LEVELS, normalizePriority, priorityMeta, sortWishlist, groupWishlist };
});
