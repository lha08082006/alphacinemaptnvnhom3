'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const knex = require('../db/knex');
const { env } = require('../config/env');
const { AUTH } = require('../config/constants');
const { AppError } = require('../lib/errors');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, sendOk } = require('../lib/http');

const router = express.Router();

// Bộ nhớ đệm quản lý giới hạn thử sai mật khẩu theo IP
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // Khóa 15 phút
const failedAttemptsByIp = new Map();

function getClientIp(req) {
  return req.ip || req.connection?.remoteAddress || '127.0.0.1';
}

function checkRateLimit(ip) {
  const record = failedAttemptsByIp.get(ip);
  if (!record) return;

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    if (Date.now() < record.lockUntil) {
      throw new AppError('RATE_LIMITED');
    }
    // Hết thời gian khóa -> xóa bản ghi
    failedAttemptsByIp.delete(ip);
  }
}

function recordFailedAttempt(ip) {
  const current = failedAttemptsByIp.get(ip);
  const count = (current ? current.count : 0) + 1;
  const lockUntil = count >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
  failedAttemptsByIp.set(ip, { count, lockUntil });

  if (count >= MAX_FAILED_ATTEMPTS) {
    throw new AppError('RATE_LIMITED');
  }
}

function resetRateLimit(ip) {
  failedAttemptsByIp.delete(ip);
}

const loginSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
  password: z.string().min(1, 'Mật khẩu không được để trống'),
});

/**
 * POST /auth/login
 * Đăng nhập bằng email và password, thiết lập cookie JWT.
 */
router.post(
  '/login',
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const ip = getClientIp(req);
    checkRateLimit(ip);

    const { email, password } = req.valid.body;

    // Tìm người dùng theo email
    const user = await knex('users').where({ email: email.toLowerCase().trim() }).first();

    // Kiểm tra tài khoản và mật khẩu
    // Chỉ chấp nhận vai trò CUSTOMER tại cổng khách hàng
    // Không báo lộ email có tồn tại hay không (cùng một thông báo lỗi)
    const isValid =
      user &&
      Boolean(user.is_active) &&
      user.role === 'CUSTOMER' &&
      bcrypt.compareSync(password, user.password_hash);

    if (!isValid) {
      recordFailedAttempt(ip);
      throw new AppError('AUTH_REQUIRED', 401, 'Email hoặc mật khẩu không chính xác.');
    }

    // Đăng nhập thành công -> xóa bộ đếm thử sai của IP
    resetRateLimit(ip);

    // Ký JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
        type: 'CUSTOMER',
      },
      env.JWT_SECRET,
      {
        algorithm: AUTH.JWT_ALGORITHM,
        expiresIn: env.JWT_EXPIRES_IN,
      }
    );

    // Thiết lập cookie httpOnly
    res.cookie(AUTH.COOKIE_NAME, token, AUTH.COOKIE_OPTIONS);

    sendOk(res, {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        points: user.points,
      },
    });
  })
);

/**
 * POST /auth/logout
 * Đăng xuất: xóa cookie xác thực.
 */
router.post('/logout', (req, res) => {
  res.clearCookie(AUTH.COOKIE_NAME, {
    ...AUTH.COOKIE_OPTIONS,
    maxAge: 0,
  });
  sendOk(res, { message: 'Đăng xuất thành công.' });
});

/**
 * GET /auth/me
 * Lấy thông tin tài khoản hiện tại từ cookie JWT.
 */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await knex('users')
      .where({ id: req.user.id })
      .select('id', 'email', 'phone', 'full_name', 'role', 'points', 'is_active', 'created_at', 'updated_at')
      .first();

    if (!user || !Boolean(user.is_active)) {
      throw new AppError('AUTH_REQUIRED');
    }

    sendOk(res, {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        full_name: user.full_name,
        role: user.role,
        points: user.points,
      },
    });
  })
);

// Hỗ trợ kiểm thử đơn vị reset rate limit
router._resetRateLimits = () => failedAttemptsByIp.clear();

module.exports = router;
