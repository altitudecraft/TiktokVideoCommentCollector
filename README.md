# TikTok Comment Exporter

Chrome 扩展：一键导出 TikTok 视频页面的所有评论到 CSV 文件或剪贴板。

## 功能特性

- 自动拦截 TikTok 评论 API，无需手动翻页
- 自动检测并打开评论侧面板（无需手动点击评论图标）
- 自动滚动加载全部评论 + 展开回复
- 导出 CSV（BOM + UTF-8，Excel 直接打开无乱码）
- 一键复制全部评论文本到剪贴板
- CSV 注入防护（防止 Excel 公式执行）
- 中文界面，浅色简约主题

## 安装

### 从源码安装（开发者模式）

1. 下载或克隆本仓库
2. 打开 Chrome，访问 `chrome://extensions`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展」，选择本项目**根目录**
5. 在 TikTok 视频页面点击扩展图标即可使用

### 从打包文件安装

```bash
# 打包扩展
python scripts/pack.py

# 输出: dist/TikTok_Comment_Exporter_v1.0.0.zip
# 解压后按上述步骤加载
```

## 使用方法

1. 打开任意 TikTok 视频页面（如 `tiktok.com/@user/video/123`）
2. 点击浏览器工具栏中的扩展图标
3. 点击「开始采集评论」（插件会自动打开评论面板）
4. 等待采集完成，进度条显示实时进度
5. 点击「导出 CSV」下载表格，或「复制全部」复制到剪贴板

## 打包

```bash
python scripts/pack.py
```

自动读取 `manifest.json` 版本号，输出到 `dist/` 目录。

## 项目结构

```
├── manifest.json                 # Chrome 扩展配置（MV3）
├── icons/                        # 扩展图标 (16/48/128)
├── src/
│   ├── background/
│   │   └── service-worker.js     # 消息路由、数据存储、去重
│   ├── content/
│   │   ├── content-script.js     # 面板检测、自动滚动、事件监听
│   │   └── interceptor.js        # 页面级 Fetch 拦截器
│   ├── popup/
│   │   ├── popup.html            # 弹出窗口界面
│   │   ├── popup.css             # 样式（TikTok 品牌色）
│   │   └── popup.js              # 界面逻辑
│   └── utils/
│       ├── csv-exporter.js       # CSV 生成与下载
│       └── text-formatter.js     # 纯文本格式化与剪贴板
├── scripts/
│   └── pack.py                   # 打包脚本
└── docs/                         # 开发文档
    ├── guides/                   # 模块开发指南
    ├── standards/                # 编码规范
    └── plans/                    # 设计文档
```

## 技术架构

```
TikTok 页面
  │
  ├─ interceptor.js (MAIN world)
  │    拦截 fetch → CustomEvent
  │
  ├─ content-script.js (隔离世界)
  │    监听事件 → 转发 Background
  │    自动检测/打开评论面板
  │    自动滚动 + 展开回复
  │
  ├─ service-worker.js (Background)
  │    消息路由 → 数据解析 → 去重存储
  │    chrome.storage.session (10MB)
  │
  └─ popup (UI)
       采集控制 → 进度展示 → 导出/复制
```

## 开发指南

详细的模块文档：

- [CSV 导出模块](docs/guides/CSV_EXPORT_GUIDE.md)
- [内容脚本模块](docs/guides/CONTENT_SCRIPT_GUIDE.md)
- [Service Worker 模块](docs/guides/SERVICE_WORKER_GUIDE.md)
- [编码规范](docs/standards/CODING_STANDARDS.md)

## 许可

MIT
