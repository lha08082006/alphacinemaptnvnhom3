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
  app.use(helmet());
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
