'use strict';

const { AppError } = require('../lib/errors');

/** Dịch issue của zod sang câu tiếng Việt ngắn gọn cho trường details. */
function viMessage(issue) {
  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' ? 'Trường này là bắt buộc' : `Sai kiểu dữ liệu (cần ${issue.expected})`;
    case 'too_small':
      return issue.type === 'string' ? `Cần ít nhất ${issue.minimum} ký tự` : issue.type === 'array' ? `Cần ít nhất ${issue.minimum} phần tử` : `Giá trị tối thiểu là ${issue.minimum}`;
    case 'too_big':
      return issue.type === 'string' ? `Tối đa ${issue.maximum} ký tự` : issue.type === 'array' ? `Tối đa ${issue.maximum} phần tử` : `Giá trị tối đa là ${issue.maximum}`;
    case 'invalid_enum_value':
      return `Giá trị không hợp lệ, chỉ nhận: ${issue.options.join(', ')}`;
    case 'unrecognized_keys':
      return `Có trường không được phép: ${issue.keys.join(', ')}`;
    default:
      return issue.message;
  }
}

function toDetails(issues, prefix) {
  return issues.map((i) => ({
    path: [prefix, ...i.path].filter((x) => x !== undefined && x !== '').join('.'),
    message: viMessage(i),
  }));
}

/**
 * validate({ params, query, body }) — mỗi phần là một zod schema (tùy chọn).
 * Dữ liệu đã kiểm tra nằm ở req.valid.{params,query,body}; req.body cũng được thay bằng bản đã chuẩn hóa.
 */
function validate(schemas) {
  return (req, res, next) => {
    const details = [];
    req.valid = req.valid || {};

    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (result.success) req.valid[part] = result.data;
      else details.push(...toDetails(result.error.issues, part));
    }

    if (details.length > 0) return next(new AppError('VALIDATION_ERROR', null, null, details));
    if (schemas.body) req.body = req.valid.body;
    return next();
  };
}

module.exports = { validate, toDetails };
