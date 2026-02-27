# 模块指南索引

> 自动维护：新增/修改模块时同步更新此文件 | 更新: 2026-02-28

## 指南列表

| 模块 | 文件 | 说明 |
|------|------|------|
| [CSV 导出](./CSV_EXPORT_GUIDE.md) | `src/utils/csv-exporter.js` | CSV 生成、注入防护、编码处理 |
| [内容脚本](./CONTENT_SCRIPT_GUIDE.md) | `src/content/` | 拦截器注入、API 监听、自动滚动 |
| [Service Worker](./SERVICE_WORKER_GUIDE.md) | `src/background/service-worker.js` | 消息路由、存储管理、竞态防护、数据库同步、进度计数 |
| [Popup UI](./POPUP_UI_GUIDE.md) | `src/popup/` | 界面交互、进度显示、同步流程、设置面板、错误处理 |

## 文档约定

- 每个指南包含：架构、关键设计决策、已修复问题表
- 「已修复问题」表是**自进化知识库**，Bug 修复后自动追加
- 文件命名：`{MODULE}_GUIDE.md`（大写 + 下划线）

### 自进化协议

修复 Bug 后 **必须** 执行以下步骤：
1. 在对应模块的 `已修复问题` 表追加一行（日期 | 问题 | 修复）
2. 如果修复涉及设计决策变更，同步更新 `关键设计决策` 章节
3. 如果同类问题出现 ≥ 2 次，将根因提升到下方 `常见陷阱` 表

## 常见陷阱（跨模块高频教训）

> 从各模块「已修复问题」中提炼的高频反模式，**新会话必读**。

| 陷阱 | 根因 | 正确做法 | 涉及模块 |
|------|------|---------|---------|
| 分子分母来源不同导致进度永远 < 100% | `collectedCount` 含内联回复，`totalRepliesExpected` 也含 | 计算 expected 时减去内联数；完成状态强制 100% | SW, Popup |
| 只增不减的计数器无退出条件 | `noDataCount` 被无条件重置为 0 | 改为"停止前检查"策略，设置重试上限 | Content |
| 状态机文档与实际触发条件不一致 | 文档写 `hasMore=false`，实际用 `collection_complete` | 修改代码后同步更新状态机图 | Popup |
| 并发写 storage 数据丢失 | 多个 API 响应同时触发 handler | Promise 链串行化（`processingQueue`） | SW |
| 回复按钮选择器与 TikTok DOM 不匹配 | TikTok 频繁改版 class 名 | 多层降级选择器 + 文本扫描兜底 | Content |
| 扩展更新后 content script 失联 | Chrome 不自动重注入已打开页面的 CS | `onInstalled` 主动注入 + 通信失败时 `executeScript` 重试 | SW, Content |
