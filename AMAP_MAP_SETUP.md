# 首页中国地图：高德 JS API 配置

## 架构

- “世界”标签继续使用 Leaflet + CARTO，保留海外足迹。
- “中国”标签使用高德地图 JS API 2.0，仅展示中国到访城市。
- `assets/data.js` 中的坐标仍保留通用 WGS-84；进入高德地图前由 `assets/map-engine.js` 转换为 GCJ-02，不污染世界地图坐标。
- 高德 JS API Key 会出现在浏览器请求中，这是 JS API 的正常用法；`securityJsCode` 只保存在 Supabase，不进入 GitHub。
- 如果高德配置缺失、超时或报错，中国标签自动显示原 Leaflet 备用底图。

现有 `AMAP_WEB_KEY` 是随机旅行服务使用的“Web 服务”Key，不能用于交互地图，也不要移动或复制到前端配置。

## 1. 新建 Web端（JS API）Key

在高德开放平台同一个应用中新增 Key：

- Key 名称：`旅游地图-首页交互地图`
- 服务平台：`Web端（JS API）`

创建后会得到普通 Key 和 `securityJsCode`。二者不要和现有 Web 服务 Key 混用。

## 2. 保存安全密钥

Supabase → Edge Functions → Secrets，新增：

- 名称：`AMAP_JS_SECURITY_CODE`
- 值：新 Key 对应的 `securityJsCode`

不要把该值写进 `assets/amap-map-config.js`、聊天截图或 GitHub。

## 3. 部署安全代理

部署公开只读函数 `amap-js-proxy`：

```sh
supabase functions deploy amap-js-proxy --project-ref dbmuozbkzkxgigblsgmz --no-verify-jwt
```

也可在 Dashboard 新建同名函数，将 `supabase/functions/amap-js-proxy/index.ts` 完整复制为 `index.ts`，部署后在 Settings 关闭该函数的 JWT 校验。

代理只允许本站和本地预览来源，仅转发高德地图样式、行政区及坐标转换固定路径，不是任意网址代理。虽然无法阻止伪造 Origin 的非浏览器请求，但不会返回 `securityJsCode`，也不会开放站主管理或旅行数据库权限。

## 4. 填写公开 JS API Key

把新建的普通 JS API Key 填入 `assets/amap-map-config.js`：

```js
window.AMAP_MAP_CONFIG = {
  jsApiKey: "这里填写 Web端（JS API）Key",
  serviceHost: `${window.location.origin}/_AMapService`,
  proxyTarget: "https://dbmuozbkzkxgigblsgmz.supabase.co/functions/v1/amap-js-proxy/_AMapService"
};
```

这里只能填写 Web端（JS API）Key，不能填写 `securityJsCode`、Web 服务 Key 或 Supabase secret/service_role key。

高德要求 `/_AMapService` 是代理域名的一级路由，而 Supabase Edge Functions 固定带有 `/functions/v1/函数名/` 前缀。首页因此安装了一个仅匹配 `/_AMapService/` 的请求桥接，在请求发出前把它改写到 `proxyTarget`；其他网络请求不受影响，安全码仍只在 Supabase 代理中追加。

## 5. 验收

1. 世界标签仍能显示中国和日本的全部足迹。
2. 中国标签显示高德署名和国内底图，只显示中国城市。
3. 南京、北京、三亚等标记位置无明显偏移。
4. 点击标记仍会打开城市详情并更新 `?city=` 链接。
5. 临时填错 Key 或停止代理时，中国标签显示备用地图和错误提示，世界标签不受影响。

高德官方说明：

- https://lbs.amap.com/api/javascript-api-v2/prerequisites
- https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode
- https://lbs.amap.com/api/javascript-api-v2/guide/map/world-map
