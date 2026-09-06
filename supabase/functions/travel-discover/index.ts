// Deploy as a public function (JWT verification off); provider access is constrained
// to catalogue/POI/static-map requests with a persistent, atomic 500-call/day budget.
import "../../../assets/discover-engine.js";
const engine = (globalThis as any).TRAVEL_DISCOVER_ENGINE;
const allowed = (Deno.env.get("DISCOVER_ALLOWED_ORIGINS") || "https://sehuri.github.io,http://127.0.0.1:4173,http://localhost:4173").split(",").map(s=>s.trim());
const keywords: Record<string, Record<string,string>> = {
  nature:{types:"110000",keywords:"风景"}, culture:{types:"110200|140100"}, food:{types:"050000",keywords:"特色"},
  city:{types:"110000",keywords:"公园"}, coast:{types:"110000",keywords:"海滨"},
  family:{types:"110000|080000",keywords:"亲子"}, hiking:{types:"110000",keywords:"山"}
};
const cache = new Map<string,{until:number,value:any}>();
const pending = new Map<string,Promise<any>>();
async function cached(key:string, ttl:number, load:()=>Promise<any>) {
  const hit = cache.get(key); if (hit && hit.until > Date.now()) return hit.value;
  if (pending.has(key)) return pending.get(key);
  const job = load().then(value => {
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key,{until:Date.now()+ttl,value}); return value;
  }).finally(()=>pending.delete(key));
  pending.set(key,job); return job;
}
class PublicError extends Error { constructor(message:string,public status=503){super(message);} }
async function consumeBudget() {
  const url = Deno.env.get("SUPABASE_URL"), secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) throw new PublicError("服务端环境尚未配置完成。");
  const response = await fetch(`${url}/rest/v1/rpc/consume_travel_api_budget`, { method:"POST",headers:{apikey:secret,Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(8000) });
  if (!response.ok) throw new PublicError("调用额度保护尚未就绪，请先运行 discover_quota.sql。");
  if (await response.json() !== true) throw new PublicError("今日旅行资源查询已达站点上限，请明天再试。",429);
}
async function amap(path:string,params:Record<string,string>, image=false) {
  const key = Deno.env.get("AMAP_WEB_KEY");
  if (!key) throw new PublicError("尚未配置高德 Web 服务 Key。");
  await consumeBudget();
  const query = new URLSearchParams({...params,key});
  const response = await fetch(`https://restapi.amap.com/${path}?${query}`,{signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new PublicError("高德服务暂时不可用，请稍后重试。");
  if (image && response.headers.get("content-type")?.startsWith("image/")) return response.blob();
  const data = await response.json();
  if (data.status !== "1" || image) throw new PublicError(`高德请求未成功（${String(data.infocode || "unknown").replace(/[^0-9a-z]/gi,"").slice(0,20)}），请检查 Key 权限与配额。`);
  return data;
}
async function catalogue() {
  return cached("catalogue",86400000,async()=>{
    const tree = await amap("v3/config/district",{keywords:"中国",subdistrict:"3",extensions:"base"});
    const cities = engine.flattenDistricts(tree.districts);
    if (cities.length < 300) throw new PublicError("城市目录返回不完整，已停止推荐，请稍后重试。");
    return {cities,updated:new Date().toISOString().slice(0,10),coordinateSystem:"GCJ-02",coverage:"高德城市目录（含县级市及港澳；台湾城市暂缺）"};
  });
}
async function places(city:any, interests:string[]) {
  return cached(`places:${city.id}:${interests.join(",")}`,3600000,async()=>{
    const queries = interests.length ? interests.map(i=>keywords[i]) : [{types:"110000"}];
    const results = [];
    for (const query of queries) {
      const result = await amap("v5/place/text",{...query,region:city.id,city_limit:"true",page_size:"25",page_num:"1"});
      results.push(result.pois || []);
    }
    const unique = new Map();
    // Round-robin prevents the first selected interest from crowding out the others.
    for(let i=0;i<25;i++) for(const list of results) {
      const p = list[i]; if (!p || typeof p.name !== "string" || typeof p.location !== "string") continue;
      const coord = p.location.split(",").map(Number);
      if (!engine.validCoord(coord)) continue;
      // The API accepts district adcodes, but verify county-city boundaries ourselves too.
      if ((city.level === "district" || !city.id.endsWith("00")) && p.adcode !== city.id) continue;
      const scalar = (v:unknown) => typeof v === "string" ? v : "";
      unique.set(p.id,{id:p.id,name:p.name,coord,type:scalar(p.type).replaceAll(";"," · "),area:scalar(p.adname),address:scalar(p.address)});
    }
    return {places:[...unique.values()].slice(0,10),source:"高德地点搜索",retrievedAt:new Date().toISOString()};
  });
}
Deno.serve(async req=>{
  const origin = req.headers.get("origin") || "";
  const headers:Record<string,string> = {"Vary":"Origin","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
  if (allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  const json = (body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8"}});
  if (!allowed.includes(origin)) return json({error:"此来源尚未获准访问旅行资源服务。"},403);
  if (req.method === "OPTIONS") return new Response(null,{status:204,headers:{...headers,"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"content-type"}});
  if (req.method !== "GET") return json({error:"仅支持读取旅行资源。"},405);
  try {
    const url = new URL(req.url), action = url.searchParams.get("action");
    if (!["catalogue","places","map"].includes(action || "")) return json({error:"无效操作。"},400);
    if (action === "catalogue") return json(await catalogue());
    const id = url.searchParams.get("city") || "";
    const interests = [...new Set((url.searchParams.get("interests") || "").split(",").filter(Boolean))].sort();
    if (!/^\d{6}$/.test(id) || interests.length > 3 || interests.some(i=>!Object.hasOwn(keywords,i))) return json({error:"城市或旅行喜好参数无效。"},400);
    const limit = Number(url.searchParams.get("limit") || 10);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) return json({error:"地图标记数量无效。"},400);
    const city = (await catalogue()).cities.find((c:any)=>c.id === id);
    if (!city) return json({error:"该城市不在当前目录中。"},404);
    const result = await places(city,interests);
    if (action === "places") return json(result);
    if (!result.places.length) return json({error:"暂无可定位的景点。"},404);
    const image = await cached(`map:${id}:${interests.join(",")}:${limit}`,3600000,()=>amap("v3/staticmap",{size:"900*450",markers:result.places.slice(0,limit).map((p:any,i:number)=>`mid,0x226B56,${i+1 === 10 ? "A" : i+1}:${p.coord.map((n:number)=>n.toFixed(6)).join(",")}`).join("|")},true));
    return new Response(image,{headers:{...headers,"Content-Type":image.type}});
  } catch(error) {
    if (error instanceof PublicError) return json({error:error.message},error.status);
    return json({error:"资源查询超时或异常，请稍后重试。"},503);
  }
});
