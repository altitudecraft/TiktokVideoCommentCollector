# Service Worker 模块指南

> 文件: `src/background/service-worker.js` | 更新: 2026-02-28

## 架构

```
chrome.runtime.onMessage → 消息路由 handler map
  ├── api_data_received  → handleApiData()（带队列串行化）
  ├── start_collection   → handleStartCollection()
  ├── stop_collection    → handleStopCollection()
  ├── get_state          → loadState()
  ├── export_csv / copy_all → handleExportData()
  ├── collection_complete → handleCollectionComplete()
  ├── sync_to_db         → handleSyncToDb()
  ├── get_sync_history   → getSyncHistory()
  ├── get_sync_config    → getSyncConfig()
  └── save_sync_config   → saveSyncConfig()
```

## 存储设计

| 存储类型 | Key | 用途 | 生命周期 |
|---------|-----|------|---------|
| `session` | `tce_state` | 采集状态（status, videoId, cursor, counts, totalRepliesExpected） | 浏览器关闭即清除 |
| `session` | `tce_comments` | 评论对象（cid 为 key，O(1) 去重） | 浏览器关闭即清除 |
| `sync` | `tce_sync_config` | API 地址和密钥（跨设备同步） | 永久，随 Chrome 账户同步 |
| `local` | `tce_sync_history` | 同步历史记录（最近 20 条） | 永久，仅本设备 |

## 关键设计决策

### 竞态防护
`handleApiData` 通过 `processingQueue`（Promise 链）串行化，防止并发读写 storage 导致数据丢失。

### 评论排序
导出时按"父评论时间排序 + 回复紧跟父评论"排列，孤立回复追加到末尾。

### Service Worker 生命周期
MV3 Service Worker 30 秒无活动自动休眠。`onStartup` 监听器恢复中断状态。

### 数据库同步

**流程**: `handleSyncToDb()` → 字段映射 → `fetch POST` → 记录历史

**字段映射**:
| 插件字段 | DB 列 | 转换 |
|---------|-------|------|
| `cid` | `comment_id` | `String()` |
| `username` | `unique_id` | 直接 |
| `nickname` | `nickname` | 直接 |
| `diggCount` | `digg_count` | 直接 |
| `replyCount` | `reply_count` | 直接 |
| `createTime` | `comment_time` | unix 秒 → `YYYY-MM-DD HH:mm:ss` |
| `parentCid` | `parent_comment_id` | 直接 |

**可配置 API**（v1.1.0+）:
- 用户可在 Popup 设置面板修改 API 地址和密钥
- 存储在 `chrome.storage.sync`（跨设备同步）
- 默认值: `http://185.132.54.28:3011/api/comments/import`
- 认证: `X-API-Key` 请求头

**同步历史**（v1.1.0+）:
- 每次同步成功后记录 `{ videoId, count, time }` 到 `chrome.storage.local`
- 最多保留 20 条（FIFO）
- Popup 显示最近一次同步信息

**前提条件**: `manifest.json` 的 `host_permissions` 或 `optional_host_permissions` 需包含目标 API 域名。自定义地址需用户在 Popup 端授权（`chrome.permissions.request`）。

### 进度计数

**总数计算**: `totalComments`（API `body.total`，仅顶级评论） + `totalRepliesExpected`（累计各顶级评论的 `reply_comment_total`）

**注意**: TikTok 主评论 API 的 `body.total` 仅包含顶级评论数。回复数需从每个顶级评论的 `reply_comment_total` 字段累加。`collectedCount` 为实际存储的去重评论总数（顶级 + 回复）。

## 已修复问题

| 日期 | 问题 | 修复 |
|------|------|------|
| 2026-02-27 | 并发 API 响应导致 storage 竞态 | 添加 `processingQueue` Promise 链串行化 |
| 2026-02-27 | 回复 API 的 replyTo 字段始终为 null | 通过 parentCid 查找父评论用户名填充 |
| 2026-02-27 | storage 写入溢出无保护 | 添加 try-catch，溢出时标记 error 状态 |
| 2026-02-27 | CSV/复制导出时回复与父评论分离 | 重写排序逻辑：父评论 → 其回复 → 下一个父评论 |
| 2026-02-27 | hasMore=0 时过早标记 complete，回复未展开 | 移除 _handleApiData 中的完成检查，由 content script 控制 |
| 2026-02-28 | 进度显示 totalComments 仅含顶级评论，回复未计入总数 | 新增 `totalRepliesExpected` 累计回复预期数，Popup 显示合计总数 |
