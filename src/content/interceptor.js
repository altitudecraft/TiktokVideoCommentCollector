/**
 * TikTok Comment Exporter - Fetch Interceptor
 * 运行在页面上下文（MAIN world），覆写 fetch 拦截评论 API 响应。
 * 通过 CustomEvent 将数据传递给 Content Script。
 */
(function () {
  // 防重入：避免重复注入
  if (window.__tceInterceptor) return;
  window.__tceInterceptor = true;

  const API_COMMENT_LIST = '/api/comment/list/';
  const EVENT_NAME = 'tce_api_data';

  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

      if (url.includes(API_COMMENT_LIST)) {
        // 克隆响应，避免消费原始流
        const cloned = response.clone();
        cloned.json().then(function (data) {
          window.dispatchEvent(new CustomEvent(EVENT_NAME, {
            detail: {
              url: url,
              body: data,
              timestamp: Date.now(),
            },
          }));
        }).catch(function () {
          // 解析失败时静默忽略，不影响页面正常运行
        });
      }
    } catch (e) {
      // 拦截逻辑出错时不影响原始请求
    }

    return response;
  };
})();
