# TikTok Comment Exporter — 编码标准

> 基于 Chrome Manifest V3 最佳实践（2025/2026），三轮搜索研究成果。

## 1. 文件命名规范

### 目录结构
```
src/
├── background/          # Service Worker 相关
├── content/             # 内容脚本 + 页面注入脚本
├── popup/               # Popup UI
└── utils/               # 工具函数
```

### 文件命名
| 规则 | 示例 | 说明 |
|------|------|------|
| 小写 + 连字符(kebab-case) | `service-worker.js` | 所有 JS 文件 |
| HTML/CSS 同名 | `popup.html` + `popup.css` | 成对出现 |
| 工具文件按功能命名 | `csv-exporter.js` | 动词/名词组合 |
| 常量文件 | `constants.js` | 集中管理 |

### 禁止
- ❌ `camelCase.js`（如 `serviceWorker.js`）
- ❌ `PascalCase.js`（如 `ServiceWorker.js`）
- ❌ 下划线（如 `service_worker.js`）

## 2. 函数命名规范

### 命名风格：camelCase
```javascript
// ✅ 正确
function handleCommentData(data) {}
function exportToCsv(comments) {}
function startAutoScroll() {}

// ❌ 错误
function handle_comment_data(data) {}
function ExportToCSV(comments) {}
```

### 命名模式
| 前缀 | 用途 | 示例 |
|------|------|------|
| `handle` | 事件处理 | `handleMessage`, `handleApiResponse` |
| `on` | 事件监听回调 | `onCommentReceived`, `onScrollEnd` |
| `create` | 创建/生成 | `createCsvContent`, `createDownloadBlob` |
| `parse` | 解析/提取 | `parseCommentData`, `parseApiResponse` |
| `format` | 格式化 | `formatTimestamp`, `formatCommentText` |
| `get` | 获取/查询 | `getStoredComments`, `getVideoInfo` |
| `set` | 设置/存储 | `setCollectionState`, `setProgress` |
| `is/has` | 布尔判断 | `isTikTokVideoPage`, `hasMoreComments` |
| `init` | 初始化 | `initInterceptor`, `initScrollObserver` |
| `start/stop` | 控制生命周期 | `startCollection`, `stopAutoScroll` |
| `send` | 发送消息 | `sendToBackground`, `sendProgress` |

### 常量命名：UPPER_SNAKE_CASE
```javascript
// ✅ 正确
const API_COMMENT_LIST = '/api/comment/list/';
const API_COMMENT_REPLY = '/api/comment/list/reply/';
const SCROLL_INTERVAL_MS = 1000;
const MAX_RETRY_COUNT = 3;
const STORAGE_KEY_COMMENTS = 'tce_comments';
const STORAGE_KEY_STATE = 'tce_state';

// ❌ 错误
const apiCommentList = '/api/comment/list/';
const scrollInterval = 1000;
```

## 3. 消息协议规范

### 消息类型定义（constants.js）
```javascript
const MSG = {
  // Content → Background
  API_DATA_RECEIVED: 'api_data_received',
  COLLECTION_COMPLETE: 'collection_complete',
  VIDEO_INFO: 'video_info',

  // Popup → Background
  START_COLLECTION: 'start_collection',
  STOP_COLLECTION: 'stop_collection',
  GET_STATE: 'get_state',
  EXPORT_CSV: 'export_csv',
  COPY_ALL: 'copy_all',

  // Background → Content
  BEGIN_SCROLL: 'begin_scroll',
  STOP_SCROLL: 'stop_scroll',

  // Background → Popup (response)
  STATE_UPDATE: 'state_update',
};
```

### 消息结构
```javascript
// ✅ 标准消息格式
{
  type: MSG.API_DATA_RECEIVED,
  payload: { comments: [], cursor: 20, hasMore: true, total: 560 }
}

// ❌ 非标准
{ action: 'data', data: [...] }
```

## 4. CustomEvent 通信规范

### 页面注入脚本 → Content Script
```javascript
// interceptor.js (页面上下文)
const EVENT_NAME = 'tce_api_data';

window.dispatchEvent(new CustomEvent(EVENT_NAME, {
  detail: { url, body: jsonData, timestamp: Date.now() }
}));
```

### Content Script 监听
```javascript
// content-script.js
window.addEventListener('tce_api_data', (event) => {
  const { url, body } = event.detail;
  // 处理并转发到 Background
});
```

### 命名前缀
所有自定义事件使用 `tce_` 前缀（TikTok Comment Exporter），避免与页面冲突。

## 5. 状态管理规范

### 核心原则：不信任内存
```javascript
// ✅ 正确 — 使用 chrome.storage.session
async function saveState(state) {
  await chrome.storage.session.set({ [STORAGE_KEY_STATE]: state });
}

async function loadState() {
  const result = await chrome.storage.session.get(STORAGE_KEY_STATE);
  return result[STORAGE_KEY_STATE] || getDefaultState();
}

// ❌ 错误 — 依赖内存变量（Service Worker 会被终止）
let comments = [];  // 重启后丢失！
```

### 状态结构
```javascript
function getDefaultState() {
  return {
    status: 'idle',        // idle | collecting | complete | error
    videoId: null,          // aweme_id
    videoAuthor: null,      // @username
    totalComments: 0,       // API 返回的 total
    collectedCount: 0,      // 已采集数量
    cursor: 0,              // 当前分页游标
    hasMore: true,          // 是否还有更多
    startedAt: null,        // 采集开始时间
  };
}
```

### Storage Key 命名
```javascript
const STORAGE_KEY_STATE = 'tce_state';
const STORAGE_KEY_COMMENTS = 'tce_comments';
const STORAGE_KEY_REPLIES = 'tce_replies';
```

## 6. 错误处理规范

### 标准模式
```javascript
// ✅ 在每个 chrome API 调用后检查 runtime.lastError
chrome.runtime.sendMessage(msg, (response) => {
  if (chrome.runtime.lastError) {
    console.warn('[TCE]', chrome.runtime.lastError.message);
    return;
  }
  // 处理 response
});

// ✅ async/await 模式
try {
  await chrome.storage.session.set({ key: value });
} catch (err) {
  console.error('[TCE] Storage error:', err.message);
}
```

### 日志前缀
所有 console 输出使用 `[TCE]` 前缀：
```javascript
console.log('[TCE] Collection started, videoId:', videoId);
console.warn('[TCE] API response parse failed:', error.message);
console.error('[TCE] Critical: Interceptor injection failed');
```

## 7. CSS 命名规范

### BEM 风格 + tce 前缀
```css
/* 块 */
.tce-popup {}
.tce-progress {}

/* 元素 */
.tce-popup__title {}
.tce-popup__button {}
.tce-progress__bar {}
.tce-progress__text {}

/* 修饰符 */
.tce-popup__button--primary {}
.tce-popup__button--disabled {}
.tce-progress__bar--complete {}
```

### CSS 变量（主题）
```css
:root {
  --tce-primary: #fe2c55;       /* TikTok 品牌红 */
  --tce-bg: #ffffff;
  --tce-text: #161823;
  --tce-text-secondary: #8a8b91;
  --tce-border: #e3e3e4;
  --tce-success: #25f4ee;       /* TikTok 品牌青 */
  --tce-radius: 8px;
}
```

## 8. Manifest V3 最佳实践

### 权限最小化
```json
{
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": ["*://*.tiktok.com/*"]
}
```
- ✅ 使用 `activeTab` 而非 `tabs`
- ✅ 限制 `host_permissions` 到 tiktok.com
- ❌ 不使用 `<all_urls>`
- ❌ 不使用 `webRequest`（MV3 下无法读响应体）

### Service Worker 生存规则
1. **不依赖全局变量**——所有状态存 `chrome.storage.session`
2. **不使用 setTimeout/setInterval**——用 `chrome.alarms` 代替
3. **每个消息处理函数必须是幂等的**——重复调用不影响结果
4. **监听 `chrome.runtime.onStartup`**——恢复状态

### Content Script 安全
1. **使用 `document_start` 注入**——确保在页面脚本运行前注入拦截器
2. **拦截器使用防重入标记**——`window.__tceInterceptor` 防止重复注入
3. **不在 Content Script 中存储敏感数据**——通过消息转发到 Background
4. **CustomEvent 使用唯一前缀**——`tce_` 避免与 TikTok 代码冲突

## 9. 注释规范

### 文件头注释
```javascript
/**
 * TikTok Comment Exporter - Service Worker
 * 管理评论数据的持久化存储和消息路由。
 */
```

### 函数注释（仅复杂函数）
```javascript
/**
 * 解析 API 响应中的评论数据，标准化为统一格式。
 * @param {Object} apiResponse - /api/comment/list/ 的原始响应
 * @param {string|null} parentCommentId - 父评论 ID（回复时提供）
 * @returns {Array<Object>} 标准化的评论对象数组
 */
function parseCommentData(apiResponse, parentCommentId = null) {}
```

### 行内注释
```javascript
// 仅在逻辑不明显时添加
const delay = 800 + Math.random() * 400;  // 800-1200ms 随机化，模拟人类滚动
```

## 10. 导出数据标准化格式

### 内部存储格式（comment-parser.js 输出）
```javascript
{
  cid: '7598179541605647134',       // 评论唯一 ID
  username: 'texan_326',            // 用户名
  nickname: 'Corey Nicolai',        // 昵称
  text: '90° - 40° =50° / 2 =25°', // 评论文本
  diggCount: 118,                   // 点赞数
  replyCount: 15,                   // 回复数
  createTime: 1769089107,           // Unix 时间戳
  isReply: false,                   // 是否为回复
  replyTo: null,                    // 回复对象用户名
  parentCid: null,                  // 父评论 ID
  isAuthorDigged: true,             // 创作者是否点赞
}
```
