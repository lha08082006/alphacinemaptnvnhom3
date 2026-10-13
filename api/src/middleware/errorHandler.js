'use strict';

const { ZodError } = require('zod');
const { AppError } = require('../lib/errors');
const { toDetails } = require('./validate');
const logger = require('../lib/logger');

/** Quy mọi loại lỗi về AppError. Lỗi không lường trước -> INTERNAL_ERROR. */
function normalize(err) {
  if (err instanceof AppError) return err;
  if (err && err.type === 'entity.parse.failed') {
    return new AppError('VALIDATION_ERROR', 400, 'Dữ liệu JSON gửi lên không đúng định dạng.');
  }
  if (err && err.type === 'entity.too.large') {
    return new AppError('VALIDATION_ERROR', 413, 'Dữ liệu gửi lên quá lớn.');
  }
  if (err instanceof ZodError) return new AppError('VALIDATION_ERROR', null, null, toDetails(err.issues));
  return new AppError('INTERNAL_ERROR');
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const appErr = normalize(err);
  const isServerError = appErr.httpStatus >= 500;

  // Stack trace CHỈ ghi vào log máy chủ, không bao giờ gửi ra ngoài
  logger[isServerError ? 'error' : 'warn']('request_error', {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    code: appErr.code,
    ...(isServerError && { cause: err && err.message, stack: err && err.stack }),
  });

  return res.status(appErr.httpStatus).json({
    ok: false,
    error: {
      code: appErr.code,
      message: appErr.message,
      details: appErr.details,
      requestId: req.id,
    },
  });
}

module.exports = errorHandler;
