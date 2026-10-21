'use strict';

const crypto = require('crypto');

/**
 * Bảng ký tự cho mã định danh: chữ HOA + số, BỎ các ký tự dễ nhầm O, 0, I, 1.
 * 32 ký tự -> crypto.randomInt cho phân phối đều, không thiên lệch.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CHARSET = '[A-HJ-NP-Z2-9]';

const ID_FORMATS = Object.freeze({
  order: { prefix: 'BC', length: 8 },
  txn: { prefix: 'GW', length: 10 },
  refund: { prefix: 'RF', length: 8 },
  ticket: { prefix: 'CS', length: 6 },
});

const ID_PATTERNS = Object.freeze(
  Object.fromEntries(
    Object.entries(ID_FORMATS).map(([k, f]) => [k, new RegExp(`^${f.prefix}${CHARSET}{${f.length}}$`)])
  )
);

function randomCode(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

function make(kind) {
  const f = ID_FORMATS[kind];
  return f.prefix + randomCode(f.length);
}

const newOrderId = () => make('order');
const newTxnId = () => make('txn');
const newRefundId = () => make('refund');
const newTicketId = () => make('ticket');

const isOrderId = (s) => typeof s === 'string' && ID_PATTERNS.order.test(s);
const isTxnId = (s) => typeof s === 'string' && ID_PATTERNS.txn.test(s);
const isRefundId = (s) => typeof s === 'string' && ID_PATTERNS.refund.test(s);
const isTicketId = (s) => typeof s === 'string' && ID_PATTERNS.ticket.test(s);

module.exports = {
  ALPHABET,
  ID_FORMATS,
  ID_PATTERNS,
  randomCode,
  newOrderId,
  newTxnId,
  newRefundId,
  newTicketId,
  generateOrderId: newOrderId,
  generateTxnId: newTxnId,
  generateTicketId: newTicketId,
  generateRefundId: newRefundId,
  isOrderId,
  isTxnId,
  isRefundId,
  isTicketId,
};
