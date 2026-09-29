(function (root) {
  "use strict";
  const engine = typeof module === "object" && module.exports ? require("./discover-engine.js") : root.TRAVEL_DISCOVER_ENGINE;
  const colors = ["#235e83", "#963d69", "#846017", "#246651", "#684b9b", "#ad4827", "#306d73"];
  function build(places, days, pace = "balanced") {
    if (!Number.isInteger(days) || days < 1 || days > 14) throw new Error("游玩天数应为 1—14 天。");
    const unique = new Map();
    places.filter(p=>engine.validCoord(p.coord)).forEach(p=>{
      const key = p.id || `${p.name}:${p.coord}`;
      if (!unique.has(key)) unique.set(key,p);
    });
    const sights = [...unique.values()].filter(p=>p.category === "sight");
    const foods = [...unique.values()].filter(p=>p.category === "food");
    const nearest = (list, point) => [...list].sort((a,b)=>engine.distance(a.coord,point.coord)-engine.distance(b.coord,point.coord))[0];
    const take = (list, item) => { list.splice(list.indexOf(item),1); return item; };
    const plan = [];
    for (let i=0;i<days;i++) {
      const stops = [], notes = [];
      const count = Math.min(pace === "relaxed" ? 1 : 2, Math.ceil(sights.length/(days-i)));
      if (count) {
        const first = take(sights,sights[0]); stops.push(first);
        if (count > 1) {
          const next = nearest(sights,first);
          if (next && engine.distance(first.coord,next.coord) <= 25) stops.push(take(sights,next));
          else notes.push("其他景点距离较远，本日只安排一个重点，避免跨区域赶场。");
        }
        const meal = nearest(foods,first);
        if (meal && engine.distance(first.coord,meal.coord) <= 8) stops.splice(1,0,take(foods,meal));
        else notes.push("附近暂无合适的已收录餐饮点，用餐请在游览区域自行选择。");
      } else notes.push("已收录景点不足，本日留作自由活动或返程，不重复凑行程。");
      const distance = stops.slice(1).reduce((sum,p,j)=>sum+engine.distance(stops[j].coord,p.coord),0);
      plan.push({day:i+1,color:colors[i%colors.length],stops,notes,distance});
    }
    return plan;
  }
  const api = {build};
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TRAVEL_DISCOVER_ITINERARY = api;
})(typeof window !== "undefined" ? window : globalThis);
