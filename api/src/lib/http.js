'use strict';

/**
 * Tiện ích HTTP dùng chung cho route/controller.
 */

/** Express 4 không tự bắt lỗi của hàm async — bọc để lỗi đi về errorHandler. */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** Phản hồi thành công theo khuôn { ok: true, data, meta }. meta luôn có requestId. */
function sendOk(res, data, meta = {}, httpStatus = 200) {
  return res.status(httpStatus).json({
    ok: true,
    data: data === undefined ? null : data,
    meta: { requestId: res.req.id, ...meta },
  });
}

module.exports = { asyncHandler, sendOk };
