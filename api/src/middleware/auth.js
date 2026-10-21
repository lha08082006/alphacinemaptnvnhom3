'use strict';

const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { AUTH } = require('../config/constants');
const { AppError } = require('../lib/errors');

/**
 * Middleware xác thực người dùng qua JWT lưu trong cookie httpOnly (AUTH.COOKIE_NAME).
 * Giải mã thành công sẽ gán payload vào req.user.
 */
function requireAuth(req, _res, next) {
  const token = req.cookies?.[AUTH.COOKIE_NAME];
  if (!token) {
    return next(new AppError('AUTH_REQUIRED'));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [AUTH.JWT_ALGORITHM],
    });
    req.user = decoded;
    return next();
  } catch (_err) {
    return next(new AppError('AUTH_REQUIRED'));
  }
}

/**
 * Middleware phân quyền theo vai trò (roles).
 * Nhận một hoặc nhiều vai trò (ví dụ: requireRole('MANAGER') hoặc requireRole('IT', 'MANAGER')).
 */
function requireRole(...roles) {
  const allowedRoles = roles.flat();
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('AUTH_REQUIRED'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('FORBIDDEN'));
    }
    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
};
