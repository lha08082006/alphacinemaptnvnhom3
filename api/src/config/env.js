'use strict';

const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

const API_ROOT = path.join(__dirname, '..', '..');

// dotenv KHÔNG ghi đè biến đã có sẵn trong process.env (test đặt trước sẽ được giữ nguyên)
dotenv.config({ path: path.join(API_ROOT, '.env') });

const required = (label) => ({ required_error: `thiếu biến ${label} (bắt buộc)` });

const csvList = (defaultValue) =>
  z
    .string()
    .default(defaultValue)
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DB_FILE: z.string().min(1).default(path.join('data', 'beta.sqlite')),
  CORS_ORIGINS: csvList('http://127.0.0.1:5500,http://localhost:5500'),
  GATEWAY_BASE_URL: z.string().url('phải là URL hợp lệ').default('http://127.0.0.1:4100'),
  WEBHOOK_SECRET: z.string(required('WEBHOOK_SECRET')).min(16, 'phải dài ít nhất 16 ký tự'),
  WEBHOOK_TOLERANCE_SEC: z.coerce.number().int().positive().default(300),
  JWT_SECRET: z.string(required('JWT_SECRET')).min(16, 'phải dài ít nhất 16 ký tự'),
  JWT_EXPIRES_IN: z.string().min(1).default('2h'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),

  // Cấu hình cổng thanh toán VNPay
  VNPAY_TMN_CODE: z.string(required('VNPAY_TMN_CODE')).min(1, 'phải có ít nhất 1 ký tự'),
  VNPAY_HASH_SECRET: z.string(required('VNPAY_HASH_SECRET')).min(1, 'phải có ít nhất 1 ký tự'),
  VNPAY_URL: z.string(required('VNPAY_URL')).url('phải là URL hợp lệ'),
  VNPAY_API_URL: z.string(required('VNPAY_API_URL')).url('phải là URL hợp lệ'),
  VNPAY_RETURN_URL: z.string(required('VNPAY_RETURN_URL')).url('phải là URL hợp lệ'),
  VNPAY_TRUST_RETURN: z.enum(['true', 'false']).default('false'),
});

/**
 * Kiểm tra và chuẩn hóa biến môi trường. Ném Error có thông báo dễ đọc nếu sai.
 * Tách thành hàm thuần để test được mà không phụ thuộc process.env.
 */
function parseEnv(source) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => ` - ${i.path.join('.') || '(gốc)'}: ${i.message}`);
    const err = new Error(
      '[api] Cấu hình môi trường không hợp lệ. Kiểm tra file api\\.env ' +
        '(có thể tạo bằng: Copy-Item api\\.env.example api\\.env)\n' +
        lines.join('\n')
    );
    err.code = 'ENV_INVALID';
    err.issues = result.error.issues;
    throw err;
  }

  const env = { ...result.data };
  env.DB_PATH =
    env.DB_FILE === ':memory:'
      ? ':memory:'
      : path.isAbsolute(env.DB_FILE)
        ? env.DB_FILE
        : path.join(API_ROOT, env.DB_FILE);

  return Object.freeze(env);
}

const env = parseEnv(process.env);

module.exports = { env, parseEnv, API_ROOT };
