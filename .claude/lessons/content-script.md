# 内容脚本问题

> DOM 操作、页面注入、消息通信、脚本隔离相关的 Bug 记录。

<!-- 按时间倒序记录，最新的在最前面 -->
<!-- 记录格式见 README.md -->

### [2026-02-28] 扩展更新后 content script 变「孤儿」导致通信断开
- **严重级别**: 🔴 严重
- **出现次数**: 1
- **问题**: 扩展更新（`chrome.runtime.onInstalled`）后，已打开的 TikTok 标签页的 content script 与新版 SW 断开连接，`chrome.runtime.sendMessage` 报 "Receiving end does not exist"
- **根因**: Chrome MV3 不会自动将更新后的 content script 重新注入已打开的页面。旧 CS 的 `chrome.runtime` 指向已失效的旧 SW
- **解决**: 三层防护：(1) `onInstalled` 主动向所有 TikTok 标签注入 CS (2) `handleStartCollection` 通信失败时 `chrome.scripting.executeScript` 重注入并重试 (3) `window._tceContentLoaded` 防重入标志
- **预防**: 任何 Chrome 扩展在 `onInstalled` 中都应检查并重注入 content script 到已打开页面
- **关键词**: content-script, orphan, onInstalled, executeScript, 重注入
