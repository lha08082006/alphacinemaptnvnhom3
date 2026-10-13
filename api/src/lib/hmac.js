'use strict';

/**
 * Chữ ký webhook: HMAC-SHA256 trên chuỗi `${timestamp}.${rawBody}`.
 *   - timestamp: giây Unix (chuỗi số) gửi trong header X-Gateway-Timestamp
 *   - signature: hex 64 ký tự gửi trong header X-Gateway-Signature
 *
 * LƯU Ý: file này có MỘT BẢN Y HỆT ở gateway-mock/src/lib/hmac.js.
 * Hai dịch vụ không import chéo code của nhau — sửa một bên thì sửa cả bên kia.
 *
 * Độ lệch thời gian được kiểm theo GIỜ THẬT (Date.now), không theo giờ ảo của clock.js:
 * giờ ảo chỉ tồn tại trong Beta, cổng thanh toán bên ngoài không biết đến nó.
 */

const crypto = require('crypto');

const HEADER_TIMESTAMP = 'X-Gateway-Timestamp';
const HEADER_SIGNATURE = 'X-Gateway-Signature';

function realNowSec() {
  return Math.floor(Date.now() / 1000);
}

function sign(secret, timestamp, rawBody) {
  if (!secret) throw new TypeError('Thiếu secret để ký');
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
}

/** Tạo sẵn 2 header để gửi kèm request webhook. */
function signHeaders(secret, rawBody, timestamp = realNowSec()) {
  const ts = String(timestamp);
  return { [HEADER_TIMESTAMP]: ts, [HEADER_SIGNATURE]: sign(secret, ts, rawBody) };
}

/**
 * @returns {{ ok: true } | { ok: false, reason: 'MISSING_HEADERS'|'BAD_TIMESTAMP'|'TIMESTAMP_OUT_OF_TOLERANCE'|'BAD_SIGNATURE' }}
 */
function verify({ secret, timestamp, signature, rawBody, toleranceSec, nowSec = realNowSec() }) {
  if (!timestamp || !signature || typeof rawBody !== 'string') return { ok: false, reason: 'MISSING_HEADERS' };

  const ts = String(timestamp);
  if (!/^\d{1,12}$/.test(ts)) return { ok: false, reason: 'BAD_TIMESTAMP' };
  if (Math.abs(nowSec - Number(ts)) > toleranceSec) return { ok: false, reason: 'TIMESTAMP_OUT_OF_TOLERANCE' };

  if (!/^[0-9a-f]{64}$/i.test(signature)) return { ok: false, reason: 'BAD_SIGNATURE' };
  const expected = Buffer.from(sign(secret, ts, rawBody), 'hex');
  const given = Buffer.from(signature, 'hex');
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }
  return { ok: true };
}

module.exports = { HEADER_TIMESTAMP, HEADER_SIGNATURE, sign, signHeaders, verify };
