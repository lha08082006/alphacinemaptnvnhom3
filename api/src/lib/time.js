'use strict';

/**
 * Thời gian: lưu & truyền dạng chuỗi ISO-8601 UTC (vd "2026-10-05T17:30:00.000Z").
 * Chỉ đổi sang giờ Asia/Ho_Chi_Minh khi HIỂN THỊ (formatVn).
 * Các hàm ở đây là hàm thuần trên mốc thời gian đầu vào — không tự đọc giờ hệ thống.
 */

const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

function toMs(value) {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  if (Number.isNaN(ms)) throw new TypeError(`Mốc thời gian không hợp lệ: ${value}`);
  return ms;
}

function toIso(value) {
  return new Date(toMs(value)).toISOString();
}

function isIsoUtc(s) {
  return typeof s === 'string' && ISO_UTC_RE.test(s) && !Number.isNaN(Date.parse(s));
}

function addSeconds(iso, seconds) {
  return new Date(toMs(iso) + seconds * 1000).toISOString();
}

function addMinutes(iso, minutes) {
  return addSeconds(iso, minutes * 60);
}

/** Số giây từ earlier đến later (làm tròn xuống). */
function diffSeconds(laterIso, earlierIso) {
  return Math.floor((toMs(laterIso) - toMs(earlierIso)) / 1000);
}

function isBefore(aIso, bIso) {
  return toMs(aIso) < toMs(bIso);
}

const vnFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: VN_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** "2026-10-05T17:30:00.000Z" -> "06/10/2026 00:30" (giờ Việt Nam) */
function formatVn(iso, { withSeconds = false } = {}) {
  const p = Object.fromEntries(vnFormatter.formatToParts(new Date(toMs(iso))).map((x) => [x.type, x.value]));
  const time = withSeconds ? `${p.hour}:${p.minute}:${p.second}` : `${p.hour}:${p.minute}`;
  return `${p.day}/${p.month}/${p.year} ${time}`;
}

module.exports = {
  VN_TIMEZONE,
  ISO_UTC_RE,
  toIso,
  isIsoUtc,
  addSeconds,
  addMinutes,
  diffSeconds,
  isBefore,
  formatVn,
};
