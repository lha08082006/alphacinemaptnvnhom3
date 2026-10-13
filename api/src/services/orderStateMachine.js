'use strict';

const { AppError } = require('../lib/errors');

/**
 * Máy trạng thái của đơn (beta_orders.status) — theo SPEC mục C.
 * Là nguồn sự thật DUY NHẤT về việc "trạng thái nào được chuyển sang trạng thái nào".
 * Mọi service đổi trạng thái đơn phải gọi assertTransition() trước khi ghi CSDL.
 */
const ORDER_STATUS = Object.freeze({
  HOLDING: 'HOLDING',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  PENDING_VERIFY: 'PENDING_VERIFY',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
});

const S = ORDER_STATUS;

/**
 * Bảng chuyển trạng thái. Các cạnh đánh dấu [MỞ RỘNG] không vẽ trong sơ đồ SPEC mục C
 * nhưng được suy ra từ quy tắc nghiệp vụ — xem docs/ARCHITECTURE.md mục 6.
 */
const TRANSITIONS = Object.freeze({
  [S.HOLDING]: [S.AWAITING_PAYMENT, S.EXPIRED],
  [S.AWAITING_PAYMENT]: [S.PAID, S.FAILED, S.CANCELLED, S.PENDING_VERIFY],
  [S.PENDING_VERIFY]: [
    S.PAID, // BR-10: callback SUCCESS đến muộn
    S.REFUND_PENDING, // BR-06/07: đối soát thấy đã trừ tiền nhưng không có vé
    S.FAILED, // [MỞ RỘNG] đối soát xác nhận cổng KHÔNG trừ tiền -> đóng đơn, nhả ghế
  ],
  [S.FAILED]: [S.REFUND_PENDING], // [MỞ RỘNG] BR-06 quét FAILED có txnId; BR-12 hoàn thủ công (AS-IS)
  [S.EXPIRED]: [S.REFUND_PENDING], // [MỞ RỘNG] BR-06 quét EXPIRED có txnId
  [S.REFUND_PENDING]: [S.REFUNDED],
  [S.PAID]: [],
  [S.CANCELLED]: [],
  [S.REFUNDED]: [],
});

// Trạng thái chỉ tồn tại ở chế độ TO-BE (SPEC: "PENDING_VERIFY (chỉ TO-BE)")
const TOBE_ONLY = Object.freeze([S.PENDING_VERIFY]);

const TERMINAL_STATUSES = Object.freeze(
  Object.keys(TRANSITIONS).filter((s) => TRANSITIONS[s].length === 0)
);

function isOrderStatus(s) {
  return Object.prototype.hasOwnProperty.call(TRANSITIONS, s);
}

function isTerminal(s) {
  return TERMINAL_STATUSES.includes(s);
}

/**
 * @param {string} from
 * @param {string} to
 * @param {{ mode?: 'ASIS'|'TOBE' }} [opts] nếu truyền mode='ASIS' thì chặn chuyển vào trạng thái chỉ có ở TO-BE
 */
function canTransition(from, to, opts = {}) {
  if (!isOrderStatus(from) || !isOrderStatus(to)) return false;
  if (opts.mode === 'ASIS' && TOBE_ONLY.includes(to)) return false;
  return TRANSITIONS[from].includes(to);
}

function assertTransition(from, to, opts = {}) {
  if (!canTransition(from, to, opts)) {
    throw new AppError('INVALID_STATE_TRANSITION', null, null, {
      from,
      to,
      allowed: isOrderStatus(from) ? nextStatuses(from, opts) : [],
    });
  }
  return to;
}

function nextStatuses(from, opts = {}) {
  if (!isOrderStatus(from)) return [];
  return TRANSITIONS[from].filter((to) => canTransition(from, to, opts));
}

module.exports = {
  ORDER_STATUS,
  TRANSITIONS,
  TERMINAL_STATUSES,
  isOrderStatus,
  isTerminal,
  canTransition,
  assertTransition,
  nextStatuses,
};
