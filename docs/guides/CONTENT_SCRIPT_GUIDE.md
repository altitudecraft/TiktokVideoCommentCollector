# 内容脚本模块指南

> 文件: `src/content/content-script.js`, `src/content/interceptor.js` | 更新: 2026-02-28

## 架构

```
[页面加载 document_start]
  ↓
content-script.js 注入 interceptor.js（MAIN world）
  ↓
interceptor.js 拦截 fetch → CustomEvent('tce_api_data')
  ↓
content-script.js 监听事件 → chrome.runtime.sendMessage → Background
  ↓
Background 指令 begin_scroll → content-script.js 自动滚动
```

## 关键机制

### 滚动停止条件
- `noDataCount >= NO_DATA_MAX(5)`：连续 5 次滚动无新数据
- `containerRetries >= 10`：滚动容器 10 次未找到
- 停止前检查：点击了回复按钮时延长等待（`noDataCount = NO_DATA_MAX - 2`，最多 `MAX_REPLY_WAIT=3` 轮）
- 无按钮可点时进入扫描阶段（最多 `SWEEP_MAX_ROUNDS=2` 轮）

### 回复展开
`clickViewRepliesButtons()` 采用两层策略点击 "View N replies" / "View N more replies" 按钮：

1. **已知容器选择器**（优先）:
   - `[class*="ViewReplies"] button` — TikTok 2026-02 新版布局
   - `[class*="ReplyAction"] button` — 旧版兼容
   - `[data-e2e="view-more-replies"]` — data-e2e 兼容
2. **面板内文本扫描**（兜底）: 当策略1未命中时，在滚动容器内扫描所有 `button`，按正则 `/view\s+\d+\s+(more\s+)?repl/i` 匹配

**限流机制**: 每个滚动周期最多点击 `MAX_REPLY_CLICKS_PER_CYCLE=3` 个回复按钮，防止同时展开过多回复导致页面渲染阻塞。预算在多个选择器间递减分配。

**按钮标记**: 通过 `data-tce-clicked-text` 属性记录已点击按钮的文本内容。当按钮文本变化时（如 "View 6 replies" → "View 3 more"）允许重新点击。

### 回复扫描（Sweep）机制
当主滚动结束（`noDataCount >= NO_DATA_MAX`）且无新回复按钮可点时：
1. `sweepRounds++`，滚回评论面板顶部（`scrollTop = 0`）
2. 重新滚动扫描页面中被跳过的回复按钮
3. 最多执行 `SWEEP_MAX_ROUNDS=2` 轮
4. 扫描完毕后发送 `collection_complete` 消息

### 评论面板自动打开
采集前检测评论侧面板是否已打开。若未打开，通过多层降级策略查找评论按钮并自动点击：
1. `data-e2e="comment-icon"` 的最近 `<button>` 祖先
2. `button[aria-label*="comment" i]`
3. `[class*="ButtonActionItem"]` 中含评论 SVG path 的按钮

点击后轮询等待面板出现（最多 3 秒），失败则提示用户手动操作。

### 防重入保护
`window._tceContentLoaded` 标志防止 content script 被多次初始化。当扩展更新触发 `onInstalled` 自动重注入，或 `handleStartCollection` 通信失败时通过 `chrome.scripting.executeScript` 重注入，该标志确保 IIFE 不会重复执行。

### 拦截器注入
通过 `<script>` 标签注入到页面 MAIN world（非隔离世界），用 `data-tce-interceptor` 防重复注入。

## 已修复问题

| 日期 | 问题 | 修复 |
|------|------|------|
| 2026-02-27 | 滚动容器未找到时无限重试 | 添加 `MAX_CONTAINER_RETRIES=10` 上限 |
| 2026-02-27 | "View replies" 按钮被重复点击 | 用 `data-tce-clicked-text` 按钮文本标记已点击按钮 |
| 2026-02-27 | `containerRetries` 采集重启后未重置 | `startScrolling()` 中重置 |
| 2026-02-27 | 评论面板未打开时无法采集 | 添加 `ensureCommentPanelOpen()` 自动检测并点击评论按钮 |
| 2026-02-27 | 回复按钮选择器不匹配新版 TikTok DOM（DivViewRepliesContainer） | 更新选择器 + 添加面板内文本扫描兜底策略 |
| 2026-02-27 | 回复加载期间 noDataCount 误判导致提前停止 | 改为停止前检查策略：有回复按钮时延长等待（`MAX_REPLY_WAIT=3` 轮上限） |
| 2026-02-27 | 同时点击 5+ 回复按钮导致页面渲染阻塞、无限循环 | 添加限流 `MAX_REPLY_CLICKS_PER_CYCLE=3` + 回复扫描机制 |
| 2026-02-27 | noDataCount 被 repliesClicked 无限重置导致永不停止 | 移除 doScroll 中的 noDataCount 重置，改为停止前检查策略 |
| 2026-02-27 | 部分回复按钮因位于视口外被跳过 | 添加 sweep 机制，滚回顶部重新扫描（最多 2 轮） |
| 2026-02-27 | repliesClicked>0 分支无退出条件，API 无响应时二次无限循环 | 添加 `replyWaitCount` 上限（`MAX_REPLY_WAIT=3`），收到新数据时重置 |
| 2026-02-28 | 扩展更新后 content script 变「孤儿」，`chrome.runtime` 断开 | 添加 `window._tceContentLoaded` 防重入标志，配合 SW 端 `onInstalled` 自动重注入 |
