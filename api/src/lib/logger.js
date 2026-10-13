'use strict';

const { env } = require('../config/env');

/**
 * Logger gọn: mỗi dòng là 1 JSON (dễ lọc theo requestId khi demo giao dịch treo).
 * ts là giờ THẬT của máy (log vận hành); thời điểm nghiệp vụ nằm trong dữ liệu (clock.nowIso()).
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const threshold = LEVELS[env.LOG_LEVEL] ?? LEVELS.info;

function write(level, msg, fields = {}) {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

module.exports = {
  debug: (msg, fields) => write('debug', msg, fields),
  info: (msg, fields) => write('info', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  error: (msg, fields) => write('error', msg, fields),
};
