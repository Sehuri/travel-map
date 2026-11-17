# 手记置顶：本地测试记录

日期：2026-11-17。已执行的测试通过，未发现已验证场景中的功能缺陷；本批仍有未覆盖的安全、竞态及部署前置事项，不能认定完整发布验收通过。

## 版本与环境

基线 `8e369ffbd8faabb11b05ac475f6e44a6e860e1fe`；候选为未提交改动，尚无候选提交 SHA。原有已跟踪文件差异 SHA-256：`00ddd50bff37b000ab5fa1baa9019cf742ce2540970ee79dbc1ce1a101a0948c`。新增核心文件 SHA-256：

- `assets/journal-pinning-engine.js`：`f40e0fb6b17e559a81ea9bd61d4ceb38786d3d60a1616223150dbde0715efd38`
- `assets/journal-pinning.js`：`7a82d2e737b6c91ca5fab72c35672b5b73a3eb966acdefb3da7da4f71026d043`
- `assets/journal-pinning.css`：`3b1c62b5cbf872779708f1cce6ab08db54e3320498c7129870e6ac8e0c0983f0`
- 两份置顶 SQL 内容一致，SHA-256：`6d6501b91e71472c789b7284280aedbfa93858ced1b0e5d44a3a084946cd8969`。

隔离快照使用 Node.js 22、Chrome、Playwright、PGlite 和模拟存储；仅临时数据库加载原手记 SQL 与置顶 SQL，未修改生产数据或配置。截图使用本地测试手记，包含仓库已有公开照片。

## 检查结果

- `git diff --check`：通过。
- `node --test tests/journal-pinning.test.cjs tests/journal-pinning-db.test.cjs`：3 项通过。覆盖置顶排序、精度、无效时间和私密状态，以及本地数据库迁移重复加载、匿名和非主人拒绝、直接更新拒绝、幂等、旧版本冲突、取消/撤销恢复旧时间、重复撤销、公开投影字段、正文版本/时间不变和撤下后清理。
- `npm test`：102 项单元测试及 10 组浏览器回归通过。随后补充游客、私人草稿和模拟权限失败检查，再次执行 `npm run test:journals`：通过。
- 浏览器验证一篇手记的置顶、撤销、游客仅见角标、草稿禁用、权限失败不显示成功，及桌面菜单/390px 手机底部面板；已有手记编辑、照片与公开权限流程在隔离环境回归通过。
- 与三张原型比较并查看运行截图：[桌面菜单](pin-menu-desktop.png)、[置顶成功](pin-success-desktop.png)、[手机面板](pin-mobile-menu.png)、[私人草稿](pin-private-disabled.png)、[权限失败](pin-failure.png)。

## 未完成事项

真实并发/行锁与超时丢包、其他归属记录、事务回滚、全部发布/归档状态转换、多条目筛选与三种排序的浏览器交互、照片请求复用、完整焦点/返回恢复及其他屏幕宽度尚未逐项验证；亦未核验生产 Supabase、真实身份或线上页面。独立百城专项未运行。

线上置顶功能需要先执行增量 SQL；截至本地测试记录完成时，尚未取得线上迁移授权，也未执行线上 SQL、提交或推送。迁移前置与前端发布不可混为已完成。
