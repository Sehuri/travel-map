(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const data = window.TRAVEL_DISCOVER_DATA, engine = window.TRAVEL_DISCOVER_ENGINE;
  const endpoint = window.TRAVEL_DISCOVER_CONFIG?.endpoint || "";
  let cities = [], origins = [], preview = false, busy = false, map = null, current = null, mapRevision = 0;
  let itinerary = null;
  let batch = null, stage = "conditions", connecting = false, chosenIndex = 0;
  let exploreMode = "resources", selectedDay = 0, resourceCategory = "all", mapView = null;
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
  const conditionKey = () => JSON.stringify([...["origin","days","radius","month","budget","province","pace"].map(id=>$(id).value),$("exclude-visited").checked,interestValues(),preview]);
  const brief = opts => `${opts.origin.name}出发 · ${opts.days} 天${opts.month ? ` · ${opts.month} 月` : " · 月份不限"} · ${Number(opts.budgetMax) === Infinity ? "预算不限" : `预算 ¥${Number(opts.budgetMax).toLocaleString("zh-CN")} 内`}`;
  function feedback(message, error = false) {
    $("draw-status").textContent = message;
    $("draw-status").dataset.error = String(error);
  }
  function moveTo(element) {
    element.focus({preventScroll:true});
    element.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",block:"start"});
  }
  function setStage(next, focus = true) {
    stage = next;
    document.body.dataset.discoverStage=next;
    $("conditions-view").hidden = next !== "conditions";
    $("comparison").hidden = next !== "comparison";
    $("result").hidden = next !== "destination";
    $("copy-fallback").hidden = true;
    const steps = ["conditions","comparison","destination"];
    document.querySelectorAll("[data-step]").forEach(button=>{
      const active = button.dataset.step === next, li = button.closest("li");
      li.classList.toggle("complete",steps.indexOf(button.dataset.step) < steps.indexOf(next));
      if (active) li.setAttribute("aria-current","step"); else li.removeAttribute("aria-current");
      button.disabled = busy || (button.dataset.step === "comparison" && !batch) || (button.dataset.step === "destination" && !current);
    });
    refreshBatch();
    if (focus) {
      (next === "conditions" ? $("origin") : next === "comparison" ? $("comparison") : $("result")).focus({preventScroll:true});
      window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});
    }
  }
  function refreshBatch() {
    $("previous-results").hidden = !batch;
    if (!batch) return;
    const dirty = batch.key !== conditionKey();
    $("conditions-changed").textContent = dirty ? "条件已修改。上次候选仍基于旧条件，重新提交后才会更新。" : "已保留上次抽取结果，可以返回继续比较。";
    $("batch-summary").textContent = brief(batch.opts);
    $("batch-note").textContent = `${batch.preview ? "18 城示例 · " : ""}${dirty ? "旧条件结果 · 请修改条件后重新提交；以下仍为上次候选。" : `已准备好 ${batch.candidates.length} 个候选${batch.candidates.length < 3 ? "；符合条件的城市不足 3 个，没有自动放宽条件。" : "；选择一个展开资源。"}`}`;
    $("batch-tags").replaceChildren(...batch.interests.map(id=>text("span",data.tags[id].label)));
  }
  function setBusy(value, kind = "draw") {
    busy = value;
    for (const field of $("discover-form").elements) field.disabled = value;
    $("origin").disabled = value || connecting || !cities.length;
    $("draw").disabled = value || connecting || !cities.length;
    $("draw").textContent = value ? "正在准备候选…" : "给我 3 个候选";
    if(!value) { const arrow=text("span","","ui-icon icon-arrow");arrow.setAttribute("aria-hidden","true");$("draw").append(arrow); }
    $("discover-form").setAttribute("aria-busy",String(value));
    $("draw-status").setAttribute("aria-busy",String(value));
    $("compare-again").textContent=value ? (kind === "resources" ? "正在加载资源…" : "正在抽取…") : "换一组";
    $("again").textContent=value ? (kind === "resources" ? "正在加载资源…" : "正在抽取…") : "换一组，继续探索";
    document.querySelectorAll("[data-step],[data-edit-conditions],#compare-again,#again,#back-candidates,#restore-comparison,.choose-candidate").forEach(button=>{ button.disabled = value; });
    if (!value) { setStage(stage,false); refresh(); }
  }
  function validateFields(show = false) {
    const originError = origins.some(c=>c.label === $("origin").value) ? "" : "请从列表选择具有完整行政归属的出发地。";
    const days = Number($("days").value), daysError = Number.isInteger(days) && days >= 1 && days <= 14 ? "" : "游玩天数请填写 1—14 的整数。";
    for (const [id,error] of [["origin",originError],["days",daysError]]) {
      $(id).setCustomValidity(error);
      if (show || $(id).getAttribute("aria-invalid") === "true") {
        $(id).setAttribute("aria-invalid",String(Boolean(error)));
        $(`${id}-error`).textContent = error;
        $(`${id}-error`).hidden = !error;
      }
    }
    return originError || daysError;
  }
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
    validateFields();
    const excludedCount = $("exclude-visited").checked
      ? cities.filter(city => visitedNames.has(normalName(city.name))).length
      : 0;
    $("exclude-summary").textContent = $("exclude-visited").checked ? `当前排除 ${excludedCount} 座` : "当前不排除";
    try { $("candidate-status").textContent = `${getPool().length} 座城市符合距离、预算与省份条件${preview ? " · 示例范围" : " · 将为 3 个候选核验交通"}`; }
    catch { $("candidate-status").textContent = "请选择完整出发地与 1–14 天的游玩天数。"; }
    const opts = options();
    $("summary-main").textContent = `${opts.origin ? opts.origin.name + "出发" : "选择出发地"} · ${Number.isInteger(opts.days) && opts.days >= 1 && opts.days <= 14 ? opts.days + " 天" : "天数待确认"}`;
    $("summary-facts").replaceChildren(metric("出行月份",opts.month ? `${opts.month} 月出行` : "月份不限"),metric("探索范围",$("radius").selectedOptions[0].textContent),metric("人均预算",$("budget").selectedOptions[0].textContent),metric("旅行节奏",$("pace").selectedOptions[0].textContent));
    $("interest-count").textContent = `已选 ${interestValues().length}/3`;
    $("summary-tags").replaceChildren(...interestValues().map(id=>{
      const button = text("button",data.tags[id].label), icon = text("span","","ui-icon icon-close");
      icon.setAttribute("aria-hidden","true"); button.append(icon);button.type="button";button.disabled=busy;
      button.setAttribute("aria-label",`移除${data.tags[id].label}偏好`);
      button.onclick=()=>{ $("interests").querySelector(`input[value="${id}"]`).checked=false; refresh(); };
      return button;
    }));
    if (!interestValues().length) $("summary-tags").append(text("p","偏好不限，让城市随机出现。","small"));
    $("days-minus").disabled = busy || opts.days <= 1;
    $("days-plus").disabled = busy || opts.days >= 14;
    refreshBatch();
  }
  async function request(params, binary = false) {
    const url = new URL(endpoint);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "旅行资源服务暂时不可用，请稍后重试。"); }
    return binary ? response.blob() : response.json();
  }
  function fillCatalogue() {
    batch=null;current=null;itinerary=null;mapView=null;mapRevision++;
    if(map) { map.destroy ? map.destroy() : map.remove();map=null; }
    setStage("conditions",false);
    $("origin-list").replaceChildren(...origins.map(c => { const o = document.createElement("option"); o.value = c.label; return o; }));
    $("province").replaceChildren(new Option("全部省份", ""), ...[...new Set(cities.map(c => c.province))].sort().map(p => new Option(p, p)));
    $("origin").disabled = false; $("draw").disabled = false;
    if (!origins.some(c => c.label === $("origin").value)) $("origin").value = "";
    seen.clear(); signature = ""; refresh();
  }
  async function connect() {
    if (connecting || busy) return;
    connecting = true;
    $("draw").disabled = true; $("origin").disabled = true;
    $("connect-retry").hidden = true; $("preview-button").hidden = true;
    if (!endpoint) {
      $("connection-status").textContent = "全国推荐尚未启用：需要配置高德 Web 服务 Key，并部署旅行资源服务。";
      $("preview-button").hidden = false; connecting = false; return;
    }
    $("connection-status").textContent = "正在连接全国城市目录…";
    try {
      const response = await request({ action: "catalogue" });
      cities = response.cities.filter(c => typeof c.id === "string" && typeof c.label === "string" && engine.validCoord(c.coord));
      if (!cities.length) throw new Error("城市目录为空，请检查服务配置。");
      origins = cities; preview = false;
      $("connection-status").textContent = `城市目录已连接 · ${cities.length} 座城市 · 更新 ${response.updated}`;
      fillCatalogue();
    } catch (error) {
      $("connection-status").textContent = `全国目录未连接：${error.message}`;
      $("connect-retry").hidden = false; $("preview-button").hidden = false;
    } finally { connecting = false;$("origin").disabled=!cities.length;$("draw").disabled=!cities.length; }
  }
  function startPreview() {
    preview = true;
    cities = data.cities.map(c => ({ ...c, label: `${c.province} · ${c.name}` }));
    origins = [...cities, ...data.origins.filter(o => !cities.some(c => c.name === o.name)).map(c => ({ ...c, id: `origin-${c.name}`, label: `${c.name}（示例出发地）` }))];
    $("connection-status").textContent = `当前为 ${cities.length} 城示例体验，不是全国推荐。`;
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
      return { ...route, estimated: Boolean(route.estimated), note: route.source || "高德路线规划预计" };
    } catch {
      return { ...fallback, note: "路线接口暂不可用，已改用距离估算" };
    }
  }
  function metric(label, value, source = "") {
    const wrapper = document.createElement("div");
    wrapper.append(text("dt", label), text("dd", value));
    if (source) wrapper.lastChild.append(text("span",source,"route-source"));
    return wrapper;
  }
  function transportText(routes, type) {
    const route = routes?.[type];
    if (!route) return type === "rail" ? "暂无高铁方案" : "暂无驾车方案";
    return `${formatDuration(route.durationMinutes)}${(route.estimated ?? routes.estimated) ? " · 估算" : " · 预计"}`;
  }
  function routeSource(routes,type) {
    const route = routes?.[type];
    if (!route) return "接口未提供可用方案";
    return (route.estimated ?? routes.estimated) ? "按直线距离估算" : route.source || routes.source || "高德路线规划";
  }
  function transportSummary(candidates) {
    const sources = new Set(candidates.flatMap(c=>["rail","driving"].filter(type=>c.routes?.[type]).map(type=>routeSource(c.routes,type))));
    return `交通来源：${[...sources].join(" / ") || "暂无方案"}。各方式以具体标注为准，并非实际班次或已核验行程。`;
  }
  function renderComparison(candidates, opts, interests) {
    const grid = $("candidate-grid");
    grid.replaceChildren();
    candidates.forEach((candidate, index) => {
      const card = document.createElement("article");
      card.className = "candidate-card";
      const metrics = document.createElement("dl");
      metrics.className = "candidate-metrics";
      metrics.append(
        metric("直线距离", `${Math.round(candidate.distance)} km`),
        metric("高铁 / 动车", transportText(candidate.routes, "rail"),routeSource(candidate.routes,"rail")),
        metric("驾车", transportText(candidate.routes, "driving"),routeSource(candidate.routes,"driving")),
        metric("人均预算参考", formatBudget(candidate.budget))
      );
      metrics.lastChild.className = "budget-metric";
      const choose = text("button", "查看这个目的地", "choose-candidate"), arrow=text("span","","ui-icon icon-arrow");
      arrow.setAttribute("aria-hidden","true"); choose.append(arrow);
      choose.type = "button";
      choose.setAttribute("aria-label",`查看${candidate.name}目的地`);
      choose.addEventListener("click", () => { chosenIndex=index; selectCandidate(candidate, opts, interests); });
      card.append(
        text("p", `候选 ${String(index + 1).padStart(2, "0")}`, "candidate-index"),
        text("h3", candidate.name),
        text("p", candidate.label, "candidate-region"),
        text("span",`${opts.month ? `${opts.month} 月 · ` : ""}${candidate.season.label} · ${candidate.season.score}/5`,"season-badge"),
        metrics,
        text("p", candidate.season.note, "candidate-note"),
        choose
      );
      grid.append(card);
    });
    $("comparison-title").textContent = candidates.length === 3 ? "三个方向，哪一个让你心动？" : `${candidates.length} 个方向，看看有没有心动的？`;
    $("comparison-transport").textContent = transportSummary(candidates);
    setStage("comparison");
  }
  async function showMap(city, places, interests, routes = []) {
    mapView = {city,places,interests,routes};
    const revision = ++mapRevision;
    if (map) { map.destroy ? map.destroy() : map.remove(); map = null; }
    $("resource-map").replaceChildren(); $("map-status").textContent = "正在加载资源地图…"; $("retry-map").hidden = true;
    $("resource-map").setAttribute("aria-busy","true");
    try {
      if (!preview) {
        const AMap = await window.loadDiscoverAmap();
        if (revision !== mapRevision) return;
        map = new AMap.Map("resource-map", { center:city.coord, zoom:12, dragEnable:true, zoomEnable:true, scrollWheel:true, viewMode:"2D" });
        map.addControl(new AMap.ToolBar()); map.addControl(new AMap.Scale());
        const markers = places.filter(p=>engine.validCoord(p.coord)).map(p => {
          const pin = text("button", p.mapNumber, `resource-pin ${p.category}`);
          pin.type = "button"; pin.setAttribute("aria-label", p.name);
          pin.onclick = () => {
            const card = exploreMode === "itinerary" ? $("itinerary-days").querySelector(`[data-place-number="${p.mapNumber}"]`) : document.getElementById(`place-${p.mapNumber}`);
            if(card) moveTo(card);
          };
          return new AMap.Marker({ position:p.coord, content:pin, title:p.name, offset:new AMap.Pixel(-17,-17), map });
        });
        routes.filter(day=>day.stops.length>1).forEach(day=>{
          new AMap.Polyline({map, path:day.stops.map(p=>p.coord), strokeColor:day.color, strokeWeight:5, strokeOpacity:.85, strokeStyle:"dashed", showDir:true});
        });
        if (markers.length) map.setFitView(markers, false, [45,45,45,45], 14);
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
          layer.on("tileerror", () => { tileFailed = true; if (map === localMap) { $("map-status").textContent = "部分底图未加载，请使用外部城市地图查看。"; $("retry-map").hidden=false; } }).addTo(map);
        const bounds = [];
        places.filter(p=>engine.validCoord(p.coord)).forEach(p => { const coord = [p.coord[1],p.coord[0]]; bounds.push(coord); L.marker(coord,{icon:L.divIcon({className:`resource-pin ${p.category}`,html:p.mapNumber,iconSize:[30,30],iconAnchor:[15,15]})}).addTo(map).bindPopup(text("span",`${p.mapNumber}. ${p.name}`)); });
        routes.filter(day=>day.stops.length>1).forEach(day=>L.polyline(day.stops.map(p=>[p.coord[1],p.coord[0]]),{color:day.color,weight:4,dashArray:"8 6"}).addTo(map));
        if (bounds.length) map.fitBounds(bounds, { padding:[30,30], maxZoom:13 });
        else map.setView([city.coord[1],city.coord[0]],11);
        await tilesReady;
        if (revision !== mapRevision) return;
        if (tileFailed) { $("map-status").textContent = "部分底图未加载，请使用外部城市地图查看。"; $("retry-map").hidden=false; return; }
      }
      const missing = places.filter(p=>!engine.validCoord(p.coord)).length;
      $("map-status").textContent = missing ? `${missing} 个点位缺少有效坐标，保留文字介绍。` : places.length ? `已展示 ${places.length} 个点位；标记重叠时请放大地图或切换分类、日期。` : "本日暂无可定位点位，地图保留城市中心。";
    } catch (error) { if (revision === mapRevision) { $("map-status").textContent = `${error.message} 景点、美食列表与攻略仍可查看。`; $("retry-map").hidden=false; } }
    finally { if(revision === mapRevision) $("resource-map").setAttribute("aria-busy","false"); }
  }
  async function render(city, places, opts, interests) {
    $("result-action-status").textContent="";
    itinerary = null; $("itinerary-result").hidden = true;
    exploreMode="resources"; selectedDay=0; resourceCategory="all";
    document.querySelector(".itinerary-panel").classList.remove("has-itinerary");
    $("itinerary-title").textContent=`${opts.days} 天攻略草案`;
    $("itinerary-intro").textContent="把已收录景点与附近用餐候选，按天数和节奏就近组合。";
    $("browse-resources").hidden=true;
    $("itinerary-days").replaceChildren(); $("itinerary-tabs").replaceChildren();
    $("generate-itinerary").textContent = `一键生成 ${opts.days} 天攻略`;
    $("map-filters").querySelectorAll("button").forEach(button=>button.setAttribute("aria-pressed", String(button.dataset.mapCategory === "all")));
    places = places.map(p=>({...p,category:["food","sight"].includes(p.category) ? p.category : /餐饮|餐厅|美食|小吃/.test(`${p.type || ""} ${p.category || ""}`) ? "food" : "sight"}));
    places = ["sight","food"].flatMap(category=>places.filter(p=>p.category === category).slice(0,10)).map((p,i)=>({...p,mapNumber:String(i+1).padStart(2,"0")}));
    const curated = data.cities.find(c => c.province === city.province && normalName(c.name) === normalName(city.name));
    const intro = curated?.intro || `${city.label}。这次可从${places.slice(0,3).map(p=>p.name).join("、")}开始探索，按所在区域组合游览，避免在同一天跨城奔波。`;
    current = { city, places, intro, days:opts.days, pace:opts.pace, interests, origin:opts.origin.name, month:opts.month, routes:city.routes, budget:city.budget, preview, key:batch.key };
    setStage("destination",false);
    $("result-context").textContent=`${preview ? "18 城示例 · " : ""}${brief(opts)}`;
    $("result-region").textContent = city.label;
    $("result-title").textContent = city.name;
    $("result-distance").textContent = `直线距离约 ${Math.round(city.distance)} km · ${transportSummary([city])}`;
    $("trip-facts").replaceChildren(
      metric("直线距离",`${Math.round(city.distance)} km`),
      metric("高铁 / 动车", transportText(city.routes, "rail"),routeSource(city.routes,"rail")),
      metric("驾车", transportText(city.routes, "driving"),routeSource(city.routes,"driving")),
      metric("人均预算参考", formatBudget(city.budget)),
      metric(`${opts.month ? `${opts.month} 月` : "季节"}适宜度`, `${city.season.label} · ${city.season.score}/5`)
    );
    $("result-intro").textContent = intro;
    $("result-reason").textContent = `${preview ? "示例抽签" : "城市抽签"} · 从${opts.origin.name}出发 · ${opts.days} 天游玩${opts.month ? ` · ${opts.month} 月出行` : ""} · ${interests.length ? interests.map(t=>data.tags[t].label).join(" / ") : "偏好不限"}。${city.season.note}`;
    $("result-tip").textContent = `${curated?.tip || "以下为按类型检索的旅游资源线索，分类不等于实地品质评价。"} 本次列出 ${places.length} 个重点，并非覆盖 ${opts.days} 天的完整行程。`;
    $("city-map-link").href = mapLink(city);
    $("map-caption").textContent = preview ? "示例点位为近似位置，仅供浏览；实际入口请查看景区指引。" : "按住鼠标拖动地图，滚轮缩放 · 绿色为景点，橙色为美食 · 点击编号查看下方介绍。";
    $("places").replaceChildren(...["sight","food"].map(category => {
      const section = document.createElement("section"), entries = places.filter(p=>p.category === category);
      section.className = `resource-category ${category}`;
      section.append(text("h3",`${category === "food" ? "美食 · 寻味这座城" : "景点 · 探索这座城"}（${entries.length}）`));
      if (!entries.length) section.append(text("p",preview ? "示例资料暂未收录此类推荐。" : "暂未检索到此类点位，可在外部城市地图继续搜索。", "small"));
      const list = document.createElement("ol"); list.className = "place-grid";
      list.append(...entries.map(p => {
      const item = document.createElement("li");
      item.id = `place-${p.mapNumber}`; item.tabIndex = -1;
      item.append(text("span",p.mapNumber,"place-number"),text("h4",p.name),text("p",p.description || `${p.type || "旅游资源"}。位于${p.area || city.name}，可作为此次探索的一站。`),text("p",p.address || p.area || "地址请查看地图", "small"), link("在地图中查看 ↗",mapLink(city,p)));
      const source = data.sources[p.source]; if (source) item.append(link("官方介绍 ↗",source[1]));
      return item;
      }));
      section.append(list); return section;
    }));
    const visit = window.TRAVEL_DATA?.visits?.find(v => v.country === "中国" && normalName(v.name) === normalName(city.name));
    $("memory-link").hidden = !visit;
    if (visit) $("memory-link").href = `./index.html?city=${encodeURIComponent(visit.name)}`;
    updateWishlistButton();
    setStage("destination");
    showResources("all");
  }
  function setExploreMode(mode) {
    exploreMode=mode;
    $("view-resources").setAttribute("aria-pressed",String(mode === "resources"));
    $("view-itinerary").setAttribute("aria-pressed",String(mode === "itinerary"));
    $("map-filters").hidden=mode !== "resources";
    $("places").hidden=mode !== "resources";
    $("itinerary-result").hidden=mode !== "itinerary" || !itinerary;
    $("browse-resources").hidden=mode !== "itinerary";
    $("itinerary-intro").hidden=mode === "itinerary" && Boolean(itinerary);
    $("map-caption").hidden=mode === "itinerary";
  }
  function showResources(category = "all") {
    if(!current) return;
    resourceCategory=category;setExploreMode("resources");
    $("map-filters").querySelectorAll("button").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.mapCategory === category)));
    $("itinerary-tabs").querySelectorAll("button").forEach(button=>button.setAttribute("aria-pressed","false"));
    $("itinerary-status").textContent="地图已切回资源浏览，点击攻略日期可恢复每日路线。";
    const places=current.places.filter(p=>category === "all" || p.category === category);
    $("map-mode-label").textContent=`资源总览 · ${category === "all" ? "全部" : category === "sight" ? "景点" : "美食"} · ${places.length} 个点位`;
    showMap(current.city,places,current.interests);
  }
  function showItineraryDay(selected) {
    if (!itinerary || !current) return;
    const days = selected ? itinerary.filter(day=>day.day === selected) : itinerary;
    selectedDay=selected;setExploreMode("itinerary");
    $("map-mode-label").textContent=`正在查看：${selected ? `第 ${selected} 天` : "全部天数"} · ${days.reduce((sum,day)=>sum+day.stops.length,0)} 个点位`;
    $("itinerary-tabs").querySelectorAll("button").forEach(button=>button.setAttribute("aria-pressed",String(Number(button.dataset.day) === selected)));
    $("map-filters").querySelectorAll("button").forEach(button=>button.setAttribute("aria-pressed","false"));
    $("itinerary-days").replaceChildren(...days.map(day=>{
      const card = text("article","","itinerary-day"); card.style.setProperty("--day-color",day.color);
      card.append(text("h4",`第 ${day.day} 天 · ${day.stops.length ? "按顺序慢慢探索" : "自由安排"}`));
      const list = document.createElement("ol");
      day.stops.forEach(p=>{
        const item = text("li",""), copy=text("span",`${p.category === "food" ? "用餐候选" : "景点"} · `);
        item.tabIndex=-1;item.dataset.placeNumber=p.mapNumber;
        copy.append(link(p.name,mapLink(current.city,p)));
        item.append(text("span",p.mapNumber,`itinerary-stop-number ${p.category}`),copy); list.append(item);
      });
      card.append(list);
      if (day.stops.length>1) card.append(text("p",`点位间直线合计约 ${day.distance.toFixed(1)} 公里（非实际交通里程）。`,"small"));
      day.notes.forEach(note=>card.append(text("p",note,"small")));
      return card;
    }));
    $("itinerary-status").textContent = selected ? `正在查看第 ${selected} 天，地图仅显示当天点位与顺序连线。` : `共 ${itinerary.length} 天，不同颜色区分每日顺序；点击某一天可单独查看。`;
    showMap(current.city,days.flatMap(day=>day.stops),current.interests,days);
  }
  $("generate-itinerary").addEventListener("click",()=>{
    if (!current) return;
    itinerary = window.TRAVEL_DISCOVER_ITINERARY.build(current.places,current.days,current.pace);
    document.querySelector(".itinerary-panel").classList.add("has-itinerary");
    $("itinerary-result").hidden = false;
    $("itinerary-tabs").replaceChildren(...[...itinerary.map(day=>day.day),0].map(day=>{
      const button = text("button",day ? `第 ${day} 天` : "全部天数"); button.type="button"; button.dataset.day=day;
      button.onclick=()=>showItineraryDay(day); return button;
    }));
    $("generate-itinerary").textContent="重新生成攻略";
    showItineraryDay(0);
  });
  $("map-filters").addEventListener("click",event=>{
    const button=event.target.closest("button[data-map-category]"); if(!button || !current) return;
    showResources(button.dataset.mapCategory);
  });
  $("copy-itinerary").addEventListener("click",async()=>{
    if(!itinerary || !current) return;
    const value=`${current.city.name} · ${current.days} 天攻略草案\n`+itinerary.map(day=>`第 ${day.day} 天：${day.stops.map(p=>`${p.category === "food" ? "用餐候选" : "景点"} ${p.name}`).join(" → ") || "自由安排"}\n${day.notes.join(" ")}`).join("\n\n")+"\n按直线距离就近组合，非导航路线；请出发前核验交通、营业、预约和菜单。";
    await copyText(value,"每日攻略已复制。","itinerary-status");
  });
  async function copyText(value,message,statusId="draw-status") {
    try { await navigator.clipboard.writeText(value); $(statusId).textContent=message; $("copy-fallback").hidden=true; }
    catch {
      $(statusId).textContent="浏览器未允许复制，已展开可手动复制的文字。";
      $("copy-fallback").hidden=false; $("copy-text").value=value;moveTo($("copy-text"));$("copy-text").select();
    }
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
    $("save-wishlist").textContent = saved ? "已保存到愿望清单" : "保存到愿望清单";
  }
  function saveCurrentWishlist() {
    if (!current) return;
    const saved = savedWishlist();
    const cityName = normalName(current.city.name);
    if (builtInWishlistNames.has(cityName) || saved.some(item => normalName(item.mapLabel || item.name.split(" · ").at(-1)) === cityName)) {
      updateWishlistButton();
      $("result-action-status").textContent = `${current.city.name}已经在这台设备的愿望清单中。`;
      return;
    }
    const plannedTime = `${current.month ? `${current.month} 月 · ` : ""}${current.days} 天`;
    saved.push({
      name: current.city.label || current.city.name,
      icon: "签",
      desc: `随机旅行候选 · 从${current.origin}出发 · 人均参考 ${formatBudget(current.budget)}`,
      guide: `${current.intro} 建议安排 ${current.days} 天。${current.city.season.note} 交通时间与预算请在出发前再次核对。`,
      plannedTime,
      priorityLevel: 1,
      country: "中国",
      coord: current.city.coord,
      coordinateSystem: current.preview ? "WGS84" : "GCJ-02",
      mapLabel: current.city.name,
      savedAt: new Date().toISOString()
    });
    try {
      localStorage.setItem(wishlistStorageKey, JSON.stringify(saved));
      updateWishlistButton();
      $("result-action-status").textContent = `已把${current.city.name}保存到这台设备的愿望清单；返回旅行地图即可查看。`;
    } catch {
      $("result-action-status").textContent = "浏览器未允许本地保存，请复制旅行灵感后手动记录。";
    }
  }
  async function selectCandidate(candidate, opts, interests) {
    if (busy) return;
    if(current?.city.id === candidate.id && current.key === batch.key) {
      setStage("destination");
      if(exploreMode === "itinerary") showItineraryDay(selectedDay);else showResources(resourceCategory);
      return;
    }
    setBusy(true,"resources");
    const entry=$("candidate-grid").querySelectorAll(".choose-candidate")[chosenIndex];
    if(entry) entry.firstChild.textContent="正在加载资源…";
    feedback(`正在展开${candidate.name}的旅游资源…`);
    $("save-wishlist").disabled = true;
    $("candidate-grid").querySelectorAll("button").forEach(button => { button.disabled = true; });
    try {
      let places;
      if (preview) places = candidate.places;
      else {
        const sights = interests.filter(value=>value !== "food");
        places = (await request({ action:"places", city:candidate.id, interests:(sights.length ? sights : ["nature","culture"]).join(",") })).places;
        // Older deployed functions return ten ungrouped POIs. Request food separately
        // until the grouped endpoint is deployed; never require a synchronized rollout.
        if (!places.length || !places.every(p=>["sight","food"].includes(p.category))) {
          const food = (await request({ action:"places", city:candidate.id, interests:"food" })).places;
          const unique = new Map();
          [...places,...food].forEach(p=>unique.set(p.id || `${p.name}:${p.coord}`,p));
          places = [...unique.values()];
        }
      }
      if (!places.length) throw new Error(`${candidate.name}暂未检索到匹配资源，请从另外两个候选中选择。`);
      feedback("");
      await render(candidate, places, opts, interests);
    } catch (error) {
      feedback(`${error.message} 可以重试这个目的地，或选择其他候选。`,true);
    } finally {
      if(entry) entry.firstChild.textContent="查看这个目的地";
      setBusy(false);
      updateWishlistButton();
    }
  }
  async function draw(event) {
    event?.preventDefault(); if (busy) return;
    const validationError=validateFields(true);
    if(validationError) { setStage("conditions");feedback(validationError,true);$("discover-form").reportValidity();return; }
    if (!$("discover-form").reportValidity()) return;
    try {
      const opts = options(), interests = interestValues();
      if (interests.length > 3) throw new Error("每次最多选择 3 项喜好，或全部取消让城市随机出现。");
      const pool = getPool();
      if (!pool.length) throw new Error("当前范围没有候选城市，请扩大距离或更换省份；没有自动放宽你的条件。");
      const nextSignature = JSON.stringify([opts,interests,preview]);
      if (signature !== nextSignature) { seen.clear(); signature = nextSignature; }
      setBusy(true);
      const selected = engine.drawMany(pool, seen, 3);
      if (!selected.length) throw new Error("当前没有可用候选城市，请调整条件后重试。");
      feedback(`正在比较 ${selected.map(city => city.name).join("、")} 的交通与预算…`);
      const candidates = await Promise.all(selected.map(async city => {
        const routes = await routeFor(city, opts);
        return { ...city, routes, budget: engine.estimateBudget(city.distance, opts.days, routes) };
      }));
      batch={candidates,opts,interests,preview,key:conditionKey()};
      current=null;itinerary=null;
      if(map) { map.destroy ? map.destroy() : map.remove();map=null; } mapRevision++;mapView=null;
      feedback("");
      renderComparison(candidates, opts, interests);
    } catch (error) { feedback(error.message,true); }
    finally { setBusy(false); }
  }
  for (const [id,tag] of Object.entries(data.tags)) {
    const label = text("label","","interest-chip"), input = document.createElement("input"); input.type = "checkbox"; input.value = id;
    label.append(input,document.createTextNode(tag.label)); $("interest-options").append(label);
  }
  $("discover-form").addEventListener("submit",draw);
  $("discover-form").addEventListener("input",event=>{
    if(event.target.matches("#interests input") && interestValues().length > 3) {
      event.target.checked=false; $("interest-status").textContent="最多选择 3 项，已有选择保持不变。";
    } else $("interest-status").textContent="";
    refresh();
  });
  $("discover-form").addEventListener("invalid",()=>validateFields(true),true);
  for(const [id,delta] of [["days-minus",-1],["days-plus",1]]) $(id).onclick=()=>{
    $("days").value=String(Math.max(1,Math.min(14,(Number($("days").value)||1)+delta)));refresh();
  };
  const backToComparison=()=>{
    if(!batch || busy) return;
    feedback(batch.key !== conditionKey() ? "当前显示旧条件的候选，重新提交后才会更新。" : "已恢复同一批候选，没有重新抽取。");
    setStage("comparison",false);moveTo($("candidate-grid").querySelectorAll(".choose-candidate")[chosenIndex] || $("comparison"));
  };
  document.querySelectorAll("[data-edit-conditions]").forEach(button=>button.onclick=()=>{ if(!busy) { feedback("");setStage("conditions"); } });
  $("back-candidates").onclick=backToComparison;$("restore-comparison").onclick=backToComparison;
  document.querySelectorAll("[data-step]").forEach(button=>button.onclick=()=>{
    if(busy) return;
    if(button.dataset.step === "comparison") backToComparison();
    else if(button.dataset.step === "conditions") { feedback("");setStage("conditions"); }
    else if(current) { setStage("destination");if(exploreMode === "itinerary") showItineraryDay(selectedDay);else showResources(resourceCategory); }
  });
  $("view-resources").onclick=()=>showResources(resourceCategory);
  $("browse-resources").onclick=()=>showResources("all");
  $("view-itinerary").onclick=()=>{
    if(itinerary) showItineraryDay(selectedDay);
    else { setExploreMode("resources");$("itinerary-intro").textContent="先点击下方按钮生成攻略草案，再按日期查看地图。";moveTo($("generate-itinerary")); }
  };
  $("retry-map").onclick=()=>{ if(mapView) showMap(mapView.city,mapView.places,mapView.interests,mapView.routes); };
  $("close-copy").onclick=()=>{ $("copy-fallback").hidden=true; };
  $("discover-menu").addEventListener("toggle",event=>$("discover-menu-toggle").setAttribute("aria-expanded",String(event.newState === "open")));
  $("again").addEventListener("click",draw);
  $("compare-again").addEventListener("click",draw);
  $("save-wishlist").addEventListener("click",saveCurrentWishlist);
  $("connect-retry").addEventListener("click",connect);
  $("preview-button").addEventListener("click",startPreview);
  $("copy-result").addEventListener("click",async () => {
    if (!current) return;
    const {city,places,intro,days,origin,routes,budget,month} = current;
    const value = `${preview ? "【示例灵感】" : "【下一站去哪】"}${city.label}\n从${origin}出发，游玩 ${days} 天${month ? `，${month} 月出行` : ""}\n高铁/动车：${transportText(routes,"rail")}；驾车：${transportText(routes,"driving")}；人均预算参考：${formatBudget(budget)}\n${intro}\n探索：${places.map(p=>p.name).join("、")}\n${$("city-map-link").href}`;
    await copyText(value,"旅行灵感已复制。","result-action-status");
  });
  $("month").value = String(new Date().getMonth() + 1);
  if(matchMedia("(max-width:599px)").matches) document.querySelector(".more-conditions").open=false;
  refresh();
  connect();
})();
