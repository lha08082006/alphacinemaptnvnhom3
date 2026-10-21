'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, sendOk } = require('../lib/http');
const notificationService = require('../services/notificationService');

const router = express.Router();

/**
 * GET /notifications
 * Lấy danh sách thông báo của người dùng đăng nhập hiện tại (theo thứ tự mới nhất).
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const list = await notificationService.getNotifications(req.user.id);
    sendOk(res, list);
  })
);

/**
 * PATCH /notifications/:id/read
 * Đánh dấu một thông báo là đã đọc (chỉ chủ sở hữu thông báo).
 */
router.patch(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const notifId = Number(req.params.id);
    const updated = await notificationService.markAsRead(notifId, req.user.id);
    sendOk(res, updated);
  })
);

module.exports = router;
