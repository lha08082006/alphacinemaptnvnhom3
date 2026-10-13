'use strict';

const express = require('express');
const { env } = require('../config/env');
const healthRouter = require('./health');
const demoRouter = require('./demo');

/**
 * Gom mọi router dưới prefix /api/v1 (gắn ở app.js).
 * BE sau thêm: /auth, /movies, /showtimes, /orders, /payments, /webhooks, /admin...
 */
function buildApiRouter() {
  const router = express.Router();
  router.use('/health', healthRouter);
  if (env.NODE_ENV !== 'production') router.use('/demo', demoRouter);
  return router;
}

module.exports = { buildApiRouter };
