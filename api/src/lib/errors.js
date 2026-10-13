'use strict';

/**
 * Bảng mã lỗi dùng chung. ĐỒNG BỘ với docs/ERROR-CODES.md — sửa ở đây thì sửa cả tài liệu.
 * message: câu tiếng Việt thân thiện, hiển thị được thẳng cho khách.
 */
const ERROR_CODES = Object.freeze({
  AUTH_REQUIRED: { httpStatus: 401, message: 'Bạn cần đăng nhập để tiếp tục.' },
  FORBIDDEN: { httpStatus: 403, message: 'Bạn không có quyền thực hiện thao tác này.' },
  VALIDATION_ERROR: { httpStatus: 400, message: 'Dữ liệu gửi lên chưa hợp lệ, vui lòng kiểm tra lại.' },
  NOT_FOUND: { httpStatus: 404, message: 'Không tìm thấy dữ liệu yêu cầu.' },
  SEAT_TAKEN: { httpStatus: 409, message: 'Ghế bạn chọn vừa có người khác giữ, vui lòng chọn ghế khác.' },
  MAX_SEATS_EXCEEDED: { httpStatus: 422, message: 'Mỗi đơn chỉ được chọn tối đa 8 ghế.' },
  HOLD_EXPIRED: { httpStatus: 409, message: 'Thời gian giữ ghế đã hết, vui lòng chọn lại ghế.' },
  INVALID_STATE_TRANSITION: { httpStatus: 409, message: 'Đơn hàng đang ở trạng thái không cho phép thao tác này.' },
  PAYMENT_AMOUNT_MISMATCH: { httpStatus: 422, message: 'Số tiền thanh toán không khớp với giá trị đơn hàng.' },
  INVALID_SIGNATURE: { httpStatus: 401, message: 'Chữ ký xác thực không hợp lệ.' },
  DUPLICATE_EVENT: { httpStatus: 409, message: 'Sự kiện này đã được xử lý trước đó.' },
  DUPLICATE_REFUND: { httpStatus: 409, message: 'Giao dịch này đã có lệnh hoàn tiền, hệ thống không tạo thêm.' },
  IDEMPOTENCY_CONFLICT: { httpStatus: 409, message: 'Yêu cầu bị trùng mã Idempotency-Key với một yêu cầu khác.' },
  RATE_LIMITED: { httpStatus: 429, message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.' },
  INTERNAL_ERROR: { httpStatus: 500, message: 'Hệ thống đang gặp sự cố, vui lòng thử lại sau.' },
});

/**
 * Lỗi nghiệp vụ có chủ đích. httpStatus và message có thể bỏ trống (null/undefined)
 * để dùng giá trị mặc định trong ERROR_CODES.
 *   throw new AppError('NOT_FOUND');
 *   throw new AppError('SEAT_TAKEN', null, null, { seats: ['A1'] });
 */
class AppError extends Error {
  constructor(code, httpStatus, message, details) {
    const def = ERROR_CODES[code];
    if (!def) throw new TypeError(`Mã lỗi không tồn tại: ${code}`);
    super(message || def.message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus || def.httpStatus;
    this.details = details === undefined ? null : details;
  }
}

module.exports = { ERROR_CODES, AppError };
