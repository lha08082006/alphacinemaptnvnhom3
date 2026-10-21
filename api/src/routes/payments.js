'use strict';

const express = require('express');
const { z } = require('zod');
const knex = require('../db/knex');
const { env } = require('../config/env');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { IDEMPOTENCY } = require('../config/constants');
const { AppError } = require('../lib/errors');
const { asyncHandler, sendOk } = require('../lib/http');
const { verifyQuery } = require('../lib/vnpay');
const logger = require('../lib/logger');
const paymentService = require('../services/paymentService');

const router = express.Router();

const createPaymentSchema = z.object({
  orderId: z.string().min(1, 'Mã đơn hàng không được để trống'),
  method: z.enum(['WALLET', 'ATM', 'INTL_CARD'], {
    errorMap: () => ({ message: 'Phương thức thanh toán phải là WALLET, ATM hoặc INTL_CARD' }),
  }),
});

/**
 * POST /payments
 * Khởi tạo giao dịch thanh toán VNPay cho đơn hàng.
 * Header bắt buộc: Idempotency-Key (theo IDEMPOTENCY.KEY_PATTERN)
 */
router.post(
  '/',
  requireAuth,
  validate({ body: createPaymentSchema }),
  asyncHandler(async (req, res) => {
    const idempotencyKey = req.header(IDEMPOTENCY.HEADER) || req.header('idempotency-key');
    if (!idempotencyKey || !IDEMPOTENCY.KEY_PATTERN.test(idempotencyKey)) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        `Header ${IDEMPOTENCY.HEADER} không hợp lệ (cần từ 8-64 ký tự chữ, số, gạch ngang, gạch dưới).`
      );
    }

    const { orderId, method } = req.valid.body;
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    const result = await paymentService.createPayment({
      userId: req.user.id,
      orderId,
      method,
      idempotencyKey,
      ip,
    });

    sendOk(res, result);
  })
);

/**
 * GET /payments/vnpay/ipn
 * Cổng thanh toán VNPay gọi webhook IPN (server-to-server).
 * Phản hồi chuẩn JSON { RspCode, Message }, KHÔNG dùng sendOk.
 */
router.get('/vnpay/ipn', async (req, res) => {
  try {
    // 1. Kiểm tra chữ ký
    const isValid = verifyQuery(req.query);
    if (!isValid) {
      return res.status(200).json({ RspCode: '97', Message: 'Checksum failed' });
    }

    // 2. Trích xuất thông tin
    const txnRef = req.query.vnp_TxnRef;
    const transNo = req.query.vnp_TransactionNo;
    const amountVnd = Number(req.query.vnp_Amount) / 100;
    const responseCode = req.query.vnp_ResponseCode;
    const transactionStatus = req.query.vnp_TransactionStatus;
    const payDate = req.query.vnp_PayDate;
    const bankCode = req.query.vnp_BankCode;

    const result = await paymentService.applyGatewayResult({
      txnRef,
      transNo,
      amountVnd,
      responseCode,
      transactionStatus,
      payDate,
      bankCode,
      raw: req.query,
    });

    return res.status(200).json(result);
  } catch (err) {
    logger.error('vnpay_ipn_error', { cause: err && err.message, stack: err && err.stack });
    return res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
  }
});

/**
 * GET /payments/vnpay/return
 * Khách hàng được chuyển hướng về sau khi thanh toán trên VNPay.
 * Kiểm tra chữ ký, nếu VNPAY_TRUST_RETURN='true' mới gọi applyGatewayResult,
 * sau đó redirect về result.html?orderId=...
 */
router.get('/vnpay/return', async (req, res) => {
  try {
    const isValid = verifyQuery(req.query);
    const txnRef = req.query.vnp_TxnRef;
    const transNo = req.query.vnp_TransactionNo;
    const amountVnd = Number(req.query.vnp_Amount) / 100;
    const responseCode = req.query.vnp_ResponseCode;
    const transactionStatus = req.query.vnp_TransactionStatus;
    const payDate = req.query.vnp_PayDate;
    const bankCode = req.query.vnp_BankCode;

    let orderId = '';
    if (txnRef) {
      const attempt = await knex('payment_attempts').where({ gateway_txn_id: txnRef }).first();
      if (attempt) {
        orderId = attempt.order_id;
      }
    }

    // Chỉ áp dụng kết quả từ return URL khi biến môi trường cho phép
    if (isValid && env.VNPAY_TRUST_RETURN === 'true') {
      await paymentService.applyGatewayResult({
        txnRef,
        transNo,
        amountVnd,
        responseCode,
        transactionStatus,
        payDate,
        bankCode,
        raw: req.query,
      });
    }

    const redirectUrl = `/result.html?orderId=${encodeURIComponent(orderId)}&responseCode=${encodeURIComponent(responseCode || '')}`;
    return res.redirect(redirectUrl);
  } catch (err) {
    logger.error('vnpay_return_error', { cause: err && err.message });
    return res.redirect('/result.html?error=internal');
  }
});

module.exports = router;
