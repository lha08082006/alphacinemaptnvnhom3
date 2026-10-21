'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { AppError } = require('../lib/errors');
const { asyncHandler, sendOk } = require('../lib/http');
const orderService = require('../services/orderService');

const router = express.Router();

/**
 * GET /orders/:id/status
 * Lấy thông tin trạng thái đơn hàng (chỉ chủ sở hữu đơn mới được xem).
 * Trả về: status, amount, ticket (nếu có), refund (nếu có) và timeline từ order_status_history (mới nhất trước).
 */
router.get(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const userId = req.user.id;

    const result = await orderService.getOrderStatus(orderId, userId);
    if (!result) {
      throw new AppError('NOT_FOUND');
    }

    sendOk(res, result);
  })
);

module.exports = router;
