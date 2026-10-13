'use strict';

const { AppError } = require('../lib/errors');

function notFound(req, res, next) {
  next(new AppError('NOT_FOUND', 404, 'Không tìm thấy địa chỉ API này.', { method: req.method, path: req.originalUrl }));
}

module.exports = notFound;
