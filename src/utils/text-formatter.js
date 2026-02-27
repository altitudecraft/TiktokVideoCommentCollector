/**
 * TikTok Comment Exporter - Text Formatter
 * 将评论格式化为纯文本（用于复制到剪贴板）。
 * 回复使用缩进表示层级关系。
 */

/**
 * 将 Unix 时间戳转为简短日期。
 */
function formatShortDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return month + '-' + day;
}

/**
 * 格式化评论列表为纯文本。
 * 顶级评论无缩进，回复缩进 4 空格。
 *
 * @param {Array<Object>} comments - 标准化评论对象数组
 * @returns {string} 格式化的纯文本
 */
function formatCommentsAsText(comments) {
  // 先分组：顶级评论和它们的回复
  const topLevel = [];
  const repliesMap = {}; // parentCid -> [replies]

  for (const c of comments) {
    if (c.isReply && c.parentCid) {
      if (!repliesMap[c.parentCid]) {
        repliesMap[c.parentCid] = [];
      }
      repliesMap[c.parentCid].push(c);
    } else {
      topLevel.push(c);
    }
  }

  // 按时间排序
  topLevel.sort(function (a, b) { return a.createTime - b.createTime; });

  const lines = [];

  for (const c of topLevel) {
    const likes = c.diggCount > 0 ? ' [' + c.diggCount + ' likes]' : '';
    const creator = c.isAuthorDigged ? ' *' : '';
    lines.push(
      '@' + c.username + ' (' + formatShortDate(c.createTime) + ')' + likes + creator
    );
    lines.push(c.text);

    // 附加回复
    const replies = repliesMap[c.cid];
    if (replies && replies.length > 0) {
      replies.sort(function (a, b) { return a.createTime - b.createTime; });
      for (const r of replies) {
        const rLikes = r.diggCount > 0 ? ' [' + r.diggCount + ' likes]' : '';
        lines.push('    @' + r.username + ' (' + formatShortDate(r.createTime) + ')' + rLikes);
        lines.push('    ' + r.text);
      }
    }

    lines.push(''); // 空行分隔
  }

  return lines.join('\n').trim();
}

/**
 * 复制文本到剪贴板。
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // 降级方案
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  }
}
