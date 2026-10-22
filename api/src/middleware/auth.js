'use strict';

const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { AUTH, AUTH_ADMIN } = require('../config/constants');
const { AppError } = require('../lib/errors');

/**
 * Middleware xác thực khách hàng qua JWT lưu trong cookie httpOnly (AUTH.COOKIE_NAME).
 * Chỉ chấp nhận vai trò CUSTOMER.
 */
function requireCustomer(req, _res, next) {
  const token = req.cookies?.[AUTH.COOKIE_NAME];
  if (!token) {
    return next(new AppError('AUTH_REQUIRED'));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [AUTH.JWT_ALGORITHM],
    });
    if (decoded.role !== 'CUSTOMER') {
      return next(new AppError('AUTH_REQUIRED'));
    }
    req.user = decoded;
    return next();
  } catch (_err) {
    return next(new AppError('AUTH_REQUIRED'));
  }
}

/**
 * Middleware xác thực nhân viên quản trị qua JWT lưu trong cookie (AUTH_ADMIN.COOKIE_NAME).
 * Chỉ chấp nhận các vai trò STAFF (IT, ACCOUNTANT, CSKH, MANAGER).
 * Nếu người dùng gửi cookie của khách hàng (beta_token) -> trả 403 FORBIDDEN.
 * Nếu không có token -> trả 401 AUTH_REQUIRED.
 * Nếu có truyền roles, kiểm tra vai trò người dùng có nằm trong danh sách không.
 */
function requireStaff(...roles) {
  const allowedRoles = roles.flat();
  return (req, _res, next) => {
    // Nếu request đã được xác thực bởi requireStaff() ở tầng router cha
    if (req.user) {
      if (!AUTH_ADMIN.STAFF_ROLES.includes(req.user.role) || req.user.role === 'CUSTOMER') {
        return next(new AppError('FORBIDDEN'));
      }
      if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
        return next(new AppError('FORBIDDEN'));
      }
      return next();
    }

    const adminToken = req.cookies?.[AUTH_ADMIN.COOKIE_NAME];
    const customerToken = req.cookies?.[AUTH.COOKIE_NAME];

    if (!adminToken) {
      if (customerToken) {
        // Khách hàng cầm token khách gọi API admin -> 403 FORBIDDEN
        try {
          const decodedCust = jwt.verify(customerToken, env.JWT_SECRET, {
            algorithms: [AUTH.JWT_ALGORITHM],
          });
          if (decodedCust.role === 'CUSTOMER') {
            return next(new AppError('FORBIDDEN'));
          }
        } catch (_e) {
          return next(new AppError('AUTH_REQUIRED'));
        }
      }
      return next(new AppError('AUTH_REQUIRED'));
    }

    try {
      const decoded = jwt.verify(adminToken, env.JWT_SECRET, {
        algorithms: [AUTH.JWT_ALGORITHM],
      });

      if (!AUTH_ADMIN.STAFF_ROLES.includes(decoded.role) || decoded.role === 'CUSTOMER') {
        return next(new AppError('FORBIDDEN'));
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
        return next(new AppError('FORBIDDEN'));
      }

      req.user = decoded;
      return next();
    } catch (_err) {
      return next(new AppError('AUTH_REQUIRED'));
    }
  };
}

/**
 * Middleware requireAuth: tương thích ngược cho các route khách hàng.
 */
const requireAuth = requireCustomer;

/**
 * Middleware phân quyền theo vai trò (roles).
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
  requireCustomer,
  requireStaff,
  requireAuth,
  requireRole,
};
