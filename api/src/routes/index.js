'use strict';

const express = require('express');
const { env } = require('../config/env');
const healthRouter = require('./health');
const authRouter = require('./auth');
const paymentsRouter = require('./payments');
const ordersRouter = require('./orders');
const notificationsRouter = require('./notifications');
const supportRouter = require('./support');
const adminRouter = require('./admin');
const demoRouter = require('./demo');

/**
 * Gom mọi router dưới prefix /api/v1 (gắn ở app.js).
 * BE sau thêm: /auth, /movies, /showtimes, /orders, /payments, /webhooks, /admin...
 */
function buildApiRouter() {
  const router = express.Router();
  router.use('/health', healthRouter);
  router.use('/auth', authRouter);
  router.use('/payments', paymentsRouter);
  router.use('/orders', ordersRouter);
  router.use('/notifications', notificationsRouter);
  router.use('/support', supportRouter);
  router.use('/admin', adminRouter);
  if (env.NODE_ENV !== 'production') router.use('/demo', demoRouter);
  return router;
}

module.exports = { buildApiRouter };
