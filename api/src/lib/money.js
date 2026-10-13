'use strict';

const { z } = require('zod');

/**
 * Tiền luôn là SỐ NGUYÊN đồng (VND). Không dùng số thập phân ở bất cứ đâu.
 */

const vndSchema = z
  .number({ invalid_type_error: 'Số tiền phải là số' })
  .int('Số tiền phải là số nguyên (đồng)')
  .nonnegative('Số tiền không được âm')
  .max(Number.MAX_SAFE_INTEGER);

function isVnd(n) {
  return Number.isSafeInteger(n) && n >= 0;
}

/** 90000 -> "90.000đ" ; -15000 -> "-15.000đ" */
function formatVnd(n) {
  if (!Number.isSafeInteger(n)) throw new TypeError('formatVnd chỉ nhận số nguyên (đồng)');
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${digits}đ`;
}

function sumVnd(values) {
  return values.reduce((acc, v) => {
    if (!Number.isSafeInteger(v)) throw new TypeError('sumVnd chỉ nhận số nguyên (đồng)');
    return acc + v;
  }, 0);
}

module.exports = { vndSchema, isVnd, formatVnd, sumVnd };
