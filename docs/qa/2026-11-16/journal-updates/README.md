# 手记更新：本地测试记录

日期：2026-11-16。已执行检查通过，未发现已验证场景中的功能缺陷；交接清单仍有未验证项，本记录不构成完整发布验收。

## 版本与环境

基线 `9ee67be04b3eb421163d7035522388da67e09b14`。候选为本地未提交改动，无候选 SHA；已跟踪文件差异的 SHA-256 为 `fcdda496a8268da0f8257ceee86dfff9bda22a72a2062b21c0a9f681ee9727c3`。新增文件 SHA-256：

- `assets/journal-updates-engine.js`：`f05af16d39111d85033fc1f551e2d10dd50e5394cc525bd3674572c76a8bc37f`
- `assets/journal-updates.js`：`f48903abffacc7629816b223abfbdce422af8e6b5bc7c7a331115f9f38e9494e`
- `assets/journal-updates.css`：`6a4392a835887cc3195efe9c7cd8f77f401ab420d5a99e869874d8264e9f6410`
- `assets/vendor/heroicons/clock.svg`：`373d9798f3bde27f665fd49fd4b78b6896de13e1b30670c1930d9553cd1ff3e3`

在隔离快照运行，使用 Node.js 22、本机 Chrome、Playwright、PGlite 与模拟存储，未写生产数据。截图为隔离测试数据；桌面结果包含仓库中公开照片素材。

## 已执行

- `git diff --check`：通过。
- `TZ=UTC node --test tests/journal-updates.test.cjs` 与 `TZ=America/Los_Angeles node --test tests/journal-updates.test.cjs`：各 4 项通过。覆盖不同偏移同一时刻的排序、去重、私密/草稿排除、无效和闰日、北京时间跨日及年末、未来日期、范围摘要。
- `npm test`：99 项单元测试和 10 组浏览器回归通过。之后新增异常与清除筛选测试，再次运行 `npm run test:journals`，通过。
- 新增浏览器用例覆盖：无公开记录、打开关闭和 Esc 焦点、公开一条记录及城市范围、历史前进/后退、详情返回、底层排序保留、清除筛选保留排序、记录读取失败及重试、城市目录分别重试、主人从公开上下文进入已撤下记录不可读而普通私有阅读可用。
- 1440、1024、834、390、320px 检查面板宽度及页面无横向溢出；查看桌面、手机、筛选空态和失败状态截图并与原型比较。不是对所有键盘和触控场景的完整验收。
- 既有手记回归验证隔离数据库 RLS、私人修订、照片和撤下流程；非生产 Supabase HTTP 验证。

截图：[桌面](updates-desktop.png)、[手机](updates-mobile.png)、[读取失败](updates-error.png)、[筛选空态](updates-filter-empty.png)。

## 尚未验证

多条公开手记的浏览器排序与重复发布、匿名/非主人/主人面板结果逐项比对、同地点相关记录和恶意 return 参数的完整组合、长摘要/无效时间界面、存储禁用、午夜刷新与位置恢复、延迟及过期请求、全部焦点陷阱与窄横屏、线上真实权限和接口等未逐项验证。独立百城专项未运行。截至本地测试记录完成时，尚未提交、推送或上线。
