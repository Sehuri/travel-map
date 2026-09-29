(function () {
  let pending;
  window.loadDiscoverAmap = function () {
    if (window.AMap?.Map) return Promise.resolve(window.AMap);
    if (pending) return pending;
    const config = window.AMAP_MAP_CONFIG || {};
    if (!config.jsApiKey || !config.serviceHost || !config.proxyTarget) return Promise.reject(new Error("互动地图配置不完整。"));
    if (!window.__TRAVEL_AMAP_PROXY_BRIDGE__) {
      const base = config.serviceHost.replace(/\/$/, ""), target = config.proxyTarget.replace(/\/$/, "");
      const rewrite = value => {
        const url = String(value);
        return url.startsWith(`${base}/`) ? target + url.slice(base.length) : url;
      };
      const open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url, ...rest) { return open.call(this, method, rewrite(url), ...rest); };
      const fetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = input instanceof Request ? input.url : String(input), next = rewrite(url);
        return fetch(next === url ? input : input instanceof Request ? new Request(next, input) : next, init);
      };
      window.__TRAVEL_AMAP_PROXY_BRIDGE__ = true;
    }
    window._AMapSecurityConfig = { serviceHost: config.serviceHost.replace(/\/$/, "") };
    pending = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(() => reject(new Error("互动地图加载超时，请使用外部地图链接。")), 15000);
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.jsApiKey)}&plugin=AMap.ToolBar,AMap.Scale`;
      script.onload = () => { clearTimeout(timer); window.AMap?.Map ? resolve(window.AMap) : reject(new Error("地图初始化失败。")); };
      script.onerror = () => { clearTimeout(timer); reject(new Error("地图服务暂不可用。")); };
      document.head.append(script);
    }).catch(error => { pending = null; throw error; });
    return pending;
  };
})();
