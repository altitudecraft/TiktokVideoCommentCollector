/**
 * TikTok Comment Exporter - Popup Logic
 * 管理 Popup 界面交互：采集控制、进度更新、导出/复制。
 */
(function () {
  const LOG = '[TCE]';

  // DOM 元素
  const dom = {
    mainContent: document.getElementById('mainContent'),
    guideContent: document.getElementById('guideContent'),
    videoDetail: document.getElementById('videoDetail'),
    collectedCount: document.getElementById('collectedCount'),
    totalCount: document.getElementById('totalCount'),
    percentText: document.getElementById('percentText'),
    progressBar: document.getElementById('progressBar'),
    statusText: document.getElementById('statusText'),
    btnStart: document.getElementById('btnStart'),
    btnStop: document.getElementById('btnStop'),
    btnExport: document.getElementById('btnExport'),
    btnCopy: document.getElementById('btnCopy'),
    btnSync: document.getElementById('btnSync'),
    syncInfo: document.getElementById('syncInfo'),
    chkReplies: document.getElementById('chkReplies'),
    message: document.getElementById('message'),
    btnHelp: document.getElementById('btnHelp'),
    helpIcon: document.getElementById('helpIcon'),
    helpContent: document.getElementById('helpContent'),
    btnSettings: document.getElementById('btnSettings'),
    settingsIcon: document.getElementById('settingsIcon'),
    settingsContent: document.getElementById('settingsContent'),
    inputApiUrl: document.getElementById('inputApiUrl'),
    inputApiKey: document.getElementById('inputApiKey'),
    btnSaveConfig: document.getElementById('btnSaveConfig'),
  };

  let pollTimer = null;
  let collectionStartTime = null;

  // ─── 初始化 ───
  async function init() {
    // 绑定使用说明和设置折叠
    dom.btnHelp.addEventListener('click', toggleHelp);
    dom.btnSettings.addEventListener('click', toggleSettings);
    dom.btnSaveConfig.addEventListener('click', saveConfig);
    loadConfig();

    // 检查是否在 TikTok 页面
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (!tab || !tab.url || !tab.url.includes('tiktok.com')) {
      showGuide();
      return;
    }

    // 检查是否是视频页面
    const urlMatch = tab.url.match(/@([^/]+)\/video\/(\d+)/);
    if (!urlMatch) {
      showGuide();
      return;
    }

    // 显示视频信息
    dom.videoDetail.textContent = '@' + urlMatch[1] + ' · ' + urlMatch[2];

    // 获取当前状态
    await refreshState();
    await refreshSyncInfo();

    // 开始轮询状态
    pollTimer = setInterval(refreshState, 1000);
  }

  function showGuide() {
    dom.mainContent.style.display = 'none';
    dom.guideContent.style.display = 'block';
  }

  // ─── 使用说明折叠 ───
  function toggleHelp() {
    const isOpen = dom.helpContent.style.display !== 'none';
    dom.helpContent.style.display = isOpen ? 'none' : 'block';
    dom.helpIcon.classList.toggle('tce-popup__help-icon--open', !isOpen);
  }

  // ─── 状态刷新 ───
  async function refreshState() {
    try {
      const state = await sendMessage({ type: 'get_state' });
      updateUI(state);
    } catch (e) {
      console.warn(LOG, 'Refresh state failed:', e.message);
    }
  }

  function formatElapsed(ms) {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function updateUI(state) {
    if (!state) return;

    const collected = state.collectedCount || 0;
    // 总数 = 顶级评论数 + 预期回复数（近似值，内联回复可能导致微小偏差）
    const total = (state.totalComments || 0) + (state.totalRepliesExpected || 0);
    // 采集完成时，以实际采集数为准（回复估计值可能不精确）
    const displayTotal = state.status === 'complete' ? Math.max(total, collected) : total;

    dom.collectedCount.textContent = collected;
    dom.totalCount.textContent = displayTotal > 0 ? displayTotal : '--';

    // 进度百分比（完成时强制 100%）
    const pct = state.status === 'complete'
      ? 100
      : (displayTotal > 0 ? Math.min(100, Math.round((collected / displayTotal) * 100)) : 0);
    dom.progressBar.style.width = pct + '%';
    dom.percentText.textContent = displayTotal > 0 ? pct + '%' : '';

    // 状态文本和按钮
    if (state.status !== 'collecting') {
      collectionStartTime = null;
    }

    switch (state.status) {
      case 'collecting': {
        if (!collectionStartTime) collectionStartTime = state.startedAt || Date.now();
        const elapsed = formatElapsed(Date.now() - collectionStartTime);
        dom.statusText.textContent = '采集中 · 耗时 ' + elapsed;
        dom.btnStart.style.display = 'none';
        dom.btnStop.style.display = 'block';
        dom.btnExport.disabled = true;
        dom.btnCopy.disabled = true;
        dom.btnSync.disabled = true;
        dom.progressBar.classList.remove('tce-progress__bar--complete');
        break;
      }

      case 'complete':
        dom.statusText.textContent = '采集完成！共 ' + collected + ' 条评论';
        dom.btnStart.style.display = 'block';
        dom.btnStart.textContent = '重新采集';
        dom.btnStop.style.display = 'none';
        dom.btnExport.disabled = false;
        dom.btnCopy.disabled = false;
        dom.btnSync.disabled = false;
        dom.progressBar.classList.add('tce-progress__bar--complete');
        break;

      case 'error':
        dom.statusText.textContent = '采集出错，请刷新页面重试';
        dom.btnStart.style.display = 'block';
        dom.btnStart.textContent = '重新采集';
        dom.btnStop.style.display = 'none';
        break;

      default: // idle
        dom.statusText.textContent = '';
        dom.btnStart.style.display = 'block';
        dom.btnStart.textContent = '开始采集评论';
        dom.btnStop.style.display = 'none';
        if (collected > 0) {
          dom.btnExport.disabled = false;
          dom.btnCopy.disabled = false;
          dom.btnSync.disabled = false;
        }
        break;
    }

    // 同步进度显示（SW 分批同步时通过 session storage 传递进度）
    if (state.syncProgress) {
      var sp = state.syncProgress;
      dom.btnSync.textContent = '同步中 ' + sp.batch + '/' + sp.totalBatches + ' 批...';
      dom.btnSync.disabled = true;
    }
  }

  // ─── 事件处理 ───

  dom.btnStart.addEventListener('click', async function () {
    dom.btnStart.disabled = true;
    showMessage('');
    try {
      const result = await sendMessage({ type: 'start_collection' });
      if (result && !result.ok) {
        // 评论面板打开失败
        const errorMessages = {
          comment_button_not_found: '未找到评论按钮，请先点击视频下方的评论图标打开评论区',
          panel_not_opened: '评论区未能自动打开，请手动点击视频下方的评论图标',
          begin_scroll_timeout: '与页面通信超时，请刷新页面后重试',
          no_active_tab: '未找到活动标签页，请确保在 TikTok 视频页面使用',
          content_script_not_loaded: '页面脚本未加载，请刷新页面后重试（Ctrl+R）',
        };
        showMessage(errorMessages[result.error] || '启动失败（' + result.error + '），请刷新页面后重试', 'error');
      } else {
        collectionStartTime = Date.now();
        await refreshState();
      }
    } catch (e) {
      showMessage('启动失败: ' + e.message, 'error');
    }
    dom.btnStart.disabled = false;
  });

  dom.btnStop.addEventListener('click', async function () {
    dom.btnStop.disabled = true;
    try {
      await sendMessage({ type: 'stop_collection' });
      await refreshState();
    } catch (e) {
      showMessage('停止失败: ' + e.message, 'error');
    }
    dom.btnStop.disabled = false;
  });

  dom.btnExport.addEventListener('click', async function () {
    dom.btnExport.disabled = true;
    showMessage('');
    try {
      const result = await sendMessage({ type: 'export_csv' });
      const comments = filterReplies(result.comments);

      if (comments.length === 0) {
        showMessage('没有可导出的评论', 'error');
        dom.btnExport.disabled = false;
        return;
      }

      const state = await sendMessage({ type: 'get_state' });
      downloadCsv(comments, state.videoId);
      showMessage('已导出 ' + comments.length + ' 条评论', 'success');
    } catch (e) {
      showMessage('导出失败: ' + e.message, 'error');
    }
    dom.btnExport.disabled = false;
  });

  dom.btnCopy.addEventListener('click', async function () {
    dom.btnCopy.disabled = true;
    showMessage('');
    try {
      const result = await sendMessage({ type: 'copy_all' });
      const comments = filterReplies(result.comments);

      if (comments.length === 0) {
        showMessage('没有可复制的评论', 'error');
        dom.btnCopy.disabled = false;
        return;
      }

      const text = formatCommentsAsText(comments);
      const ok = await copyToClipboard(text);
      if (ok) {
        showMessage('已复制 ' + comments.length + ' 条评论', 'success');
      } else {
        showMessage('复制失败，请重试', 'error');
      }
    } catch (e) {
      showMessage('复制失败: ' + e.message, 'error');
    }
    dom.btnCopy.disabled = false;
  });

  dom.btnSync.addEventListener('click', async function () {
    // 获取评论数量用于确认
    const state = await sendMessage({ type: 'get_state' });
    const count = state.collectedCount || 0;
    if (!confirm('确认将 ' + count + ' 条评论同步到数据库？')) return;

    dom.btnSync.disabled = true;
    dom.btnSync.textContent = '同步中...';
    showMessage('');
    try {
      let result = await sendMessage({ type: 'sync_to_db' });

      // 自定义 API 地址需要用户授权 host 权限
      if (result && result.error === 'permission_needed') {
        const granted = await chrome.permissions.request({ origins: [result.origin] });
        if (granted) {
          result = await sendMessage({ type: 'sync_to_db' });
        } else {
          showMessage('需要访问权限才能同步到自定义 API 地址', 'error');
          dom.btnSync.textContent = '同步到数据库';
          dom.btnSync.disabled = false;
          return;
        }
      }

      if (result && result.ok) {
        showMessage('已写入 ' + result.imported + ' 条评论到数据库（含更新）', 'success');
        await refreshSyncInfo();
      } else {
        const errorMessages = {
          no_comments: '没有可同步的评论',
          no_video_id: '未检测到视频 ID',
          api_error: '服务器返回错误 (HTTP ' + (result.status || '') + ')',
          network_error: '无法连接到服务器，请检查网络',
        };
        showMessage(errorMessages[result.error] || '同步失败: ' + (result.message || result.error), 'error');
      }
    } catch (e) {
      showMessage('同步失败: ' + e.message, 'error');
    }
    dom.btnSync.textContent = '同步到数据库';
    dom.btnSync.disabled = false;
  });

  // ─── 同步设置 ───

  function toggleSettings() {
    const isOpen = dom.settingsContent.style.display !== 'none';
    dom.settingsContent.style.display = isOpen ? 'none' : 'block';
    dom.settingsIcon.classList.toggle('tce-popup__help-icon--open', !isOpen);
  }

  async function loadConfig() {
    try {
      const config = await sendMessage({ type: 'get_sync_config' });
      if (config) {
        dom.inputApiUrl.value = config.apiUrl || '';
        dom.inputApiKey.value = config.apiKey || '';
      }
    } catch (e) {
      // 静默
    }
  }

  async function saveConfig() {
    const apiUrl = dom.inputApiUrl.value.trim();
    const apiKey = dom.inputApiKey.value.trim();
    if (!apiUrl) {
      showMessage('请输入 API 地址', 'error');
      return;
    }
    try {
      await sendMessage({ type: 'save_sync_config', payload: { apiUrl, apiKey } });
      showMessage('设置已保存', 'success');
    } catch (e) {
      showMessage('保存失败: ' + e.message, 'error');
    }
  }

  // ─── 同步历史 ───

  async function refreshSyncInfo() {
    try {
      const history = await sendMessage({ type: 'get_sync_history' });
      if (history && history.length > 0) {
        const last = history[0];
        const date = new Date(last.time);
        const timeStr = date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        dom.syncInfo.textContent = '上次同步: ' + timeStr + ' · ' + last.count + ' 条';
        dom.syncInfo.style.display = 'block';
      }
    } catch (e) {
      // 静默失败
    }
  }

  // ─── 工具函数 ───

  function filterReplies(comments) {
    if (dom.chkReplies.checked) return comments;
    return comments.filter(function (c) { return !c.isReply; });
  }

  function showMessage(text, type) {
    dom.message.textContent = text;
    dom.message.className = 'tce-popup__message';
    if (type) dom.message.classList.add('tce-popup__message--' + type);
  }

  function sendMessage(msg) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(msg, function (response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  // 清理定时器
  window.addEventListener('unload', function () {
    if (pollTimer) clearInterval(pollTimer);
  });

  // 启动
  init();
})();
