# API 拦截问题

> TikTok API 拦截、数据解析、网络请求、响应处理相关的 Bug 记录。

<!-- 按时间倒序记录，最新的在最前面 -->
<!-- 记录格式见 README.md -->

### [2026-02-28] HTTP 413 大 payload 同步失败
- **严重级别**: 🔴 严重
- **出现次数**: 1
- **问题**: 同步 500+ 条评论到服务器返回 HTTP 413 (Payload Too Large)
- **根因**: Express.js 的 `express.json()` 默认 body 限制为 100KB，500+ 条评论 JSON ≈ 200KB+ 超出限制
- **解决**: 服务端 `express.json({ limit: "5mb" })`；客户端分批发送（`SYNC_BATCH_SIZE=200`），单批 ≈ 80KB
- **预防**: 向外部 API 发送数据时，预估 payload 大小是否可能超限。超过 50KB 的请求建议分批
- **关键词**: HTTP 413, payload, express, batch, 分批同步

### [2026-02-28] 内联回复计数导致 totalRepliesExpected 膨胀
- **严重级别**: 🟡 中等
- **出现次数**: 1
- **问题**: TikTok API 返回的 `reply_comment_total` 包含「将要展开的回复」，但 `reply_comment` 数组中的内联回复已被 `handleApiData` 直接计入 `collectedCount`
- **根因**: 双重计数 — 内联回复同时出现在 `collectedCount`（作为已采集）和 `totalRepliesExpected`（作为预期）
- **解决**: 累计 `totalRepliesExpected` 时减去 `c.reply_comment.length`
- **预防**: TikTok API 的「总数」字段通常包含内联数据，处理时必须扣除已内联的部分
- **关键词**: reply_comment, reply_comment_total, 内联回复, 双重计数
