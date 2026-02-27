# 模块指南索引

> 自动维护：新增/修改模块时同步更新此文件

## 指南列表

| 模块 | 文件 | 说明 |
|------|------|------|
| [CSV 导出](./CSV_EXPORT_GUIDE.md) | `src/utils/csv-exporter.js` | CSV 生成、注入防护、编码处理 |
| [内容脚本](./CONTENT_SCRIPT_GUIDE.md) | `src/content/` | 拦截器注入、API 监听、自动滚动 |
| [Service Worker](./SERVICE_WORKER_GUIDE.md) | `src/background/service-worker.js` | 消息路由、存储管理、竞态防护 |

## 文档约定

- 每个指南包含：架构、关键设计决策、已修复问题表
- 「已修复问题」表是自进化知识库，Bug 修复后自动追加
- 文件命名：`{MODULE}_GUIDE.md`（大写 + 下划线）
