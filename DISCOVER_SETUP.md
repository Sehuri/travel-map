# 随机旅行：全国城市服务配置

## 当前状态与范围

入口是 `discover.html`。2026-09-06 已通过 Dashboard 部署 `travel-discover`，额度保护 SQL 已执行成功，高德密钥已由站主保存到服务端，并已关闭该函数的 JWT 校验。`assets/discover-config.js` 已连接公开只读接口；连接异常时仍可主动选择 18 城示例体验，但不能把示例当成全国覆盖。

全国模式读取高德行政区目录，收录直辖市、名称以“市”结尾的地级市和县级市，以及港澳；普通区、县、街道不作为“城市”加入。行政编码作为唯一标识，结果显示省份、所属地级行政区、城市名。高德不提供台湾详细区划，因此台湾城市暂未覆盖；页面不宣称完整覆盖中国所有城市。后续应接入额外行政区来源并核验，不能把台湾省本身当成一座城市。

## 1. 申请高德 Key

打开 https://console.amap.com/ → 应用管理 → 我的应用 → 创建新应用（如 `Sehuri travel-map`）→ 添加 Key → 服务平台选择 **Web 服务**。

这是服务端使用的 Key，不是 Web 端（JS API）Key。不要放进网页、GitHub 仓库、截图或聊天公开内容。确认账户具有行政区域查询、POI 2.0 搜索、静态地图的权限与调用额度；不要假定所有高级服务都免费。

官方说明：https://lbs.amap.com/api/webservice/guide/create-project/get-key

## 2. 配置调用额度保护

在当前 Supabase 项目的 SQL Editor 新建查询，完整运行 `supabase/discover_quota.sql`。脚本只添加调用预算表和函数，不修改既有城市、照片或评分。

默认每天（北京时间）最多 500 次高德上游调用，由数据库原子计数，跨多个服务实例也生效。目录、景点和地图都有短期缓存，缓存命中不消耗上游预算。额度用完返回明确提示，不继续消耗高德配额。可按账户实际免费/付费额度，把 SQL 的 500 调低后重新运行函数定义。

这是公开只读服务，不要求游客登录。CORS 仅是浏览器来源限制，不是身份验证；攻击者仍可能耗尽这 500 次预算。若公开访问量增加，应补充验证码/网关按访客限流；预算也不限制 Supabase 自身请求量。不要将本服务改成任意 URL/任意类型的高德代理。

## 3. 保存服务端密钥

Supabase → Edge Functions → Secrets，新增：

- `AMAP_WEB_KEY`：高德 Web 服务 Key。
- `DISCOVER_ALLOWED_ORIGINS`（可选）：默认允许 `https://sehuri.github.io,http://127.0.0.1:4173,http://localhost:4173`。这里填来源，不填路径。更换预览端口需增加对应来源。

`SUPABASE_URL` 与 `SUPABASE_SERVICE_ROLE_KEY` 使用 Supabase Edge Functions 提供的环境变量；不要复制到前端。

## 4. 部署服务

使用 Supabase CLI 登录后，在本项目目录运行：

```sh
supabase functions deploy travel-discover --project-ref dbmuozbkzkxgigblsgmz --no-verify-jwt
```

部署会打包 `supabase/functions/travel-discover/index.ts` 以及其引用的 `assets/discover-engine.js`。不要只把 index.ts 单独粘贴进 Dashboard，否则会缺少引用文件。项目的 `supabase/config.toml` 仅关闭此公开函数的 JWT 验证，不影响站主管理登录或数据库 RLS。

也可使用 Dashboard：先运行 `node scripts/build-discover-dashboard.cjs`，把生成的 `supabase/travel-discover-dashboard.ts` 完整复制到新函数的 `index.ts`，函数名填 `travel-discover`。部署后进入该函数的 Settings，将 **Verify JWT with legacy secret** 关闭并保存（仅此函数）。Dashboard 不会自动读取本地 `config.toml`。生成文件不包含密钥；每次修改源代码后应重新生成，不直接编辑生成文件。

官方部署说明：https://supabase.com/docs/guides/functions/deploy

## 5. 启用并验收

部署成功后，将 `assets/discover-config.js` 中 endpoint 设置为：

```text
https://dbmuozbkzkxgigblsgmz.supabase.co/functions/v1/travel-discover
```

2026-09-06 真实验收结果：全国目录返回 719 座城市；昆山市正确显示为“江苏省 · 苏州市 · 昆山市”，景点查询返回 10 个昆山市内地点，静态地图成功返回 900×450 PNG。目录来源当前仍缺少台湾城市，不能宣称覆盖台湾全部城市。

通过本地 HTTP 服务打开网站（不是 file://），验证：

1. 全国目录连接成功并显示实际城市数量，能选择“江苏省 · 苏州市 · 昆山市”等县级市。
2. 选出发地、天数、距离、省份，抽出的城市符合限制；无候选时不偷偷扩大范围。
3. 多选喜好为“任一匹配”；每轮最多检索 3 座随机城市，找不到资源会说明本轮失败，而不是说全国没有结果。
4. 景点与静态地图编号一致；高德 POI 的 GCJ-02 坐标直接用于高德地图，不混用到 WGS84 底图。
5. 模拟 Key 缺失、配额用完、网络错误，显示明确提示且保留现有网站功能。
6. 验证完成再提交并推送 GitHub。GitHub Pages 只发布静态前端，不会自动部署 Supabase 函数。

## 推荐规则和信息边界

- 城市随机池不依赖站主旅行记录，也不局限热门城市；不限距离且不选喜好时，每座目录城市都有同等初始抽取机会。
- 天数对应默认直线半径：1—2 天 350km、3—4 天 800km、5—7 天 1600km、8 天起不限；用户可显式覆盖。不是路程、票价或车程预测。
- 旅游偏好使用预设类别/关键词查询，不是 AI 对每座城市做出的旅游品质评分；自然、海滨等标签只能作探索线索。查询无结果不等于城市没有旅游价值。
- 一组条件下抽过的城市先不重复，池子耗尽后开始新一轮；改条件重置。普通县区不进入城市池。
- 慢节奏每天最多列出 1 个重点，适中每天最多 2 个，总数最多 10；这是待选资源，不是自动排好的逐日交通行程。
- 18 座常见城市有原创简短介绍与官方来源链接；其他城市根据地点类别与行政归属给出概览，不编造历史、开放时间、门票或景点品质。
- 地图是保留高德署名的资源分布静态图，可通过链接打开互动地图；第十个点用字母 A 标记。

## 本地自动测试

Node.js 22.13+：

```sh
node --test tests/discover.test.cjs
```

包含目录层级、县级市、距离过滤、不重复抽签、上游代理参数限制、缓存、Key 缺失、预算上限等测试。服务端测试使用模拟响应，不消耗真实 Key，不代表已经通过真实高德联调。
