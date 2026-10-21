'use strict';

const express = require('express');
const { z } = require('zod');
const knex = require('../db/knex');
const { validate } = require('../middleware/validate');
const { asyncHandler, sendOk } = require('../lib/http');
const { AppError } = require('../lib/errors');

const router = express.Router();

// Bộ nhớ đệm quản lý giới hạn tra cứu theo IP (RATE_LIMITED)
const lookupAttemptsByIp = new Map();
const MAX_LOOKUP_ATTEMPTS = 10;
const LOOKUP_WINDOW_MS = 60 * 1000; // 1 phút

function checkLookupRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  const now = Date.now();
  let record = lookupAttemptsByIp.get(ip);

  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + LOOKUP_WINDOW_MS };
    lookupAttemptsByIp.set(ip, record);
    return next();
  }

  record.count += 1;
  if (record.count > MAX_LOOKUP_ATTEMPTS) {
    return next(new AppError('RATE_LIMITED'));
  }

  next();
}

const lookupSchema = z
  .object({
    orderId: z.string().optional(),
    txnId: z.string().optional(),
    contact: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  })
  .refine((data) => data.orderId || data.txnId, {
    message: 'Cần cung cấp mã đơn hàng (orderId) hoặc mã giao dịch (txnId)',
  });

const STATUS_DESCRIPTIONS = Object.freeze({
  HOLDING: 'Đang giữ chỗ',
  AWAITING_PAYMENT: 'Đang chờ thanh toán',
  PENDING_VERIFY: 'Đang xác thực giao dịch',
  PAID: 'Thanh toán thành công (Đã xuất vé)',
  FAILED: 'Giao dịch thất bại',
  EXPIRED: 'Đơn hàng đã hết hạn giữ chỗ',
  CANCELLED: 'Đơn hàng đã hủy',
  REFUND_PENDING: 'Đang xử lý hoàn tiền',
  REFUNDED: 'Đã hoàn tiền thành công',
});

const REFUND_STATUS_DESCRIPTIONS = Object.freeze({
  CHECKING: 'Đang kiểm tra điều kiện hoàn tiền',
  SENT: 'Đã gửi lệnh hoàn sang cổng thanh toán',
  BANK_PROCESSING: 'Ngân hàng đang xử lý hoàn tiền vào thẻ',
  COMPLETED: 'Tiền đã được hoàn về tài khoản của bạn',
  REJECTED: 'Yêu cầu hoàn tiền bị từ chối',
});

/**
 * POST /support/lookup
 * Tra cứu trạng thái đơn hàng cho khách hàng bằng mã đơn/mã giao dịch + email hoặc SĐT.
 * - Chỉ trả kết quả chi tiết khi email hoặc SĐT khớp hoàn toàn với đơn hàng.
 * - Không khớp: Trả thông báo chung (không tiết lộ đơn hàng có tồn tại hay không).
 * - Giới hạn tần suất tra cứu theo IP (RATE_LIMITED).
 */
router.post(
  '/lookup',
  checkLookupRateLimit,
  validate({ body: lookupSchema }),
  asyncHandler(async (req, res) => {
    const { orderId, txnId, contact, email, phone } = req.body;
    const inputContact = (contact || email || phone || '').trim().toLowerCase();

    // 1. Tìm đơn hàng theo orderId hoặc txnId (gateway_txn_id hoặc gateway_trans_no)
    let order = null;

    if (orderId) {
      order = await knex('orders').where({ order_id: orderId.trim() }).first();
    } else if (txnId) {
      const trimmedTxn = txnId.trim();
      const attempt = await knex('payment_attempts')
        .where({ gateway_txn_id: trimmedTxn })
        .orWhere({ gateway_trans_no: trimmedTxn })
        .first();

      if (attempt) {
        order = await knex('orders').where({ order_id: attempt.order_id }).first();
      }
    }

    // 2. Kiểm tra thông tin liên hệ: email hoặc phone
    let isMatched = false;
    if (order && inputContact) {
      const orderEmail = (order.customer_email || '').toLowerCase();
      const orderPhone = (order.customer_phone || '').toLowerCase();

      if (orderEmail === inputContact || orderPhone === inputContact) {
        isMatched = true;
      }
    }

    // 3. Nếu không tìm thấy hoặc không khớp thông tin liên hệ: trả thông báo chung an toàn
    if (!order || !isMatched) {
      return sendOk(res, {
        found: false,
        message:
          'Không tìm thấy thông tin giao dịch phù hợp với thông tin cung cấp. Vui lòng kiểm tra lại mã đơn/giao dịch và email/số điện thoại.',
      });
    }

    // 4. Nếu khớp: lấy thông tin refund (nếu có)
    const refund = await knex('refunds')
      .where({ order_id: order.order_id })
      .whereNot('status', 'REJECTED')
      .first();

    const result = {
      found: true,
      orderId: order.order_id,
      status: order.status,
      statusText: STATUS_DESCRIPTIONS[order.status] || order.status,
      amount: order.amount_total,
      showtimeId: order.showtime_id,
      createdAt: order.created_at,
      hasRefund: Boolean(refund),
      refund: refund
        ? {
            refundId: refund.refund_id,
            amount: refund.amount,
            status: refund.status,
            statusText: REFUND_STATUS_DESCRIPTIONS[refund.status] || refund.status,
            detectedAt: refund.detected_at,
            sentAt: refund.sent_at,
            completedAt: refund.completed_at,
          }
        : null,
    };

    sendOk(res, result);
  })
);

module.exports = router;
