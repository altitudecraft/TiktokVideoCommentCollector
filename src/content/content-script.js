/**
 * TikTok Comment Exporter - Content Script
 * 在 TikTok 页面注入拦截器、监听 API 数据、控制自动滚动。
 * 运行时机: document_start
 */
(function () {
  const LOG = '[TCE]';
  const EVENT_NAME = 'tce_api_data';
  const SCROLL_INTERVAL_MIN = 800;
  const SCROLL_INTERVAL_MAX = 1200;
  const NO_DATA_MAX = 3;
  const MAX_CONTAINER_RETRIES = 10;
  const PANEL_WAIT_TIMEOUT = 3000;
  const PANEL_POLL_INTERVAL = 200;

  let scrolling = false;
  let noDataCount = 0;
  let lastCommentCount = 0;
  let scrollTimer = null;
  let containerRetries = 0;

  // ─── 注入拦截器到页面上下文 ───
  function injectInterceptor() {
    if (document.querySelector('script[data-tce-interceptor]')) return;
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/content/interceptor.js');
    script.dataset.tceInterceptor = 'true';
    (document.head || document.documentElement).appendChild(script);
    console.log(LOG, 'Interceptor injected');
  }

  // 在 document_start 阶段尽早注入
  injectInterceptor();

  // ─── 监听拦截器派发的 API 数据 ───
  window.addEventListener(EVENT_NAME, function (event) {
    const { url, body, timestamp } = event.detail;
    console.log(LOG, 'API data received:', url.substring(0, 80));

    // 转发给 Background
    chrome.runtime.sendMessage({
      type: 'api_data_received',
      payload: { url, body, timestamp },
    }, function (response) {
      if (chrome.runtime.lastError) {
        console.warn(LOG, 'Send to background failed:', chrome.runtime.lastError.message);
        return;
      }
      // 更新本地计数用于滚动判断
      if (response && response.collectedCount !== undefined) {
        if (response.collectedCount > lastCommentCount) {
          noDataCount = 0;
        } else {
          noDataCount++;
        }
        lastCommentCount = response.collectedCount;
      }
    });
  });

  // ─── 评论面板检测与自动打开 ───

  function isCommentPanelOpen() {
    // 检查评论面板是否已打开
    if (document.querySelector('[class*="DivCommentMain"]')) return true;
    if (document.querySelector('[data-e2e="comment-list"]')) return true;
    if (document.querySelector('[class*="CommentList"]')) return true;
    return false;
  }

  function findCommentButton() {
    // 策略1: data-e2e="comment-icon" 的最近按钮祖先
    const commentIcon = document.querySelector('[data-e2e="comment-icon"]');
    if (commentIcon) {
      const btn = commentIcon.closest('button') || commentIcon.parentElement?.closest('button');
      if (btn) return btn;
    }

    // 策略2: aria-label 包含 "comment"
    const ariaBtn = document.querySelector('button[aria-label*="comment" i]');
    if (ariaBtn) return ariaBtn;

    // 策略3: ButtonActionItem 类中包含评论 SVG path 的按钮
    const actionBtns = document.querySelectorAll('[class*="ButtonActionItem"]');
    for (const btn of actionBtns) {
      const svg = btn.querySelector('svg');
      if (svg) {
        const path = svg.querySelector('path');
        if (path && path.getAttribute('d') && path.getAttribute('d').includes('21.5c0-10.22')) {
          return btn;
        }
      }
    }

    return null;
  }

  function waitForPanel(timeout) {
    return new Promise(function (resolve) {
      if (isCommentPanelOpen()) {
        resolve(true);
        return;
      }
      const start = Date.now();
      const timer = setInterval(function () {
        if (isCommentPanelOpen()) {
          clearInterval(timer);
          resolve(true);
        } else if (Date.now() - start >= timeout) {
          clearInterval(timer);
          resolve(false);
        }
      }, PANEL_POLL_INTERVAL);
    });
  }

  async function ensureCommentPanelOpen() {
    if (isCommentPanelOpen()) {
      console.log(LOG, 'Comment panel already open');
      return { ok: true };
    }

    console.log(LOG, 'Comment panel not open, searching for button...');
    const btn = findCommentButton();
    if (!btn) {
      console.warn(LOG, 'Comment button not found');
      return { ok: false, error: 'comment_button_not_found' };
    }

    console.log(LOG, 'Clicking comment button...');
    btn.click();

    const opened = await waitForPanel(PANEL_WAIT_TIMEOUT);
    if (opened) {
      console.log(LOG, 'Comment panel opened successfully');
      return { ok: true, autoOpened: true };
    }

    console.warn(LOG, 'Comment panel did not open after click');
    return { ok: false, error: 'panel_not_opened' };
  }

  // ─── 自动滚动 ───
  function isScrollable(el) {
    const overflowY = window.getComputedStyle(el).overflowY;
    return overflowY === 'scroll' || overflowY === 'auto';
  }

  function getScrollContainer() {
    // 优先用 class 名匹配实测的 DivCommentMain
    const candidates = document.querySelectorAll('[class*="DivCommentMain"]');
    for (const el of candidates) {
      if (isScrollable(el)) return el;
    }
    // 降级：查找评论区域内第一个可滚动祖先
    const commentArea = document.querySelector('[data-e2e="comment-list"]') ||
                        document.querySelector('[class*="CommentList"]');
    if (commentArea) {
      let el = commentArea.parentElement;
      while (el) {
        if (isScrollable(el)) return el;
        el = el.parentElement;
      }
    }
    return null;
  }

  function randomDelay() {
    return SCROLL_INTERVAL_MIN + Math.random() * (SCROLL_INTERVAL_MAX - SCROLL_INTERVAL_MIN);
  }

  function doScroll() {
    if (!scrolling) return;

    const container = getScrollContainer();
    if (!container) {
      containerRetries++;
      if (containerRetries >= MAX_CONTAINER_RETRIES) {
        console.error(LOG, 'Scroll container not found after', MAX_CONTAINER_RETRIES, 'retries, stopping');
        stopScrolling();
        chrome.runtime.sendMessage({ type: 'collection_complete' });
        return;
      }
      console.warn(LOG, 'Scroll container not found, retry', containerRetries, '/', MAX_CONTAINER_RETRIES);
      scrollTimer = setTimeout(doScroll, 1000);
      return;
    }
    containerRetries = 0;

    // 检查停止条件
    if (noDataCount >= NO_DATA_MAX) {
      console.log(LOG, 'No new data after', NO_DATA_MAX, 'scrolls, stopping');
      stopScrolling();
      chrome.runtime.sendMessage({ type: 'collection_complete' });
      return;
    }

    // 点击 "View X replies" 按钮（展开回复）
    clickViewRepliesButtons();

    // 执行滚动
    container.scrollTop = container.scrollHeight;

    scrollTimer = setTimeout(doScroll, randomDelay());
  }

  function clickViewRepliesButtons() {
    // 匹配 "View N replies" 或 "View N more replies" 按钮
    const buttons = document.querySelectorAll(
      '[class*="ReplyAction"] button, [data-e2e="view-more-replies"]'
    );
    for (const btn of buttons) {
      if (btn.dataset.tceClicked) continue;
      const text = btn.textContent || '';
      if (/view\s+\d+\s+(more\s+)?repl/i.test(text)) {
        btn.dataset.tceClicked = '1';
        btn.click();
      }
    }
  }

  function startScrolling() {
    if (scrolling) return;
    scrolling = true;
    noDataCount = 0;
    lastCommentCount = 0;
    containerRetries = 0;
    console.log(LOG, 'Auto-scroll started');
    doScroll();
  }

  function stopScrolling() {
    scrolling = false;
    if (scrollTimer) {
      clearTimeout(scrollTimer);
      scrollTimer = null;
    }
    console.log(LOG, 'Auto-scroll stopped');
  }

  // ─── 消息监听（来自 Background） ───
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    console.log(LOG, 'Message received:', message.type);

    if (message.type === 'begin_scroll') {
      ensureCommentPanelOpen().then(function (result) {
        if (result.ok) {
          startScrolling();
          sendResponse({ ok: true, autoOpened: result.autoOpened || false });
        } else {
          sendResponse({ ok: false, error: result.error });
        }
      });
      return true; // 异步响应
    } else if (message.type === 'check_comment_panel') {
      sendResponse({ panelOpen: isCommentPanelOpen() });
    } else if (message.type === 'stop_scroll') {
      stopScrolling();
      sendResponse({ ok: true });
    } else if (message.type === 'get_page_info') {
      // 从页面提取视频信息
      sendResponse({
        url: window.location.href,
        title: document.title,
      });
    }

    return true; // 保持消息通道打开
  });

  console.log(LOG, 'Content script loaded on:', window.location.href);
})();
