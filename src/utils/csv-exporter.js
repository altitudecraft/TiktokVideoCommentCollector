/**
 * TikTok Comment Exporter - CSV Exporter
 * 生成 BOM + UTF-8 编码的 CSV 文件并触发下载。
 */

const CSV_HEADERS = [
  'comment_id',
  'username',
  'nickname',
  'comment',
  'likes',
  'replies',
  'time',
  'is_reply',
  'reply_to',
  'creator_liked',
];

/**
 * 转义 CSV 字段：防止公式注入（=+\-@\t\r 前缀），处理逗号/换行/双引号。
 * @param {*} value - 字段值
 * @param {boolean} isUserInput - 是否为用户输入（需防公式注入）
 */
function escapeCsvField(value, isUserInput) {
  let str = String(value == null ? '' : value);
  if (isUserInput && /^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  if (/[,\n\r"]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * 将 Unix 时间戳转为可读日期字符串。
 */
function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * 生成 CSV 内容字符串。
 * @param {Array<Object>} comments - 标准化评论对象数组
 * @returns {string} CSV 文本（含 BOM）
 */
function generateCsvContent(comments) {
  const rows = [CSV_HEADERS.join(',')];

  for (const c of comments) {
    const row = [
      escapeCsvField(c.cid, false),
      escapeCsvField(c.username, true),
      escapeCsvField(c.nickname, true),
      escapeCsvField(c.text, true),
      Number(c.diggCount) || 0,
      Number(c.replyCount) || 0,
      escapeCsvField(formatTimestamp(c.createTime), false),
      c.isReply ? 'yes' : 'no',
      escapeCsvField(c.replyTo || '', true),
      c.isAuthorDigged ? 'yes' : 'no',
    ];
    rows.push(row.join(','));
  }

  // BOM + UTF-8
  return '\uFEFF' + rows.join('\n');
}

/**
 * 触发 CSV 文件下载。
 * @param {Array<Object>} comments - 标准化评论对象数组
 * @param {string} videoId - 用于文件名
 */
function downloadCsv(comments, videoId) {
  const csv = generateCsvContent(comments);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const filename = 'tiktok_comments_' + (videoId || 'export') + '.csv';

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
