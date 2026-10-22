'use strict';

const express = require('express');
const { z } = require('zod');
const { env } = require('../config/env');
const { AppError, ERROR_CODES } = require('../lib/errors');
const { validate } = require('../middleware/validate');
const { sendOk } = require('../lib/http');
const { vndSchema, formatVnd } = require('../lib/money');
const clock = require('../lib/clock');
const ids = require('../lib/ids');
const hmac = require('../lib/hmac');
const { execSync } = require('child_process');
const path = require('path');
const dbPath = path.join(__dirname, '../../../data/beta.sqlite');
const Database = require('better-sqlite3');

const { requireAuth, requireRole, requireStaff } = require('../middleware/auth');
const router = express.Router();

router.get(
  '/errors/:code',
  validate({ params: z.object({ code: z.enum(Object.keys(ERROR_CODES)) }) }),
  (req) => {
    throw new AppError(req.valid.params.code);
  }
);

router.get('/crash', () => {
  throw new Error('Lỗi nội bộ bảo mật: mật khẩu CSDL = abc123');
});

router.post(
  '/echo',
  validate({
    body: z.object({ amount: vndSchema, note: z.string().max(200).optional() }).strict(),
  }),
  (req, res) => {
    const { amount, note } = req.valid.body;
    sendOk(res, { amount, amountText: formatVnd(amount), note: note ?? null, receivedAt: clock.nowIso() });
  }
);

router.get('/ids', (req, res) => {
  sendOk(res, {
    orderId: ids.newOrderId(),
    txnId: ids.newTxnId(),
    refundId: ids.newRefundId(),
    ticketId: ids.newTicketId(),
  });
});

router.post('/signature-check', (req, res) => {
  const result = hmac.verify({
    secret: env.WEBHOOK_SECRET,
    timestamp: req.get(hmac.HEADER_TIMESTAMP),
    signature: req.get(hmac.HEADER_SIGNATURE),
    rawBody: req.rawBody ?? '',
    toleranceSec: env.WEBHOOK_TOLERANCE_SEC,
  });
  if (!result.ok) throw new AppError('INVALID_SIGNATURE', null, null, { reason: result.reason });
  sendOk(res, { verified: true });
});

router.get('/clock', (req, res) => sendOk(res, clock.state()));

router.post(
  '/clock/advance',
  validate({ body: z.object({ minutes: z.number().int().positive().max(60 * 24 * 30) }).strict() }),
  (req, res) => {
    clock.advanceMinutes(req.valid.body.minutes);
    sendOk(res, clock.state());
  }
);

router.post('/clock/reset', (req, res) => {
  clock.reset();
  sendOk(res, clock.state());
});

router.get('/settings', (req, res) => {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    sendOk(res, settings);
  } catch (err) {
    sendOk(res, {});
  } finally {
    db.close();
  }
});

router.post('/reset', (req, res) => {
  // Chạy lệnh migrate và seed
  try {
    execSync('npm run migrate:rollback --all', { cwd: path.join(__dirname, '../../') });
    execSync('npm run migrate', { cwd: path.join(__dirname, '../../') });
    execSync('npm run seed', { cwd: path.join(__dirname, '../../') });
    sendOk(res, { message: 'Database reset successfully' });
  } catch (err) {
    throw new AppError('INTERNAL_ERROR', null, null, { detail: err.message });
  }
});

router.get('/manager-only', requireStaff('MANAGER'), (req, res) => {
  sendOk(res, { message: 'Chào mừng Quản lý', role: req.user.role });
});

module.exports = router;
