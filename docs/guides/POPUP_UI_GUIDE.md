# Popup UI 模块指南

> 文件: `src/popup/popup.html`, `popup.css`, `popup.js` | 更新: 2026-02-28

## 架构

```
popup.html (结构)
  ├── popup.css (BEM 命名 + tce 前缀)
  ├── csv-exporter.js (CSV 生成工具)
  ├── text-formatter.js (文本格式化工具)
  └── popup.js (交互逻辑，IIFE 封装)
```

Popup 通过 `chrome.runtime.sendMessage` 与 Service Worker 通信，所有数据操作在 SW 端完成。

## UI 状态机

```
idle ──[点击开始]──→ collecting ──[hasMore=false]──→ complete
  ↑                     │                              │
  │                [点击停止]                    [点击重新采集]
  │                     │                              │
  └─────────────────────┘                              │
  ↑                                                    │
  └────────────────────────────────────────────────────┘
```

**各状态按钮行为**:

| 状态 | 开始按钮 | 停止按钮 | 导出/复制/同步 |
|------|---------|---------|---------------|
| `idle` | 显示「开始采集评论」 | 隐藏 | 禁用（有数据时启用） |
| `collecting` | 隐藏 | 显示 | 禁用 |
| `complete` | 显示「重新采集」 | 隐藏 | 启用 |
| `error` | 显示「重新采集」 | 隐藏 | 保持原状 |

## 消息类型

| Popup → SW | 用途 |
|-----------|------|
| `start_collection` | 开始采集（SW 负责打开评论面板+通知 content script） |
| `stop_collection` | 停止采集 |
| `get_state` | 轮询状态（1秒间隔） |
| `export_csv` | 获取排序后的评论数组 |
| `copy_all` | 同上，用于剪贴板 |
| `sync_to_db` | 同步评论到数据库 |
| `get_sync_config` | 读取 API 配置 |
| `save_sync_config` | 保存 API 配置 |
| `get_sync_history` | 读取同步历史 |

## 同步到数据库流程

```
用户点击「同步到数据库」
  → confirm() 确认弹窗（显示评论数量）
  → 按钮变为「同步中...」+ 禁用
  → sendMessage({ type: 'sync_to_db' })
  → 成功: 显示写入数量 + 刷新同步历史
  → 失败: 显示错误信息（见错误映射表）
  → 恢复按钮状态
```

**同步错误映射**:

| 错误码 | 用户提示 |
|-------|---------|
| `no_comments` | 没有可同步的评论 |
| `no_video_id` | 未检测到视频 ID |
| `api_error` | 服务器返回错误 (HTTP {status}) |
| `network_error` | 无法连接到服务器，请检查网络 |
| `permission_needed` | 需要访问权限 → 触发 `chrome.permissions.request()` |

## 设置面板

折叠式面板（同步设置），包含：
- **API 地址**: `inputApiUrl`，默认 placeholder 提示格式
- **API Key**: `inputApiKey`，`type="password"` 隐藏输入
- **保存设置**: 调用 `save_sync_config`，存入 `chrome.storage.sync`

初始化时自动加载已保存配置（`loadConfig()`）。

## 关键设计决策

### 轮询而非事件
状态通过 `setInterval(refreshState, 1000)` 轮询。简单可靠，避免 SW 休眠导致事件丢失。

### 同步始终发送全部评论
`chkReplies` 复选框仅影响导出/复制，不影响同步。数据库应存储完整数据集。

### confirm() 防误触
同步前弹出确认框显示评论数量，防止意外操作。

## 已修复问题

| 日期 | 问题 | 修复 |
|------|------|------|
| 2026-02-27 | 采集错误消息不友好 | 添加 `errorMessages` 映射表，中文化所有错误提示 |
| 2026-02-27 | 同步成功提示误导（"写入 N 条"含更新） | 改为「已写入 N 条评论到数据库（含更新）」 |
| 2026-02-27 | 非 TikTok 页面打开扩展无提示 | 添加引导页（guideContent）显示使用步骤 |
| 2026-02-28 | 进度总数仅含顶级评论，回复未计入 | `total` = `totalComments + totalRepliesExpected`，反映含回复的预期总数 |
| 2026-02-28 | 自定义 API 无权限时静默失败 | 添加 `permission_needed` 处理，Popup 端 `chrome.permissions.request()` |
