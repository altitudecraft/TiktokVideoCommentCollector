# CLAUDE.md — TikTok Video Comment Collector

## 项目概述

Chrome 扩展插件，用于导出 TikTok 视频评论数据。通过拦截 TikTok 评论 API 响应，自动采集并支持导出为结构化数据。

- **项目类型**: Chrome Extension (Manifest V3)
- **技术栈**: JavaScript/TypeScript, Chrome Extensions API
- **目标 API**: `/api/comment/list/`

## 语言偏好

请总是使用中文回复。

## 自进化 Lessons 系统

本项目使用自进化经验教训系统，详见 `.claude/CLAUDE.md`。

**核心机制**：Bug 修复 → 记录教训 → 重复出现 → 自动升级为强制规则

**AI 必须遵守的协议**：
1. 每次新会话：读取 `.claude/lessons/` 所有文件 + `.claude/CLAUDE.md` 强制规则
2. 每次修 Bug 后：在对应 lessons 文件追加记录
3. 出现次数 ≥ 3：自动升级为 `.claude/CLAUDE.md` 的强制规则

**Lessons 文件映射**：
| 问题类型 | 文件 |
|---------|------|
| Manifest/权限/CSP | `.claude/lessons/manifest.md` |
| 内容脚本/DOM/注入 | `.claude/lessons/content-script.md` |
| API拦截/数据解析 | `.claude/lessons/api-intercept.md` |
| Popup UI/交互/导出 | `.claude/lessons/popup-ui.md` |

## 开发规范

- 遵循父目录 `D:\01_MyProject\CLAUDE.md` 的全局规范
- 只做被要求的事情，不多不少
- 保持代码简单，避免过度工程化
- 使用 Manifest V3 标准
