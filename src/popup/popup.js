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
    chkReplies: document.getElementById('chkReplies'),
    message: document.getElementById('message'),
    btnHelp: document.getElementById('btnHelp'),
    helpIcon: document.getElementById('helpIcon'),
    helpContent: document.getElementById('helpContent'),
  };

  let pollTimer = null;
  let collectionStartTime = null;

  // ─── 初始化 ───
  async function init() {
    // 绑定使用说明折叠
    dom.btnHelp.addEventListener('click', toggleHelp);

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
    const total = state.totalComments || 0;

    dom.collectedCount.textContent = collected;
    dom.totalCount.textContent = total > 0 ? total : '--';

    // 进度百分比
    const pct = total > 0
      ? Math.min(100, Math.round((collected / total) * 100))
      : 0;
    dom.progressBar.style.width = pct + '%';
    dom.percentText.textContent = total > 0 ? pct + '%' : '';

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
        }
        break;
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
        };
        showMessage(errorMessages[result.error] || '评论面板打开失败，请手动点击评论图标后重试', 'error');
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
