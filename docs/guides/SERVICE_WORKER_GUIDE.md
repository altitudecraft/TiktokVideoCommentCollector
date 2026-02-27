# Service Worker 模块指南

> 文件: `src/background/service-worker.js` | 更新: 2026-02-27

## 架构

```
chrome.runtime.onMessage → 消息路由 handler map
  ├── api_data_received → handleApiData()（带队列串行化）
  ├── start_collection → handleStartCollection()
  ├── stop_collection → handleStopCollection()
  ├── get_state → loadState()
  ├── export_csv / copy_all → handleExportData()
  ├── collection_complete → handleCollectionComplete()
  └── sync_to_db → handleSyncToDb()
```

## 存储设计

使用 `chrome.storage.session`（10MB 限制，浏览器关闭即清除）：
- `tce_state`: 采集状态（status, videoId, cursor, counts）
- `tce_comments`: 评论对象（以 cid 为 key，O(1) 去重）

## 关键设计决策

### 竞态防护
`handleApiData` 通过 `processingQueue`（Promise 链）串行化，防止并发读写 storage 导致数据丢失。

### 评论排序
导出时按"父评论时间排序 + 回复紧跟父评论"排列，孤立回复追加到末尾。

### Service Worker 生命周期
MV3 Service Worker 30 秒无活动自动休眠。`onStartup` 监听器恢复中断状态。

### 数据库同步
`handleSyncToDb` 将采集的评论映射到数据库列格式，通过 HTTP POST 发送到 `tiktok-comment-scraper` 服务的 `/api/comments/import` 端点。

字段映射：cid→comment_id, username→unique_id, diggCount→digg_count, replyCount→reply_count, createTime→comment_time（unix→datetime）, parentCid→parent_comment_id。

配置常量：
- `SYNC_API_URL`: 目标 API 地址（默认 `http://185.132.54.28:3011`）
- `SYNC_API_KEY`: API 认证密钥

需要在 `manifest.json` 的 `host_permissions` 中添加对应的 API 服务器地址。

## 已修复问题

| 日期 | 问题 | 修复 |
|------|------|------|
| 2026-02-27 | 并发 API 响应导致 storage 竞态 | 添加 `processingQueue` Promise 链串行化 |
| 2026-02-27 | 回复 API 的 replyTo 字段始终为 null | 通过 parentCid 查找父评论用户名填充 |
| 2026-02-27 | storage 写入溢出无保护 | 添加 try-catch，溢出时标记 error 状态 |
| 2026-02-27 | CSV/复制导出时回复与父评论分离 | 重写排序逻辑：父评论 → 其回复 → 下一个父评论 |
