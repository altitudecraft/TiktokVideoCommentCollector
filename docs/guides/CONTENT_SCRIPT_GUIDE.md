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
- `noDataCount >= 3`：连续 3 次滚动无新数据
- `containerRetries >= 10`：滚动容器 10 次未找到

### 回复展开
点击 "View N replies" 按钮，通过 `data-tce-clicked` 属性标记已点击按钮避免重复。

### 评论面板自动打开
采集前检测评论侧面板是否已打开。若未打开，通过多层降级策略查找评论按钮并自动点击：
1. `data-e2e="comment-icon"` 的最近 `<button>` 祖先
2. `button[aria-label*="comment" i]`
3. `[class*="ButtonActionItem"]` 中含评论 SVG path 的按钮

点击后轮询等待面板出现（最多 3 秒），失败则提示用户手动操作。

### 拦截器注入
通过 `<script>` 标签注入到页面 MAIN world（非隔离世界），用 `data-tce-interceptor` 防重复注入。

## 已修复问题

| 日期 | 问题 | 修复 |
|------|------|------|
| 2026-02-27 | 滚动容器未找到时无限重试 | 添加 `MAX_CONTAINER_RETRIES=10` 上限 |
| 2026-02-27 | "View replies" 按钮被重复点击 | 用 `data-tce-clicked` 标记已点击按钮 |
| 2026-02-27 | `containerRetries` 采集重启后未重置 | `startScrolling()` 中重置 |
| 2026-02-28 | 评论面板未打开时无法采集 | 添加 `ensureCommentPanelOpen()` 自动检测并点击评论按钮 |
