# 🗺️ 旅行足迹地图

一个纯静态的旅行足迹可视化网站，用 ECharts 在中国地图上点亮去过的城市，记录每一段旅程。

## 在线访问

```
https://sehuri.github.io/travel-map
```

部署在 [GitHub Pages](https://pages.github.com/) 上，无需服务器。

## 功能

- **中国地图可视化**：ECharts 渲染散点地图，去过的城市以金色光点标记
- **城市详情面板**：每个城市附带到访日期、介绍文字、旅行照片
- **跨设备照片同步**：照片通过 GitHub API 上传到仓库，任何设备都能看到
- **国家维度统计**：自动统计覆盖国家和城市数量
- **照片导出**：一键导出所有已保存的照片为 JSON
- **照片管理**：支持上传（最多 10 张/城市）和删除（Token 验证）

## 技术栈

| 层级 | 技术 |
|------|------|
| 地图渲染 | ECharts 5 + 中国 GeoJSON |
| CDN | BootCDN（国内友好） |
| 照片存储 | GitHub API（公开仓库免认证读取） |
| 部署 | GitHub Pages |
| 本地缓存 | localStorage 兜底 |

## 项目结构

```
├── index.html          # 也指向旅行地图（GitHub Pages 默认入口）
├── travel-map.html     # 主页面
└── photos/             # 照片目录（由网页端通过 API 创建）
    ├── 北京/
    ├── 上海/
    └── ...
```

> `photos/` 目录由网页端 JS 通过 GitHub API 自动创建和管理，无需手动维护。

## 如何添加新城市

编辑 `travel-map.html`，在 `visitedData` 数组中添加记录：

```javascript
{
  name: '城市名',
  date: 'YYYY-MM-DD',
  desc: '简短描述',
  lat: 纬度,
  lng: 经度,
  country: '国家'
}
```

提交后 GitHub Pages 会自动重新部署。

## 照片功能说明

- **上传**：需要 GitHub Personal Access Token（仅存在浏览器 localStorage，不上传）
- **查看**：无需 Token，公开仓库直接访问
- **删除**：需要 Token 验证身份
- Token 可在 [GitHub Settings → Developer settings → Tokens](https://github.com/settings/tokens) 创建，勾选 `repo` 权限即可
