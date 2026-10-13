'use strict';

const crypto = require('crypto');

const INCOMING_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Gắn mã requestId cho mỗi request (nhận lại X-Request-Id từ client nếu hợp lệ),
 * trả về qua header X-Request-Id và có mặt trong mọi phản hồi/log để truy vết.
 */
function requestId(req, res, next) {
  const incoming = req.get('X-Request-Id');
  req.id = incoming && INCOMING_ID_RE.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

module.exports = requestId;
