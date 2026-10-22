'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { env } = require('./config/env');
const { IDEMPOTENCY } = require('./config/constants');
const requestId = require('./middleware/requestId');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { buildApiRouter } = require('./routes');
const logger = require('./lib/logger');

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    logger.info('request', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Number((process.hrtime.bigint() - start) / 1000000n),
    });
  });
  next();
}

/** Tạo app Express (không listen) — server.js và Supertest đều dùng hàm này. */
function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestId); // đặt đầu tiên để cả lỗi parse JSON cũng có requestId
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true, // cần cho cookie httpOnly (BE-02)
      allowedHeaders: ['Content-Type', 'X-Request-Id', IDEMPOTENCY.HEADER],
      exposedHeaders: ['X-Request-Id'],
    })
  );
  app.use(
    express.json({
      limit: '100kb',
      // Giữ nguyên chuỗi body gốc để tính chữ ký HMAC của webhook (quy ước 7)
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );
  app.use(requestLogger);

  app.use('/api/v1', buildApiRouter());

  // Direct endpoint cho SePay checkout
  const knex = require('./db/knex');
  const paymentService = require('./services/paymentService');
  const { createOneTimePaymentCheckout } = require('./lib/sepay');

  app.post(['/api/sepay/checkout', '/sepay/checkout'], async (req, res) => {
    const { orderId, amount } = req.body || {};
    if (!orderId || !(Number(amount) > 0)) {
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    }
    try {
      // 1. Nếu order tồn tại trong CSDL và đang HOLDING: dùng paymentService để đảm bảo State Machine & DB transaction
      const order = await knex('orders').where({ order_id: orderId }).first();
      if (order && order.status === 'HOLDING') {
        const result = await paymentService.createSepayPayment({
          userId: order.user_id,
          orderId,
          paymentMethod: 'BANK_TRANSFER',
          termsVersion: 'v1.0',
        });
        return res.json({
          url: result.checkoutUrl,
          checkoutUrl: result.checkoutUrl,
          fields: result.fields,
          paymentUrl: result.paymentUrl,
        });
      }

      // 2. Fallback cho đơn giả lập/demo không lưu CSDL
      const host = req.get('host') || 'localhost:4000';
      const protocol = req.protocol || 'http';
      const base = `${protocol}://${host}/index.html`;

      const result = createOneTimePaymentCheckout({
        orderInvoiceNumber: String(orderId),
        orderAmount: Math.round(Number(amount)),
        orderDescription: 'Thanh toan don hang ' + orderId,
        paymentMethod: 'BANK_TRANSFER',
        successUrl: `${base}#result?status=success&orderId=${encodeURIComponent(orderId)}&gateway=sepay`,
        errorUrl: `${base}#result?status=error&orderId=${encodeURIComponent(orderId)}&gateway=sepay`,
        cancelUrl: `${base}#result?status=cancel&orderId=${encodeURIComponent(orderId)}&gateway=sepay`,
      });

      return res.json({
        url: result.checkoutUrl,
        checkoutUrl: result.checkoutUrl,
        fields: result.fields,
        paymentUrl: result.checkoutUrl,
      });
    } catch (err) {
      return res.status(500).json({ error: err && err.message });
    }
  });

  app.use(express.static(path.join(__dirname, '..', '..')));

  // Route alias tiện ích cho giao diện web
  app.get('/dang-nhap', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'dang-nhap.html'));
  });
  app.get('/booking', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'booking.html'));
  });
  app.get('/seats', (_req, res) => {
    res.redirect('/booking');
  });
  app.get('/admin/login', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'admin', 'login.html'));
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
