(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const data = window.TRAVEL_DISCOVER_DATA, engine = window.TRAVEL_DISCOVER_ENGINE;
  const endpoint = window.TRAVEL_DISCOVER_CONFIG?.endpoint || "";
  let cities = [], origins = [], preview = false, busy = false, map = null, current = null, mapObjectUrl = null;
  const seen = new Set();
  let signature = "";
  const text = (tag, value, cls) => { const e = document.createElement(tag); e.textContent = value; if (cls) e.className = cls; return e; };
  const interestValues = () => [...$("interests").querySelectorAll("input:checked")].map(e => e.value);
  const normalName = name => name.replace(/市$/, "");
  function options() {
    return { origin: origins.find(c => c.label === $("origin").value), days: Number($("days").value), radius: $("radius").value, province: $("province").value, pace: $("pace").value };
  }
  function getPool() {
    let pool = engine.candidates(cities, options());
    if (preview && interestValues().length) pool = pool.filter(c => c.tags.some(t => interestValues().includes(t)));
    return pool;
  }
  function refresh() {
    try { $("candidate-status").textContent = `${getPool().length} 座城市符合距离与省份条件${preview ? " · 示例范围" : " · 抽取后核验偏好资源"}`; }
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
    current = { city, places, intro, days:opts.days, origin:opts.origin.name };
    $("result").hidden = false;
    $("result-region").textContent = city.label;
    $("result-title").textContent = city.name;
    $("result-distance").textContent = `约 ${Math.round(city.distance)} km\n直线距离`;
    $("result-intro").textContent = intro;
    $("result-reason").textContent = `${preview ? "示例抽签" : "城市抽签"} · 从${opts.origin.name}出发 · ${opts.days} 天游玩 · ${interests.length ? interests.map(t=>data.tags[t].label).join(" / ") : "偏好不限"}。同一组条件先不重复，抽完后重新开始。`;
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
    $("result").focus({ preventScroll:true });
    $("result").scrollIntoView({ behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block:"start" });
    await showMap(city,places,interests);
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
      for (const field of $("discover-form").elements) field.disabled = true;
      $("discover-form").setAttribute("aria-busy","true");
      $("result").hidden = true;
      let result = null;
      const attempted = new Set();
      for (let attempt = 0; attempt < Math.min(3,pool.length); attempt++) {
        const city = engine.draw(pool.filter(c=>!attempted.has(c.id)),seen); attempted.add(city.id);
        $("draw-status").textContent = `正在查找${city.name}的旅游资源…（${attempt+1}/3）`;
        let places;
        if (preview) places = city.places.filter(p => !interests.length || p.interests.some(t=>interests.includes(t)));
        else places = (await request({ action:"places",city:city.id,interests:interests.join(",") })).places;
        if (places.length) { result = {city,places}; break; }
      }
      if (!result) throw new Error("本轮抽取的城市未检索到匹配资源。这不代表全国没有合适城市；可以再抽一次或调整喜好。");
      $("draw-status").textContent = preview ? "已抽出示例目的地。全国模式仍待配置。" : "下一站已选好。景点来自高德检索，不代表品质排名。";
      await render(result.city,result.places,opts,interests);
    } catch (error) { $("draw-status").textContent = error.message; }
    finally { busy = false; for (const field of $("discover-form").elements) field.disabled = false; $("draw").disabled = !cities.length; $("origin").disabled = !cities.length; $("again").disabled = false; $("discover-form").removeAttribute("aria-busy"); }
  }
  for (const [id,tag] of Object.entries(data.tags)) {
    const label = text("label","","interest-chip"), input = document.createElement("input"); input.type = "checkbox"; input.value = id;
    label.append(input,document.createTextNode(tag.label)); $("interests").append(label);
  }
  $("discover-form").addEventListener("submit",draw);
  $("discover-form").addEventListener("input",refresh);
  $("again").addEventListener("click",draw);
  $("connect-retry").addEventListener("click",connect);
  $("preview-button").addEventListener("click",startPreview);
  $("copy-result").addEventListener("click",async () => {
    if (!current) return;
    const {city,places,intro,days,origin} = current;
    const value = `${preview ? "【示例灵感】" : "【下一站去哪】"}${city.label}\n从${origin}出发，游玩 ${days} 天\n${intro}\n探索：${places.map(p=>p.name).join("、")}\n${$("city-map-link").href}`;
    try { await navigator.clipboard.writeText(value); $("draw-status").textContent = "旅行灵感已复制。"; }
    catch { $("draw-status").textContent = "浏览器未允许复制，请选中结果文字手动复制。"; }
  });
  connect();
})();
