const allowedOrigins = (Deno.env.get("DISCOVER_ALLOWED_ORIGINS") || "https://sehuri.github.io,http://127.0.0.1:4173,http://localhost:4173")
  .split(",").map(value => value.trim()).filter(Boolean);

const restPaths = new Set([
  "v3/config/district",
  "v3/assistant/coordinate/convert"
]);

Deno.serve(async request => {
  const origin = request.headers.get("origin") || "";
  const cors: Record<string, string> = {
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff"
  };
  if (allowedOrigins.includes(origin)) cors["Access-Control-Allow-Origin"] = origin;
  const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

  if (!allowedOrigins.includes(origin)) return json({ error: "Origin is not allowed." }, 403);
  if (request.method === "OPTIONS") return new Response(null, {
    status: 204,
    headers: { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "content-type" }
  });
  if (request.method !== "GET") return json({ error: "Read-only proxy." }, 405);

  const jscode = Deno.env.get("AMAP_JS_SECURITY_CODE");
  if (!jscode) return json({ error: "Map security configuration is incomplete." }, 503);

  const url = new URL(request.url);
  const marker = "/_AMapService/";
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex < 0 || url.search.length > 2000) return json({ error: "Invalid map request." }, 400);
  const path = url.pathname.slice(markerIndex + marker.length).replace(/^\/+/, "");
  const isStyle = path === "v4/map/styles";
  if (!isStyle && !restPaths.has(path)) return json({ error: "Unsupported map request." }, 403);

  const target = new URL(isStyle ? `https://webapi.amap.com/${path}` : `https://restapi.amap.com/${path}`);
  url.searchParams.delete("jscode");
  url.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  target.searchParams.set("jscode", jscode);

  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(12000) });
    const headers = new Headers(cors);
    ["content-type", "cache-control", "etag", "last-modified"].forEach(name => {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    });
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return json({ error: "Map service is temporarily unavailable." }, 503);
  }
});
