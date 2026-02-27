/**
 * TikTok Comment Exporter - Service Worker
 * 管理评论数据的持久化存储、去重和消息路由。
 * 所有状态存储在 chrome.storage.session，不依赖内存变量。
 */

const LOG = '[TCE]';
const STORAGE_KEY_STATE = 'tce_state';
const STORAGE_KEY_COMMENTS = 'tce_comments';
const API_COMMENT_LIST = '/api/comment/list/';
const API_COMMENT_REPLY = '/api/comment/list/reply/';

// ─── 同步到数据库配置 ───
// 注意: 仅限内部使用。扩展代码中的 Key 不可保密，服务端应通过环境变量设置强密钥。
const DEFAULT_SYNC_API_URL = 'http://185.132.54.28:3011/api/comments/import';
const DEFAULT_SYNC_API_KEY = 'scraper_secret_key_2026';
const STORAGE_KEY_SYNC_CONFIG = 'tce_sync_config';

async function getSyncConfig() {
  const result = await chrome.storage.sync.get(STORAGE_KEY_SYNC_CONFIG);
  const config = result[STORAGE_KEY_SYNC_CONFIG] || {};
  return {
    apiUrl: config.apiUrl || DEFAULT_SYNC_API_URL,
    apiKey: config.apiKey || DEFAULT_SYNC_API_KEY,
  };
}

async function saveSyncConfig(config) {
  await chrome.storage.sync.set({
    [STORAGE_KEY_SYNC_CONFIG]: {
      apiUrl: config.apiUrl || DEFAULT_SYNC_API_URL,
      apiKey: config.apiKey || DEFAULT_SYNC_API_KEY,
    },
  });
  return { ok: true };
}

// ─── 状态管理 ───

function getDefaultState() {
  return {
    status: 'idle',        // idle | collecting | complete | error
    videoId: null,
    videoUrl: null,
    totalComments: 0,       // 顶级评论总数（来自 API body.total）
    totalRepliesExpected: 0, // 预期回复总数（累计各顶级评论的 reply_comment_total）
    collectedCount: 0,
    cursor: 0,
    hasMore: true,
    startedAt: null,
  };
}

async function loadState() {
  const result = await chrome.storage.session.get(STORAGE_KEY_STATE);
  return result[STORAGE_KEY_STATE] || getDefaultState();
}

async function saveState(state) {
  await chrome.storage.session.set({ [STORAGE_KEY_STATE]: state });
}

async function loadComments() {
  const result = await chrome.storage.session.get(STORAGE_KEY_COMMENTS);
  return result[STORAGE_KEY_COMMENTS] || {};
}

async function saveComments(comments) {
  await chrome.storage.session.set({ [STORAGE_KEY_COMMENTS]: comments });
}

// ─── 评论数据解析（内联，避免 importScripts 复杂性） ───

function parseComment(c, parentCid) {
  return {
    cid: c.cid,
    username: c.user?.unique_id || '',
    nickname: c.user?.nickname || '',
    text: c.text || '',
    diggCount: c.digg_count || 0,
    replyCount: c.reply_comment_total || 0,
    createTime: c.create_time || 0,
    isReply: parentCid !== null || (c.reply_id && c.reply_id !== '0'),
    replyTo: null,
    parentCid: parentCid || (c.reply_id && c.reply_id !== '0' ? c.reply_id : null),
    isAuthorDigged: !!c.is_author_digged,
  };
}

function extractAwemeId(url) {
  try {
    const params = new URL(url, 'https://www.tiktok.com').searchParams;
    return params.get('aweme_id') || null;
  } catch (e) {
    return null;
  }
}

// ─── API 数据处理（带队列防竞态） ───

let processingQueue = Promise.resolve();

function handleApiData(url, body) {
  // 串行化处理，避免并发读写 storage 导致数据丢失
  processingQueue = processingQueue.then(function () {
    return _handleApiData(url, body);
  }).catch(function (e) {
    console.error(LOG, 'handleApiData error:', e.message);
    return { collectedCount: 0, totalComments: 0, totalRepliesExpected: 0, newCount: 0 };
  });
  return processingQueue;
}

async function _handleApiData(url, body) {
  const state = await loadState();
  const comments = await loadComments();

  const isReplyApi = url.includes(API_COMMENT_REPLY);
  const rawComments = body.comments || body.reply_comments || [];
  let newCount = 0;

  // 提取视频 ID
  const awemeId = extractAwemeId(url);
  if (awemeId && !state.videoId) {
    state.videoId = awemeId;
  }

  // 更新 total（仅从顶级评论 API）
  if (!isReplyApi && body.total) {
    state.totalComments = body.total;
  }

  // 解析并去重
  const parentCid = isReplyApi ? extractParentCid(url) : null;

  // 查找父评论的用户名（用于 replyTo）
  const parentUser = parentCid && comments[parentCid]
    ? comments[parentCid].username
    : null;

  for (const c of rawComments) {
    const parsed = parseComment(c, parentCid);
    // 填充 reply API 的 replyTo
    if (isReplyApi && parentUser) {
      parsed.replyTo = parentUser;
    }
    if (!comments[parsed.cid]) {
      comments[parsed.cid] = parsed;
      newCount++;

      // 累计新顶级评论的预期回复数（近似估计，用于进度显示）
      // 减去内联回复数，避免与 collectedCount 重复计数导致进度永远 < 100%
      if (!isReplyApi && !parsed.isReply && c.reply_comment_total > 0) {
        const inlineCount = Array.isArray(c.reply_comment) ? c.reply_comment.length : 0;
        state.totalRepliesExpected += Math.max(0, c.reply_comment_total - inlineCount);
      }
    }

    // 处理内联回复
    if (Array.isArray(c.reply_comment)) {
      for (const reply of c.reply_comment) {
        const parsedReply = parseComment(reply, c.cid);
        parsedReply.isReply = true;
        parsedReply.replyTo = c.user?.unique_id || null;
        if (!comments[parsedReply.cid]) {
          comments[parsedReply.cid] = parsedReply;
          newCount++;
        }
      }
    }
  }

  // 更新分页状态（仅从顶级评论 API）
  if (!isReplyApi) {
    state.cursor = body.cursor || state.cursor;
    state.hasMore = body.has_more === 1;
  }

  state.collectedCount = Object.keys(comments).length;

  // 注意: 不在此处设置 complete 状态。
  // 完成判定由 content script 的 noDataCount 逻辑控制，
  // 通过 collection_complete 消息通知，避免主列表结束但回复未展开时过早标记完成。

  try {
    await saveComments(comments);
  } catch (e) {
    console.error(LOG, 'Storage save failed (possible quota exceeded):', e.message);
    state.status = 'error';
  }
  await saveState(state);

  console.log(LOG, `+${newCount} comments (total: ${state.collectedCount})`);

  return {
    collectedCount: state.collectedCount,
    totalComments: state.totalComments,
    newCount,
  };
}

function extractParentCid(url) {
  try {
    const params = new URL(url, 'https://www.tiktok.com').searchParams;
    return params.get('comment_id') || null;
  } catch (e) {
    return null;
  }
}

// ─── 消息路由 ───

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  const { type, payload } = message;
  console.log(LOG, 'Message:', type);

  const handlers = {
    'api_data_received': function () { return handleApiData(payload.url, payload.body); },
    'start_collection': function () { return handleStartCollection(sender); },
    'stop_collection': function () { return handleStopCollection(sender); },
    'get_state': function () { return loadState(); },
    'export_csv': function () { return handleExportData('csv'); },
    'copy_all': function () { return handleExportData('text'); },
    'collection_complete': function () { return handleCollectionComplete(); },
    'sync_to_db': function () { return handleSyncToDb(); },
    'get_sync_history': function () { return getSyncHistory(); },
    'get_sync_config': function () { return getSyncConfig(); },
    'save_sync_config': function () { return saveSyncConfig(payload); },
  };

  const handler = handlers[type];
  if (handler) {
    handler().then(sendResponse);
    return true; // 异步响应
  }

  sendResponse({ error: 'Unknown message type' });
});

async function handleStartCollection(sender) {
  const state = getDefaultState();
  state.status = 'collecting';
  state.startedAt = Date.now();

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) {
    return { ok: false, error: 'no_active_tab', state: getDefaultState() };
  }
  state.videoUrl = tab.url;

  await saveState(state);
  await saveComments({});

  // 通知内容脚本开始滚动（先自动打开评论面板）
  const scrollResult = await Promise.race([
    new Promise(function (resolve) {
      chrome.tabs.sendMessage(tab.id, { type: 'begin_scroll' }, function (response) {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { ok: true });
        }
      });
    }),
    new Promise(function (resolve) {
      setTimeout(function () {
        resolve({ ok: false, error: 'begin_scroll_timeout' });
      }, 5000); // 比 PANEL_WAIT_TIMEOUT(3s) 略长
    }),
  ]);

  if (!scrollResult.ok) {
    state.status = 'idle';
    await saveState(state);
    console.warn(LOG, 'Collection failed to start:', scrollResult.error);
    return { ok: false, error: scrollResult.error, state };
  }

  console.log(LOG, 'Collection started');
  return { ok: true, state };
}

async function handleStopCollection(sender) {
  const state = await loadState();
  state.status = state.collectedCount > 0 ? 'complete' : 'idle';
  await saveState(state);

  // 通知内容脚本停止滚动
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'stop_scroll' }, function () {
      if (chrome.runtime.lastError) {
        console.warn(LOG, 'Send to content script failed:', chrome.runtime.lastError.message);
      }
    });
  }

  console.log(LOG, 'Collection stopped, collected:', state.collectedCount);
  return { ok: true, state };
}

async function handleCollectionComplete() {
  const state = await loadState();
  if (state.status === 'collecting') {
    state.status = 'complete';
    await saveState(state);
  }
  return { ok: true, state };
}

async function handleExportData(format) {
  const comments = await loadComments();
  const all = Object.values(comments);

  // 分离顶级评论和回复
  const topLevel = [];
  const replyMap = {};
  for (const c of all) {
    if (c.isReply) {
      const key = c.parentCid || '_orphan';
      if (!replyMap[key]) replyMap[key] = [];
      replyMap[key].push(c);
    } else {
      topLevel.push(c);
    }
  }

  // 按时间排序
  const byTime = function (a, b) { return a.createTime - b.createTime; };
  topLevel.sort(byTime);
  for (const key in replyMap) {
    replyMap[key].sort(byTime);
  }

  // 交错插入：顶级评论后紧跟其回复
  const sorted = [];
  for (const top of topLevel) {
    sorted.push(top);
    if (replyMap[top.cid]) {
      for (const r of replyMap[top.cid]) sorted.push(r);
    }
  }
  // 追加孤立回复（父评论未采集到的情况）
  if (replyMap._orphan) {
    for (const r of replyMap._orphan) sorted.push(r);
  }

  return { comments: sorted, format };
}

// ─── 同步到数据库 ───

async function handleSyncToDb() {
  const state = await loadState();
  const comments = await loadComments();
  const all = Object.values(comments);

  if (all.length === 0) {
    return { ok: false, error: 'no_comments' };
  }

  const videoId = state.videoId;
  if (!videoId) {
    return { ok: false, error: 'no_video_id' };
  }

  // 映射插件字段到数据库列
  const mapped = all.map(function (c) {
    return {
      comment_id: String(c.cid),
      parent_comment_id: c.parentCid || null,
      text: c.text || '',
      nickname: c.nickname || '',
      unique_id: c.username || '',
      user_avatar: '',
      digg_count: c.diggCount || 0,
      reply_count: c.replyCount || 0,
      comment_language: '',
      is_author_pinned: 0,
      comment_time: c.createTime
        ? new Date(c.createTime * 1000).toISOString().slice(0, 19).replace('T', ' ')
        : null,
    };
  });

  try {
    const config = await getSyncConfig();

    // 检查自定义 API 地址是否有 host 权限（需在 popup 端通过 chrome.permissions.request 授权）
    const apiOrigin = new URL(config.apiUrl).origin + '/*';
    const hasPermission = await chrome.permissions.contains({ origins: [apiOrigin] });
    if (!hasPermission) {
      return { ok: false, error: 'permission_needed', origin: apiOrigin };
    }

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
      },
      body: JSON.stringify({ video_id: videoId, comments: mapped }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(LOG, 'Sync API error:', response.status, text);
      return { ok: false, error: 'api_error', status: response.status };
    }

    const result = await response.json();
    console.log(LOG, 'Synced to DB:', result.imported, 'comments');

    // 记录同步历史
    await saveSyncHistory(videoId, result.imported);

    return { ok: result.success, imported: result.imported, total: result.total };
  } catch (e) {
    console.error(LOG, 'Sync failed:', e.message);
    return { ok: false, error: 'network_error', message: e.message };
  }
}

// ─── 同步历史 ───

const STORAGE_KEY_SYNC_HISTORY = 'tce_sync_history';
const MAX_SYNC_HISTORY = 20;

async function saveSyncHistory(videoId, count) {
  const result = await chrome.storage.local.get(STORAGE_KEY_SYNC_HISTORY);
  const history = result[STORAGE_KEY_SYNC_HISTORY] || [];
  history.unshift({ videoId, count, time: Date.now() });
  if (history.length > MAX_SYNC_HISTORY) history.length = MAX_SYNC_HISTORY;
  await chrome.storage.local.set({ [STORAGE_KEY_SYNC_HISTORY]: history });
}

async function getSyncHistory() {
  const result = await chrome.storage.local.get(STORAGE_KEY_SYNC_HISTORY);
  return result[STORAGE_KEY_SYNC_HISTORY] || [];
}

// ─── Service Worker 重启恢复 ───

chrome.runtime.onStartup.addListener(async function () {
  console.log(LOG, 'Service Worker restarted');
  const state = await loadState();
  // 如果之前在采集中，标记为中断
  if (state.status === 'collecting') {
    state.status = state.collectedCount > 0 ? 'complete' : 'idle';
    await saveState(state);
    console.log(LOG, 'Previous collection interrupted, state:', state.status);
  }
});

console.log(LOG, 'Service Worker initialized');
