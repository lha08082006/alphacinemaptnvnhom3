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
const { verifyQuery, queryTransaction, refund, buildPaymentUrl, sortObject } = require('../lib/vnpay');
const logger = require('../lib/logger');
const paymentService = require('../services/paymentService');

const router = express.Router();

const createPaymentSchema = z.object({
  orderId: z.string().min(1, 'Mã đơn hàng không được để trống'),
  method: z.enum(['QR', 'ATM', 'INTL_CARD', 'WALLET', 'BANK_TRANSFER', 'SEPAY'], {
    errorMap: () => ({ message: 'Phương thức thanh toán phải là QR, ATM, INTL_CARD, WALLET hoặc BANK_TRANSFER' }),
  }),
  bankCode: z.string().optional(),
  termsAccepted: z
    .boolean()
    .optional()
    .default(true)
    .refine((v) => v === true, {
      message: 'Bắt buộc đồng ý với điều khoản thanh toán để tiếp tục',
    }),
  termsVersion: z.string().optional(),
  successUrl: z.string().url().optional(),
  errorUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

const createSepaySchema = z.object({
  orderId: z.string().min(1, 'Mã đơn hàng không được để trống'),
  method: z.enum(['BANK_TRANSFER', 'NAPAS_BANK_TRANSFER', 'SEPAY']).optional().default('BANK_TRANSFER'),
  paymentMethod: z.enum(['BANK_TRANSFER', 'NAPAS_BANK_TRANSFER', 'SEPAY']).optional().default('BANK_TRANSFER'),
  termsAccepted: z
    .boolean()
    .optional()
    .default(true)
    .refine((v) => v === true, {
      message: 'Bắt buộc đồng ý với điều khoản thanh toán để tiếp tục',
    }),
  termsVersion: z.string().optional(),
  successUrl: z.string().url().optional(),
  errorUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  customData: z.string().optional(),
});

/**
 * POST /payments
 * Khởi tạo giao dịch thanh toán (VNPay hoặc SePay) cho đơn hàng.
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

    const { orderId, method, bankCode, termsVersion, successUrl, errorUrl, cancelUrl } = req.valid.body;
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    if (method === 'BANK_TRANSFER' || method === 'SEPAY') {
      const result = await paymentService.createSepayPayment({
        userId: req.user.id,
        orderId,
        paymentMethod: 'BANK_TRANSFER',
        termsVersion,
        idempotencyKey,
        successUrl,
        errorUrl,
        cancelUrl,
      });
      return sendOk(res, result);
    }

    const result = await paymentService.createPayment({
      userId: req.user.id,
      orderId,
      method,
      bankCode,
      termsVersion,
      idempotencyKey,
      ip,
    });

    sendOk(res, result);
  })
);

/**
 * POST /payments/sepay & POST /payments/sepay/checkout
 * Khởi tạo phiên thanh toán SePay cho đơn hàng đang ở trạng thái HOLD (HOLDING).
 */
router.post(
  ['/sepay', '/sepay/checkout'],
  requireAuth,
  validate({ body: createSepaySchema }),
  asyncHandler(async (req, res) => {
    const rawIdemp = req.header(IDEMPOTENCY.HEADER) || req.header('idempotency-key');
    let idempotencyKey = rawIdemp;
    if (rawIdemp && !IDEMPOTENCY.KEY_PATTERN.test(rawIdemp)) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        `Header ${IDEMPOTENCY.HEADER} không hợp lệ (cần từ 8-64 ký tự chữ, số, gạch ngang, gạch dưới).`
      );
    }
    if (!idempotencyKey) {
      idempotencyKey = 'IDEMP_SEPAY_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    }

    const { orderId, paymentMethod, method, termsVersion, successUrl, errorUrl, cancelUrl, customData } = req.valid.body;

    const result = await paymentService.createSepayPayment({
      userId: req.user.id,
      orderId,
      paymentMethod: paymentMethod || method || 'BANK_TRANSFER',
      termsVersion,
      idempotencyKey,
      successUrl,
      errorUrl,
      cancelUrl,
      customData,
    });

    sendOk(res, result);
  })
);

/**
 * POST /payments/sepay/ipn & POST /payments/sepay/webhook
 * Cổng thanh toán SePay gọi IPN webhook (server-to-server).
 * Phản hồi chuẩn { success: true, message: '...' }.
 */
router.post(['/sepay/ipn', '/sepay/webhook', '/sepay_ipn'], async (req, res) => {
  try {
    const result = await paymentService.applySepayIpn({
      payload: req.body,
      headers: req.headers,
      rawBody: req.rawBody || req.body,
    });

    if (result.success === false && result.message === 'Invalid signature') {
      return res.status(401).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    logger.error('sepay_ipn_error', { cause: err && err.message, stack: err && err.stack });
    return res.status(500).json({ success: false, error: err && err.message });
  }
});

/**
 * GET /payments/sepay/return & GET /payments/sepay_return
 * Khách hàng được chuyển hướng về sau khi thanh toán trên SePay Sandbox.
 */
router.get(['/sepay/return', '/sepay_return'], async (req, res) => {
  try {
    const orderId = req.query.order_invoice_number || req.query.orderId || req.query.order_id || '';
    const status = req.query.status || 'success';
    const redirectUrl = `/result.html?orderId=${encodeURIComponent(orderId)}&gateway=sepay&status=${encodeURIComponent(status)}`;
    return res.redirect(redirectUrl);
  } catch (err) {
    logger.error('sepay_return_error', { cause: err && err.message });
    return res.redirect('/result.html?error=internal');
  }
});

/**
 * GET /payments/vnpay/ipn & GET /payments/vnpay_ipn
 * Cổng thanh toán VNPay gọi webhook IPN (server-to-server).
 * Phản hồi chuẩn JSON { RspCode, Message }, KHÔNG dùng sendOk.
 */
router.get(['/vnpay/ipn', '/vnpay_ipn'], async (req, res) => {
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
 * GET /payments/vnpay/return & GET /payments/vnpay_return
 * Khách hàng được chuyển hướng về sau khi thanh toán trên VNPay.
 * Kiểm tra chữ ký, nếu VNPAY_TRUST_RETURN='true' mới gọi applyGatewayResult,
 * sau đó redirect về result.html?orderId=...
 */
router.get(['/vnpay/return', '/vnpay_return'], async (req, res) => {
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

/**
 * POST /payments/vnpay/create_payment_url
 * Tương thích với route create_payment_url từ mẫu vnpay_nodejs.
 */
router.post('/vnpay/create_payment_url', async (req, res) => {
  try {
    const { amount, bankCode, orderId, orderDescription, language } = req.body;
    const ipAddr = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    const txnRef = orderId || String(Date.now());
    const amountVnd = Number(amount) || 10000;
    const orderInfo = orderDescription || `Thanh toan cho ma GD: ${txnRef}`;

    const paymentUrl = buildPaymentUrl({
      txnRef,
      amountVnd,
      orderInfo,
      ipAddr,
      method: bankCode,
    });

    return res.status(200).json({ ok: true, paymentUrl, url: paymentUrl });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

/**
 * POST /payments/vnpay/querydr
 * Tương thích với route querydr từ mẫu vnpay_nodejs & Tài liệu VNPAY v2.1.0 (mục 2.5.4).
 */
router.post('/vnpay/querydr', async (req, res) => {
  try {
    const { orderId, transDate, requestId, orderInfo } = req.body;
    const ipAddr = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    const result = await queryTransaction({
      requestId,
      txnRef: orderId,
      transDate,
      orderInfo,
      ipAddr,
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

/**
 * POST /payments/vnpay/refund
 * Tương thích với route refund từ mẫu vnpay_nodejs & Tài liệu VNPAY v2.1.0 (mục 2.5.5).
 */
router.post('/vnpay/refund', async (req, res) => {
  try {
    const { orderId, transDate, amount, transType, user, orderInfo, transactionNo } = req.body;
    const ipAddr = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    const result = await refund({
      txnRef: orderId,
      amountVnd: Number(amount),
      transDate,
      transactionType: transType || '02',
      transactionNo,
      createBy: user || 'SYSTEM',
      orderInfo,
      ipAddr,
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

/**
 * GET /payments/mock/txn/:txnRef
 * Tra cứu thông tin giao dịch từ mock payment gateway (beta-payment-demo) thông qua Vercel binding GATEWAY_BASE_URL.
 */
router.get('/mock/txn/:txnRef', async (req, res) => {
  try {
    const { txnRef } = req.params;
    const targetUrl = new URL(`/api/gateway/txn/${encodeURIComponent(txnRef)}`, env.GATEWAY_BASE_URL);
    const response = await fetch(targetUrl);
    if (!response.ok) {
      return res.status(response.status).json({ ok: false, error: 'Không tìm thấy giao dịch trên cổng giả lập' });
    }
    const data = await response.json();
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
});

module.exports = router;
