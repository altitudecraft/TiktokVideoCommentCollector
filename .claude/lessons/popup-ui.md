# Popup UI 问题

> Popup 界面、用户交互、导出功能、状态管理相关的 Bug 记录。

<!-- 按时间倒序记录，最新的在最前面 -->
<!-- 记录格式见 README.md -->

### [2026-02-28] 进度百分比因分子分母来源不同永远 < 100%
- **严重级别**: 🟡 中等
- **出现次数**: 2（进度显示 + 完成状态两次触发）
- **问题**: 采集完成后进度显示 85% 而非 100%。`collectedCount` 含内联回复，但 `totalRepliesExpected` 也含内联回复导致分母膨胀
- **根因**: `totalRepliesExpected` 从 `reply_comment_total` 累计时未减去已在 `collectedCount` 中计入的 `c.reply_comment.length` 内联回复
- **解决**: SW 端计算时减去内联回复数；Popup 端完成状态强制 100%；`displayTotal` 取 `max(total, collected)`
- **预防**: 涉及分子/分母的计数器，必须确认二者统计口径一致，不能交叉计数
- **关键词**: progress, totalRepliesExpected, 内联回复, 完成状态

### [2026-02-28] 大批量同步无进度反馈用户以为卡死
- **严重级别**: 🟡 中等
- **出现次数**: 1
- **问题**: 同步 500+ 条评论时按钮只显示「同步中...」，用户无法得知进度
- **根因**: 原实现一次性发送全部数据，无分批也无进度回传
- **解决**: SW 分批（200 条/批），通过 `session storage` 传递进度，Popup 轮询显示「同步中 1/3 批...」
- **预防**: 任何可能超过 3 秒的操作都应提供进度反馈
- **关键词**: sync, batch, progress, UX
