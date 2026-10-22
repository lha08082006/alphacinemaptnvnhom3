'use strict';

/**
 * Hằng số nghiệp vụ & giao thức dùng chung.
 * Chỉ ĐỊNH NGHĨA ở BE-00; phần cài đặt (đăng nhập, idempotency store...) làm ở các BE sau.
 */

// Quy ước 8 — Xác thực (BE-02 cài): JWT nằm trong cookie httpOnly
const AUTH = Object.freeze({
  COOKIE_NAME: 'beta_token',
  COOKIE_OPTIONS: Object.freeze({
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: false, // bật true khi chạy HTTPS (production)
  }),
  JWT_ALGORITHM: 'HS256',
  // Vai trò lấy theo các làn trong SPEC mục A (Khách hàng + 4 bộ phận Vận hành)
  ROLES: Object.freeze(['CUSTOMER', 'IT', 'ACCOUNTANT', 'CSKH', 'MANAGER']),
});

// Xác thực dành riêng cho Cổng Quản trị / Nhân viên (Admin / Staff)
const AUTH_ADMIN = Object.freeze({
  COOKIE_NAME: 'beta_admin_token',
  COOKIE_OPTIONS: Object.freeze({
    httpOnly: true,
    sameSite: 'lax',
    path: '/api/v1/admin',
    secure: false,
    maxAge: 2 * 60 * 60 * 1000, // 2 giờ
  }),
  MAX_FAILED_ATTEMPTS: 5,
  DEFAULT_LOCKOUT_MIN: 15,
  STAFF_ROLES: Object.freeze(['IT', 'ACCOUNTANT', 'CSKH', 'MANAGER']),
});

// Quy ước 6 — Idempotency cho thao tác tạo thanh toán
const IDEMPOTENCY = Object.freeze({
  HEADER: 'Idempotency-Key',
  KEY_PATTERN: /^[A-Za-z0-9_-]{8,64}$/,
  TTL_HOURS: 24,
});

// Quy ước 7 — Header chữ ký webhook (tên chuẩn hóa chữ thường như Express trả về)
const WEBHOOK_HEADERS = Object.freeze({
  TIMESTAMP: 'x-gateway-timestamp',
  SIGNATURE: 'x-gateway-signature',
});

// SPEC mục D
const MAX_SEATS_PER_ORDER = 8; // BR-01
const REFUND_SEND_SLA_HOURS = 24; // BR-08

// SPEC mục B — giá trị mặc định của bảng settings
const DEFAULT_SETTINGS = Object.freeze({
  mode: 'ASIS', // 'ASIS' | 'TOBE'
  reconcileIntervalMin: 15, // 5 | 15
  callbackTimeoutSec: 15,
  holdMinutes: 5,
  pendingVerifyHoldMin: 15,
  refundSendDelayMin: 30,
  adminLockoutMin: 15,
});

// Thời gian hoàn tiền ước tính theo từng loại phương thức thanh toán (đồng nhất Điều khoản thanh toán)
const REFUND_ESTIMATED_TIMES = Object.freeze({
  INTL_CARD: 'trong vòng 30 ngày làm việc',
  ATM: 'trong vòng 7 ngày làm việc',
  WALLET: '7-14 ngày làm việc',
  QR: '7-14 ngày làm việc',
  DEFAULT: '7-14 ngày làm việc',
});

module.exports = {
  AUTH,
  AUTH_ADMIN,
  IDEMPOTENCY,
  WEBHOOK_HEADERS,
  MAX_SEATS_PER_ORDER,
  REFUND_SEND_SLA_HOURS,
  REFUND_ESTIMATED_TIMES,
  DEFAULT_SETTINGS,
};
