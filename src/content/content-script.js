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
      startScrolling();
      sendResponse({ ok: true });
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
