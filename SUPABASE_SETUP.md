# Supabase 配置

## 景点评等级

在现有项目的 SQL Editor 中运行一次 [supabase/attraction_ratings.sql](./supabase/attraction_ratings.sql)，无需修改原有城市评分表。保持 Anonymous Sign-Ins 开启（与城市评分共用匿名浏览器身份）。

- 新建景点目录、景点投票、公开聚合计数三个表；只公开人数和等级汇总，访客只能读取自己的具体选票。
- 每个匿名用户／正式用户对每个景点仅可 INSERT 一次，复合主键防重复；不授予访客 UPDATE 或 DELETE 权限。
- 自动计数触发器使用原子更新，重复提交不会增加人数。删除用户时其选票级联删除，对应计数同步减一。
- 目录源文件为 `assets/attraction-data.js`；执行 `node scripts/build-attraction-sql.cjs` 同步生成初始化 SQL 与迁移文件。重复运行初始化只更新目录元数据，不清空选票。
- 景点 ID 由国家、城市、名称构成；已上线景点更名时务必保留原 ID，避免丢失投票关联。目录为名称索引，不提供实时营业、票价或官方景区等级承诺。
- 未运行初始化或服务连接失败时，页面允许浏览目录但禁用投票，投票占比显示“待连接”，不会误显示为零票。

网站的城市资料和公众评分使用 Supabase 保存。前端只使用可公开的 Publishable Key；不要把 `service_role` 密钥写入仓库。

## 1. 创建项目并运行数据库脚本

1. 在 Supabase 创建一个项目。
2. 打开 SQL Editor。
3. 打开 [`supabase/schema.sql`](./supabase/schema.sql)。
4. 把脚本中的 `YOUR_OWNER_EMAIL@example.com` 换成站主登录邮箱。
5. 执行完整脚本。

脚本会创建：

- `city_details`：站主填写的地点、食物与旅行天数。
- `city_ratings`：每位匿名或正式用户自己的评分。
- `city_rating_summary`：可公开读取的平均分与评分人数。
- RLS 安全策略：访客只能修改自己的评分，只有预设邮箱可以编辑城市资料。

## 2. 配置登录

在 Supabase Dashboard 的 Authentication 设置中：

1. 启用 Anonymous Sign-Ins。
2. 保持 Email 登录开启，以便站主接收 Magic Link。
3. 将 Site URL 设置为 `https://sehuri.github.io/travel-map/`。
4. 在 Redirect URLs 中加入：
   - `https://sehuri.github.io/travel-map/**`
   - 本地测试时可加入 `http://127.0.0.1:4173/**`

## 3. 填写前端连接信息

打开 [`assets/supabase-config.js`](./assets/supabase-config.js)，填写项目设置中显示的 Project URL 和 Publishable Key：

```js
window.SUPABASE_CONFIG = {
  url: "https://你的项目.supabase.co",
  publishableKey: "sb_publishable_..."
};
```

Publishable Key 设计上可以出现在浏览器代码中，真正的权限由 `schema.sql` 中的 RLS 策略保护。

## 4. 使用

- 访客打开城市详情即可匿名评分，每个浏览器每座城市一票，可以修改。
- 点击“站主编辑”，输入脚本中预设的邮箱，通过邮件链接登录。
- 登录成功后可以填写最喜欢的地点、吃过的食物和适合旅行天数。

匿名身份保存在浏览器中。清除浏览器数据或更换设备后会生成新的匿名身份，因此这是一种低摩擦的一票机制，不等同于严格实名投票；如需更强的防刷能力，可继续接入 CAPTCHA 或要求访客登录。

## 5. 启用站主管理后台

已有资料和评分功能的项目，再执行一次 [`supabase/admin_backend.sql`](./supabase/admin_backend.sql)：

1. 打开 Supabase Dashboard 的 SQL Editor。
2. 新建查询，粘贴 `supabase/admin_backend.sql` 的完整内容。
3. 点击 Run，看到 `Success. No rows returned` 即表示完成。
4. 打开 [`admin.html`](./admin.html)，或在线访问 `https://sehuri.github.io/travel-map/admin.html`。
5. 使用 `schema.sql` 中设置的站主邮箱接收登录链接。

管理后台新增：

- 城市资料覆盖和新增城市
- 愿望清单编辑、排序和隐藏
- 为愿望目的地设置计划去的时间
- 为愿望目的地设置“最想去 / 很想去 / 有机会去”三级想去程度
- 照片上传、排序、删除与城市封面
- 异常评分查看和删除

新表保存的是“后台覆盖版本”。没有在后台修改过的城市和愿望目的地仍从 `assets/data.js` 读取；Supabase 暂时不可用时，公开网站也会自动退回代码中的资料。

如果管理后台在此前已经启用，只需在 SQL Editor 运行一次 [`supabase/wishlist_planned_time.sql`](./supabase/wishlist_planned_time.sql)，即可增加计划时间字段并清理已经拆分的“成都 · 重庆”旧记录。

如果要启用愿望分级，再运行一次 [`supabase/wishlist_priority.sql`](./supabase/wishlist_priority.sql)。完成后，后台“愿望清单”会出现“想去程度”选择框；公开网站会按等级分组，并用不同大小和亮度的地图光点展示优先程度。现有愿望会默认设为“很想去”，之后可逐个调整。

如果要为后台新增的愿望目的地设置地图位置，运行一次 [`supabase/wishlist_map_location.sql`](./supabase/wishlist_map_location.sql)。后台可编辑国家/地区、经纬度、WGS-84 / GCJ-02 坐标来源及地图标签；未定位条目仍保留卡片并显示提示。该脚本会为已存在但尚未填写坐标的“瑞士”设置格林德瓦代表点，保留手动文案、想去程度和已有坐标，也不改动已到访记录。重复执行不会覆盖已保存的自定义坐标。

如果需要让同一城市在不同日期重复出现在时间线上，再运行一次
[`supabase/city_visits.sql`](./supabase/city_visits.sql)。完成后，后台“城市资料”的“到访记录”区域可以继续添加或删除再次到访日期。首次到访日期仍保存在城市资料中；额外日期单独保存，但简介、坐标、封面、照片、攻略、评分和适合游玩天数始终按城市名共用一份。

照片会上传到公开的 `city-photos` Storage bucket。Bucket 只允许站主写入，访客只能读取；每张图片限制为 15 MB。

## 6. 启用攻略文件上传

在已经启用管理后台的项目中，再到 Supabase Dashboard 的 SQL Editor 运行一次
[`supabase/guide_documents.sql`](./supabase/guide_documents.sql)。这个迁移不会修改站主邮箱或现有旅行资料，只会新增：

- `travel_guides` 攻略记录表
- `travel-guides` 文件存储桶
- 仅站主可写、所有访客可读取已发布攻略的权限策略

完成后，打开管理后台的“攻略文件”区域，即可为“已经去过”或“想去的地方”选择目的地并上传 HTML、HTM 或 PDF。单个文件限制为 20 MB。Supabase 出于安全原因会把 HTML 存储对象作为纯文本返回，因此网站会通过 `guide-viewer.html` 获取文件并放入无同源权限的沙盒 iframe 中渲染；仍应只上传自己制作或信任的网页文件。

## 7. 启用正式旅程档案

在已经启用管理后台和攻略文件上传的项目中，再到 SQL Editor 运行一次
[`supabase/journeys.sql`](./supabase/journeys.sql)。看到 `Success. No rows returned` 后刷新管理后台。

这个迁移会新增：

- `travel_journeys`：旅程标题、日期、里程、预算、住宿、同行人与三阶段文字记录
- `travel_journey_stops`：旅程中的城市、停留顺序、日期与前往下一站的交通方式
- `travel_journey_photos`：从城市照片中选出的旅程照片
- 攻略类型 `journey`：允许把现有 HTML/PDF 上传能力复用为旅程攻略和游记

完成后可以在管理后台的“正式旅程档案”区域新建旅程。城市必须从已经去过的城市中选择；公开网站会在首页展示已发布旅程，并为每趟旅程生成 `journey.html?slug=链接标识` 独立页面。数据库迁移尚未执行时，公开网站仍会显示代码内置的日本旅程示例，但后台不会允许保存旅程。
