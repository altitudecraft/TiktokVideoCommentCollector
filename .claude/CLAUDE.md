# TikTok Video Comment Collector — Claude Code 配置

## 项目信息

- **类型**: Chrome Extension (Manifest V3)
- **功能**: TikTok 视频评论导出
- **技术栈**: JavaScript/TypeScript, Chrome Extensions API
- **目标 API**: `/api/comment/list/`

## 📋 会话启动协议

每次新会话开始时，AI **必须**执行以下步骤：

1. **读取所有 lessons 文件**，了解历史问题：
   - `.claude/lessons/manifest.md`
   - `.claude/lessons/content-script.md`
   - `.claude/lessons/api-intercept.md`
   - `.claude/lessons/popup-ui.md`
2. **读取本文件的「强制规则」区域**，严格遵守已升级的规则
3. **检查待升级教训**：扫描出现次数 ≥ 3 但未标注 `⬆️ 已升级为规则` 的条目
   - 如有，执行升级流程并通知用户

## 🐛 Bug 修复后自动记录协议

每次修复 Bug 后，AI **必须**执行以下步骤：

1. **分类判断**：根据问题类型确定对应的 lessons 文件

   | 问题类型 | 记录文件 |
   |---------|---------|
   | Manifest/权限/CSP | `.claude/lessons/manifest.md` |
   | 内容脚本/DOM/注入 | `.claude/lessons/content-script.md` |
   | API拦截/数据解析/网络 | `.claude/lessons/api-intercept.md` |
   | Popup UI/交互/导出 | `.claude/lessons/popup-ui.md` |

2. **查重**：检查是否已有相同根因的历史教训
   - 如有 → 增加出现次数，更新日期
   - 如无 → 按增强版格式追加新记录

3. **升级检查**：如出现次数 ≥ 3 且未升级
   - 提炼为简洁的强制规则
   - 写入本文件「🚨 强制规则」区域
   - 在原 lesson 条目标注 `⬆️ 已升级为规则`
   - 通知用户：`"⬆️ 教训已升级为强制规则: [规则简述]"`

### 记录格式

```markdown
### [YYYY-MM-DD] 问题简述
- **严重级别**: 🔴 严重 | 🟡 中等 | 🟢 轻微
- **出现次数**: 1
- **问题**: 具体描述
- **根因**: 为什么发生
- **解决**: 如何修复
- **预防**: 未来如何避免
- **关键词**: keyword1, keyword2
```

## 🚨 强制规则（自动升级自 lessons）

<!-- 当教训出现 ≥ 3 次时自动添加到此处 -->
<!-- 格式: ### [规则编号] 规则标题 -->
<!-- - **来源**: lessons/xxx.md，出现 N 次 -->
<!-- - **规则**: 具体要求 -->
<!-- - **升级日期**: YYYY-MM-DD -->

_暂无自动升级的规则。随着项目开发，频繁出现的问题将自动升级到此处。_

## 🔧 开发规范

**完整编码标准**: `docs/standards/CODING_STANDARDS.md`

### Chrome 扩展开发要点
- 使用 Manifest V3（不使用已弃用的 V2）
- Service Worker 替代 Background Page，**不信任内存状态**
- 使用 `chrome.scripting` API 注入脚本
- API 响应拦截使用**页面级 fetch 注入 + CustomEvent** 模式
- ❌ 不使用 `chrome.webRequest` 读响应体（MV3 不支持）

### 命名规范速查
- **文件名**: kebab-case（`service-worker.js`）
- **函数名**: camelCase（`handleCommentData`）
- **常量名**: UPPER_SNAKE_CASE（`API_COMMENT_LIST`）
- **消息类型**: UPPER_SNAKE_CASE（`MSG.START_COLLECTION`）
- **CSS 类名**: BEM + tce 前缀（`.tce-popup__button--primary`）
- **CustomEvent**: tce_ 前缀（`tce_api_data`）
- **Storage Key**: tce_ 前缀（`tce_state`, `tce_comments`）
- **日志前缀**: `[TCE]`

### Service Worker 生存规则 ⚠️
1. **不依赖全局变量** → 用 `chrome.storage.session`
2. **不用 setTimeout/setInterval** → 用 `chrome.alarms`
3. **消息处理必须幂等** → 重复调用不影响结果
4. **监听 onStartup** → 恢复状态

### 代码风格
- 遵循项目根目录 CLAUDE.md 的全局规范
- 扩展代码模块化：background/content/popup/utils 分离
- 所有 console 输出使用 `[TCE]` 前缀
