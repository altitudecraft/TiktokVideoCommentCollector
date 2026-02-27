# CSV 导出模块指南

> 文件: `src/utils/csv-exporter.js` | 更新: 2026-02-27

## 架构

Popup 页面通过 `<script>` 标签加载，提供 `downloadCsv(comments, videoId)` 全局函数。

```
popup.js → downloadCsv() → generateCsvContent() → escapeCsvField() → Blob 下载
```

## 关键设计决策

### CSV 注入防护
用户输入字段（username, nickname, comment, replyTo）以 `=`, `+`, `-`, `@`, `\t`, `\r` 开头时，添加单引号前缀防止 Excel 公式注入。

```javascript
escapeCsvField(value, isUserInput)
// isUserInput=true: 检查并添加单引号前缀
// isUserInput=false: 不做注入防护（如 comment_id, time）
```

### 编码
BOM (`\uFEFF`) + UTF-8，确保 Excel 正确识别中文。

## 已修复问题

| 日期 | 问题 | 修复 |
|------|------|------|
| 2026-02-27 | CSV 注入漏洞：公式字符开头的用户输入可在 Excel 中执行 | 添加 `isUserInput` 参数，对用户字段做前缀防护 |
| 2026-02-27 | 数值字段可能输出非数字 | 使用 `Number() \|\| 0` 确保 likes/replies 为数字 |
| 2026-02-27 | `\r` 字符未处理 | 添加 `\r` 到需引号包裹的字符列表 |
