(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const data = window.TRAVEL_DISCOVER_DATA, engine = window.TRAVEL_DISCOVER_ENGINE;
  const endpoint = window.TRAVEL_DISCOVER_CONFIG?.endpoint || "";
  let cities = [], origins = [], preview = false, busy = false, map = null, current = null, mapObjectUrl = null;
  const seen = new Set();
  let signature = "";
  const wishlistStorageKey = "sehuri.travelWishlist.v1";
  const text = (tag, value, cls) => { const e = document.createElement(tag); e.textContent = value; if (cls) e.className = cls; return e; };
  const interestValues = () => [...$("interests").querySelectorAll("input:checked")].map(e => e.value);
  const normalName = name => name.replace(/市$/, "");
  const visitedNames = new Set((window.TRAVEL_DATA?.visits || []).filter(v => v.country === "中国").map(v => normalName(v.name)));
  const builtInWishlistNames = new Set((window.TRAVEL_DATA?.wishlist || []).map(item => normalName(item.mapLabel || item.name.split(" · ").at(-1))));
  const formatDuration = minutes => {
    if (!Number.isFinite(Number(minutes))) return "暂无方案";
    const total = Math.max(1, Math.round(Number(minutes)));
    return total < 60 ? `${total} 分钟` : `${Math.floor(total / 60)} 小时${total % 60 ? ` ${total % 60} 分` : ""}`;
  };
  const formatBudget = budget => `¥${budget.min.toLocaleString("zh-CN")}—${budget.max.toLocaleString("zh-CN")}`;
  function options() {
    const exclude = $("exclude-visited").checked
      ? cities.filter(city => visitedNames.has(normalName(city.name))).map(city => city.id)
      : [];
    return {
      origin: origins.find(c => c.label === $("origin").value),
      days: Number($("days").value),
      radius: $("radius").value,
      province: $("province").value,
      pace: $("pace").value,
      month: $("month").value,
      budgetMax: $("budget").value,
      exclude
    };
  }
  function getPool() {
    let pool = engine.candidates(cities, options());
    if (preview && interestValues().length) pool = pool.filter(c => c.tags.some(t => interestValues().includes(t)));
    return pool;
  }
  function refresh() {
    const excludedCount = $("exclude-visited").checked
      ? cities.filter(city => visitedNames.has(normalName(city.name))).length
      : 0;
    $("exclude-summary").textContent = excludedCount ? `当前排除 ${excludedCount} 座` : "当前不排除";
    try { $("candidate-status").textContent = `${getPool().length} 座城市符合距离、预算与省份条件${preview ? " · 示例范围" : " · 将为 3 个候选核验交通"}`; }
    catch { $("candidate-status").textContent = "请选择列表中的完整出发地。"; }
  }
  async function request(params, binary = false) {
    const url = new URL(endpoint);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "旅行资源服务暂时不可用，请稍后重试。"); }
    return binary ? response.blob() : response.json();
  }
  function fillCatalogue() {
    $("origin-list").replaceChildren(...origins.map(c => { const o = document.createElement("option"); o.value = c.label; return o; }));
    $("province").replaceChildren(new Option("全部省份", ""), ...[...new Set(cities.map(c => c.province))].sort().map(p => new Option(p, p)));
    $("origin").disabled = false; $("draw").disabled = false;
    if (!origins.some(c => c.label === $("origin").value)) $("origin").value = "";
    seen.clear(); signature = ""; refresh();
  }
  async function connect() {
    $("draw").disabled = true; $("origin").disabled = true;
    $("connect-retry").hidden = true; $("preview-button").hidden = true;
    if (!endpoint) {
      $("connection-status").textContent = "全国推荐尚未启用：需要配置高德 Web 服务 Key，并部署旅行资源服务。";
      $("preview-button").hidden = false; return;
    }
    $("connection-status").textContent = "正在连接全国城市目录…";
    try {
      const response = await request({ action: "catalogue" });
      cities = response.cities.filter(c => typeof c.id === "string" && typeof c.label === "string" && engine.validCoord(c.coord));
      if (!cities.length) throw new Error("城市目录为空，请检查服务配置。");
      origins = cities; preview = false;
      $("connection-status").textContent = `全国目录已连接 · ${cities.length} 座城市（含县级市）· 目录更新时间 ${response.updated}。台湾城市暂未覆盖。`;
      fillCatalogue();
    } catch (error) {
      $("connection-status").textContent = `全国目录未连接：${error.message}`;
      $("connect-retry").hidden = false; $("preview-button").hidden = false;
    }
  }
  function startPreview() {
    preview = true;
    cities = data.cities.map(c => ({ ...c, label: `${c.province} · ${c.name}` }));
    origins = [...cities, ...data.origins.filter(o => !cities.some(c => c.name === o.name)).map(c => ({ ...c, id: `origin-${c.name}`, label: `${c.name}（示例出发地）` }))];
    $("connection-status").textContent = "当前为 18 城示例体验，不是全国推荐。全国模式在配置服务后启用，包含县级市。";
    $("preview-button").hidden = true;
    fillCatalogue();
  }
  function mapLink(city, place) {
    // Provider coordinates remain GCJ-02; preview WGS84 points use a text search instead.
    if (preview) return `https://uri.amap.com/search?keyword=${encodeURIComponent(place ? place.name : city.name)}&city=${encodeURIComponent(city.name)}&callnative=0`;
    return `https://uri.amap.com/marker?position=${(place?.coord || city.coord).join(",")}&name=${encodeURIComponent(place?.name || city.name)}&coordinate=gaode&callnative=0`;
  }
  function link(label, url) { const a = text("a", label); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; return a; }
  async function routeFor(city, opts) {
    const fallback = engine.estimateRoutes(city.distance);
    if (preview) return { ...fallback, note: "示例模式采用距离估算" };
    try {
      const route = await request({ action: "route", from: opts.origin.id, to: city.id });
      if (!route.driving && !route.rail) throw new Error("未找到可比较的交通方案。");
      return { ...route, estimated: false, note: "高德路线规划预计" };
    } catch {
      return { ...fallback, note: "路线接口暂不可用，已改用距离估算" };
    }
  }
  function metric(label, value) {
    const wrapper = document.createElement("div");
    wrapper.append(text("dt", label), text("dd", value));
    return wrapper;
  }
  function transportText(routes, type) {
    const route = routes?.[type];
    if (!route) return type === "rail" ? "暂无高铁方案" : "暂无驾车方案";
    return `${formatDuration(route.durationMinutes)}${routes.estimated ? " · 估算" : ""}`;
  }
  function renderComparison(candidates, opts, interests) {
    const grid = $("candidate-grid");
    grid.replaceChildren();
    candidates.forEach((candidate, index) => {
      const card = document.createElement("article");
      card.className = `candidate-card${candidate.season.score >= 5 ? " is-season-best" : ""}`;
      const metrics = document.createElement("dl");
      metrics.className = "candidate-metrics";
      metrics.append(
        metric("直线距离", `${Math.round(candidate.distance)} km`),
        metric(`${opts.month ? `${opts.month} 月` : "季节"}适宜度`, `${"●".repeat(candidate.season.score)}${"○".repeat(5 - candidate.season.score)} ${candidate.season.label}`),
        metric("高铁/动车", transportText(candidate.routes, "rail")),
        metric("驾车", transportText(candidate.routes, "driving")),
        metric("人均预算参考", formatBudget(candidate.budget)),
        metric("交通数据", candidate.routes.note)
      );
      const choose = text("button", "查看这个目的地 ↗", "choose-candidate");
      choose.type = "button";
      choose.addEventListener("click", () => selectCandidate(candidate, opts, interests));
      card.append(
        text("p", `OPTION ${String(index + 1).padStart(2, "0")}`, "candidate-index"),
        text("h3", candidate.name),
        text("p", candidate.label, "candidate-region"),
        metrics,
        text("p", candidate.season.note, "candidate-note"),
        choose
      );
      grid.append(card);
    });
    $("comparison").hidden = false;
    $("comparison").focus({ preventScroll: true });
    $("comparison").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
  async function showMap(city, places, interests) {
    if (map) { map.remove(); map = null; }
    if (mapObjectUrl) { URL.revokeObjectURL(mapObjectUrl); mapObjectUrl = null; }
    $("resource-map").replaceChildren(); $("map-status").textContent = "正在加载资源地图…";
    try {
      if (!preview) {
        const blob = await request({ action: "map", city: city.id, interests: interests.join(","), limit: places.length }, true);
        if (!blob.type.startsWith("image/")) throw new Error("地图响应格式异常。");
        mapObjectUrl = URL.createObjectURL(blob);
        const img = new Image(); img.className = "live-map"; img.alt = `${city.name}旅游资源地图，编号对应下方景点`;
        const loaded = new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error("地图图片加载失败。")); });
        img.src = mapObjectUrl; $("resource-map").append(img); await loaded;
      } else {
        if (!window.L) throw new Error("地图组件未加载，请刷新；仍可使用“打开城市互动地图”。");
        map = L.map("resource-map", { scrollWheelZoom:false });
        const localMap = map;
        let tileFailed = false;
        const layer = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=cb1_2er4_1_991de9fa689e4c42aeee39c4", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO', maxZoom:18 });
        const tilesReady = new Promise(resolve => {
          const timer = setTimeout(()=>{ tileFailed = true; resolve(); },10000);
          layer.once("load",()=>{ clearTimeout(timer); resolve(); });
        });
        layer.on("tileerror", () => { tileFailed = true; if (map === localMap) $("map-status").textContent = "部分底图未加载，请使用外部城市地图查看。"; }).addTo(map);
        const bounds = [];
        places.forEach((p, i) => { const coord = [p.coord[1],p.coord[0]]; bounds.push(coord); L.marker(coord,{icon:L.divIcon({className:"resource-pin",html:String(i+1),iconSize:[30,30],iconAnchor:[15,15]})}).addTo(map).bindPopup(text("span",`${i+1}. ${p.name}`)); });
        if (bounds.length) map.fitBounds(bounds, { padding:[30,30], maxZoom:13 });
        else map.setView([city.coord[1],city.coord[0]],11);
        await tilesReady;
        if (tileFailed) { $("map-status").textContent = "部分底图未加载，请使用外部城市地图查看。"; return; }
      }
      $("map-status").textContent = "";
    } catch (error) { $("map-status").textContent = `${error.message} 景点列表仍可查看。`; }
  }
  async function render(city, places, opts, interests) {
    const count = Math.min(10, opts.days * (opts.pace === "relaxed" ? 1 : 2));
    places = places.slice(0,count);
    const curated = data.cities.find(c => c.province === city.province && normalName(c.name) === normalName(city.name));
    const intro = curated?.intro || `${city.label}。这次可从${places.slice(0,3).map(p=>p.name).join("、")}开始探索，按所在区域组合游览，避免在同一天跨城奔波。`;
    current = { city, places, intro, days:opts.days, origin:opts.origin.name, month:opts.month, routes:city.routes, budget:city.budget, preview };
    $("result").hidden = false;
    $("result-region").textContent = city.label;
    $("result-title").textContent = city.name;
    $("result-distance").textContent = `约 ${Math.round(city.distance)} km\n直线距离`;
    $("trip-facts").replaceChildren(
      metric("高铁 / 动车", transportText(city.routes, "rail")),
      metric("驾车", transportText(city.routes, "driving")),
      metric("人均预算参考", formatBudget(city.budget)),
      metric(`${opts.month ? `${opts.month} 月` : "季节"}适宜度`, `${city.season.label} · ${city.season.score}/5`)
    );
    $("result-intro").textContent = intro;
    $("result-reason").textContent = `${preview ? "示例抽签" : "城市抽签"} · 从${opts.origin.name}出发 · ${opts.days} 天游玩${opts.month ? ` · ${opts.month} 月出行` : ""} · ${interests.length ? interests.map(t=>data.tags[t].label).join(" / ") : "偏好不限"}。${city.season.note}`;
    $("result-tip").textContent = `${curated?.tip || "以下为按类型检索的旅游资源线索，分类不等于实地品质评价。"} 本次列出 ${places.length} 个重点，并非覆盖 ${opts.days} 天的完整行程。`;
    $("city-map-link").href = mapLink(city);
    $("map-caption").textContent = preview ? "示例点位为近似位置，仅供浏览；实际入口请查看景区指引。" : "高德静态旅游资源地图 · 编号对应景点；可打开互动地图继续缩放与导航。";
    $("places").replaceChildren(...places.map((p,i) => {
      const item = document.createElement("li");
      item.append(text("span", !preview && i === 9 ? "A" : String(i+1).padStart(2,"0"), "place-number"),text("h4",p.name),text("p",p.description || `${p.type || "旅游资源"}。位于${p.area || city.name}，可作为此次探索的一站。`),text("p",p.address || p.area || "地址请查看地图", "small"), link("在地图中查看 ↗",mapLink(city,p)));
      const source = data.sources[p.source]; if (source) item.append(link("官方介绍 ↗",source[1]));
      return item;
    }));
    const visit = window.TRAVEL_DATA?.visits?.find(v => v.country === "中国" && normalName(v.name) === normalName(city.name));
    $("memory-link").hidden = !visit;
    if (visit) $("memory-link").href = `./index.html?city=${encodeURIComponent(visit.name)}`;
    updateWishlistButton();
    $("result").focus({ preventScroll:true });
    $("result").scrollIntoView({ behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block:"start" });
    showMap(city,places,interests);
  }
  function savedWishlist() {
    try {
      const value = JSON.parse(localStorage.getItem(wishlistStorageKey) || "[]");
      return Array.isArray(value) ? value.filter(item => item && typeof item.name === "string") : [];
    } catch {
      return [];
    }
  }
  function updateWishlistButton() {
    const cityName = current ? normalName(current.city.name) : "";
    const saved = current && (builtInWishlistNames.has(cityName)
      || savedWishlist().some(item => normalName(item.mapLabel || item.name.split(" · ").at(-1)) === cityName));
    $("save-wishlist").disabled = Boolean(saved);
    $("save-wishlist").textContent = saved ? "已保存到愿望清单 ★" : "保存到愿望清单 ☆";
  }
  function saveCurrentWishlist() {
    if (!current) return;
    const saved = savedWishlist();
    const cityName = normalName(current.city.name);
    if (builtInWishlistNames.has(cityName) || saved.some(item => normalName(item.mapLabel || item.name.split(" · ").at(-1)) === cityName)) {
      updateWishlistButton();
      $("draw-status").textContent = `${current.city.name}已经在这台设备的愿望清单中。`;
      return;
    }
    const plannedTime = `${current.month ? `${current.month} 月 · ` : ""}${current.days} 天`;
    saved.push({
      name: current.city.label || current.city.name,
      icon: "签",
      desc: `随机旅行候选 · 从${current.origin}出发 · 人均参考 ${formatBudget(current.budget)}`,
      guide: `${current.intro} 建议安排 ${current.days} 天。${current.city.season.note} 交通时间与预算请在出发前再次核对。`,
      plannedTime,
      country: "中国",
      coord: current.city.coord,
      coordinateSystem: current.preview ? "WGS84" : "GCJ-02",
      mapLabel: current.city.name,
      savedAt: new Date().toISOString()
    });
    try {
      localStorage.setItem(wishlistStorageKey, JSON.stringify(saved));
      updateWishlistButton();
      $("draw-status").textContent = `已把${current.city.name}保存到愿望清单；返回旅行地图即可查看。`;
    } catch {
      $("draw-status").textContent = "浏览器未允许本地保存，请复制旅行灵感后手动记录。";
    }
  }
  async function selectCandidate(candidate, opts, interests) {
    if (busy) return;
    busy = true;
    $("draw-status").textContent = `正在展开${candidate.name}的旅游资源…`;
    $("again").disabled = true;
    $("save-wishlist").disabled = true;
    $("candidate-grid").querySelectorAll("button").forEach(button => { button.disabled = true; });
    try {
      const places = preview
        ? candidate.places.filter(place => !interests.length || place.interests.some(tag => interests.includes(tag)))
        : (await request({ action: "places", city: candidate.id, interests: interests.join(",") })).places;
      if (!places.length) throw new Error(`${candidate.name}暂未检索到匹配资源，请从另外两个候选中选择。`);
      $("comparison").hidden = true;
      $("draw-status").textContent = preview ? "已展开示例目的地。" : "目的地资料已展开；交通来自高德路线规划，景点不代表品质排名。";
      await render(candidate, places, opts, interests);
    } catch (error) {
      $("draw-status").textContent = error.message;
    } finally {
      busy = false;
      $("again").disabled = false;
      updateWishlistButton();
      $("candidate-grid").querySelectorAll("button").forEach(button => { button.disabled = false; });
    }
  }
  async function draw(event) {
    event?.preventDefault(); if (busy) return;
    if (!$("discover-form").reportValidity()) return;
    try {
      const opts = options(), interests = interestValues();
      if (interests.length > 3) throw new Error("每次最多选择 3 项喜好，或全部取消让城市随机出现。");
      const pool = getPool();
      if (!pool.length) throw new Error("当前范围没有候选城市，请扩大距离或更换省份；没有自动放宽你的条件。");
      const nextSignature = JSON.stringify([opts,interests,preview]);
      if (signature !== nextSignature) { seen.clear(); signature = nextSignature; }
      busy = true; $("draw").disabled = true; $("again").disabled = true;
      $("compare-again").disabled = true;
      for (const field of $("discover-form").elements) field.disabled = true;
      $("discover-form").setAttribute("aria-busy","true");
      $("result").hidden = true; $("comparison").hidden = true;
      const selected = engine.drawMany(pool, seen, 3);
      if (!selected.length) throw new Error("当前没有可用候选城市，请调整条件后重试。");
      $("draw-status").textContent = `正在比较 ${selected.map(city => city.name).join("、")} 的交通与预算…`;
      const candidates = await Promise.all(selected.map(async city => {
        const routes = await routeFor(city, opts);
        return { ...city, routes, budget: engine.estimateBudget(city.distance, opts.days, routes) };
      }));
      $("draw-status").textContent = preview ? "已生成 3 个示例候选，交通与预算均为参考估算。" : "3 个候选已准备好；可比较交通、预算和季节适宜度。";
      renderComparison(candidates, opts, interests);
    } catch (error) { $("draw-status").textContent = error.message; }
    finally { busy = false; for (const field of $("discover-form").elements) field.disabled = false; $("draw").disabled = !cities.length; $("origin").disabled = !cities.length; $("again").disabled = false; $("compare-again").disabled = false; $("discover-form").removeAttribute("aria-busy"); refresh(); }
  }
  for (const [id,tag] of Object.entries(data.tags)) {
    const label = text("label","","interest-chip"), input = document.createElement("input"); input.type = "checkbox"; input.value = id;
    label.append(input,document.createTextNode(tag.label)); $("interests").append(label);
  }
  $("discover-form").addEventListener("submit",draw);
  $("discover-form").addEventListener("input",refresh);
  $("again").addEventListener("click",draw);
  $("compare-again").addEventListener("click",draw);
  $("save-wishlist").addEventListener("click",saveCurrentWishlist);
  $("connect-retry").addEventListener("click",connect);
  $("preview-button").addEventListener("click",startPreview);
  $("copy-result").addEventListener("click",async () => {
    if (!current) return;
    const {city,places,intro,days,origin,routes,budget,month} = current;
    const value = `${preview ? "【示例灵感】" : "【下一站去哪】"}${city.label}\n从${origin}出发，游玩 ${days} 天${month ? `，${month} 月出行` : ""}\n高铁/动车：${transportText(routes,"rail")}；驾车：${transportText(routes,"driving")}；人均预算参考：${formatBudget(budget)}\n${intro}\n探索：${places.map(p=>p.name).join("、")}\n${$("city-map-link").href}`;
    try { await navigator.clipboard.writeText(value); $("draw-status").textContent = "旅行灵感已复制。"; }
    catch { $("draw-status").textContent = "浏览器未允许复制，请选中结果文字手动复制。"; }
  });
  $("month").value = String(new Date().getMonth() + 1);
  connect();
})();
