'use strict';

const express = require('express');
const { z } = require('zod');
const knex = require('../db/knex');
const { validate } = require('../middleware/validate');
const { asyncHandler, sendOk } = require('../lib/http');
const { AppError } = require('../lib/errors');
const ids = require('../lib/ids');
const clock = require('../lib/clock');
const { REFUND_ESTIMATED_TIMES } = require('../config/constants');
const supportBotService = require('../services/supportBotService');

const router = express.Router();

// Bộ nhớ đệm quản lý giới hạn tra cứu theo IP (RATE_LIMITED)
const lookupAttemptsByIp = new Map();
const MAX_LOOKUP_ATTEMPTS = 10;
const LOOKUP_WINDOW_MS = 60 * 1000; // 1 phút

function checkLookupRateLimit(req, res, next) {
  if (process.env.NODE_ENV === 'test' && req.headers['x-bypass-rate-limit'] === 'true') {
    return next();
  }
  const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  const now = Date.now();
  let record = lookupAttemptsByIp.get(ip);

  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + LOOKUP_WINDOW_MS };
    lookupAttemptsByIp.set(ip, record);
    return next();
  }

  record.count += 1;
  if (record.count > MAX_LOOKUP_ATTEMPTS) {
    return next(new AppError('RATE_LIMITED'));
  }

  next();
}

function _resetLookupRateLimits() {
  lookupAttemptsByIp.clear();
}

// Bộ nhớ đệm quản lý giới hạn chat theo IP
const chatAttemptsByIp = new Map();
const MAX_CHAT_ATTEMPTS = 20; // 20 tin nhắn mỗi phút
const CHAT_WINDOW_MS = 60 * 1000;

function checkChatRateLimit(req, res, next) {
  if (process.env.NODE_ENV === 'test' && req.headers['x-bypass-rate-limit'] === 'true') {
    return next();
  }
  const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  const now = Date.now();
  let record = chatAttemptsByIp.get(ip);

  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + CHAT_WINDOW_MS };
    chatAttemptsByIp.set(ip, record);
    return next();
  }

  record.count += 1;
  if (record.count > MAX_CHAT_ATTEMPTS) {
    return next(new AppError('RATE_LIMITED', 429, 'Tần suất gửi tin nhắn quá nhanh. Vui lòng thử lại sau 1 phút.'));
  }

  next();
}

function _resetChatRateLimits() {
  chatAttemptsByIp.clear();
}

// Chuẩn hoá loại sự cố
const ISSUE_TYPES = Object.freeze({
  DEBITED_NO_TICKET: 'DEBITED_NO_TICKET',
  DOUBLE_PAYMENT: 'DOUBLE_PAYMENT',
  TICKET_NOT_RECEIVED: 'TICKET_NOT_RECEIVED',
  SLOW_REFUND: 'SLOW_REFUND',
  OTHER: 'OTHER',
});

const ISSUE_TYPE_MAP = Object.freeze({
  'DEBITED_NO_TICKET': 'DEBITED_NO_TICKET',
  'TRU_TIEN_CHUA_CO_VE': 'DEBITED_NO_TICKET',
  'trừ tiền chưa có vé': 'DEBITED_NO_TICKET',
  'tru tien chua co ve': 'DEBITED_NO_TICKET',

  'DOUBLE_PAYMENT': 'DOUBLE_PAYMENT',
  'THANH_TOAN_HAI_LAN': 'DOUBLE_PAYMENT',
  'thanh toán hai lần': 'DOUBLE_PAYMENT',
  'thanh toan hai lan': 'DOUBLE_PAYMENT',

  'TICKET_NOT_RECEIVED': 'TICKET_NOT_RECEIVED',
  'CHUA_NHAN_VE': 'TICKET_NOT_RECEIVED',
  'chưa nhận vé': 'TICKET_NOT_RECEIVED',
  'chua nhan ve': 'TICKET_NOT_RECEIVED',

  'SLOW_REFUND': 'SLOW_REFUND',
  'HOAN_TIEN_CHAM': 'SLOW_REFUND',
  'hoàn tiền chậm': 'SLOW_REFUND',
  'hoan tien cham': 'SLOW_REFUND',

  'OTHER': 'OTHER',
  'KHAC': 'OTHER',
  'khác': 'OTHER',
  'khac': 'OTHER',
});

const ISSUE_TYPE_LABELS = Object.freeze({
  DEBITED_NO_TICKET: 'Trừ tiền chưa có vé',
  DOUBLE_PAYMENT: 'Thanh toán hai lần',
  TICKET_NOT_RECEIVED: 'Chưa nhận vé',
  SLOW_REFUND: 'Hoàn tiền chậm',
  OTHER: 'Khác',
});

// Trạng thái bảng support_tickets: Mới, Đang xem xét, Chờ hoàn tiền, Đã xử lý, Từ chối
const TICKET_STATUS_MAP = Object.freeze({
  NEW: { code: 'NEW', label: 'Mới', description: 'Yêu cầu của bạn đã được tiếp nhận và đang chờ phân công xử lý.' },
  IN_REVIEW: { code: 'IN_REVIEW', label: 'Đang xem xét', description: 'Bộ phận CSKH đang tiến hành kiểm tra và xử lý yêu cầu.' },
  WAITING_REFUND: { code: 'WAITING_REFUND', label: 'Chờ hoàn tiền', description: 'Yêu cầu đã được xác nhận và đang chờ hệ thống ngân hàng hoàn tiền.' },
  RESOLVED: { code: 'RESOLVED', label: 'Đã xử lý', description: 'Yêu cầu của bạn đã được xử lý hoàn tất.' },
  REJECTED: { code: 'REJECTED', label: 'Từ chối', description: 'Yêu cầu hỗ trợ đã bị từ chối theo quy định của Beta Cinemas.' },
});

const lookupSchema = z
  .object({
    orderId: z.string().optional(),
    txnId: z.string().optional(),
    contact: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  })
  .refine((data) => data.orderId || data.txnId, {
    message: 'Cần cung cấp mã đơn hàng (orderId) hoặc mã giao dịch (txnId)',
  });

const STATUS_DESCRIPTIONS = Object.freeze({
  HOLDING: 'Đang giữ chỗ',
  AWAITING_PAYMENT: 'Đang chờ thanh toán',
  PENDING_VERIFY: 'Đang xác minh (Đang xác thực giao dịch)',
  PAID: 'Thanh toán thành công (Đã có vé)',
  FAILED: 'Giao dịch thất bại',
  EXPIRED: 'Đơn hàng đã hết hạn giữ chỗ',
  CANCELLED: 'Đơn hàng đã hủy',
  REFUND_PENDING: 'Đã tạo lệnh hoàn (Đang xử lý hoàn tiền)',
  REFUNDED: 'Đã hoàn xong',
});

const REFUND_STATUS_DESCRIPTIONS = Object.freeze({
  CHECKING: 'Đang kiểm tra điều kiện hoàn tiền',
  SENT: 'Đã gửi lệnh hoàn sang cổng thanh toán',
  BANK_PROCESSING: 'Ngân hàng đang xử lý hoàn tiền vào thẻ',
  COMPLETED: 'Tiền đã được hoàn về tài khoản của bạn',
  REJECTED: 'Yêu cầu hoàn tiền bị từ chối',
});

/**
 * Xác định trạng thái thân thiện, dễ hiểu cho khách hàng:
 * - 'đang xác minh'
 * - 'đã có vé'
 * - 'đã tạo lệnh hoàn'
 * - 'đã hoàn xong'
 * - 'thất bại'
 * - 'hết hạn giữ chỗ'
 * - 'đang chờ thanh toán'
 */
function getCustomerFriendlyStatus(orderStatus, refund) {
  if (refund && refund.status === 'COMPLETED') {
    return 'đã hoàn xong';
  }
  if (orderStatus === 'REFUNDED') {
    return 'đã hoàn xong';
  }
  if (orderStatus === 'REFUND_PENDING' || (refund && ['CHECKING', 'SENT', 'BANK_PROCESSING'].includes(refund.status))) {
    return 'đã tạo lệnh hoàn';
  }
  if (orderStatus === 'PAID') {
    return 'đã có vé';
  }
  if (orderStatus === 'PENDING_VERIFY') {
    return 'đang xác minh';
  }
  if (orderStatus === 'FAILED') {
    return 'thất bại';
  }
  if (orderStatus === 'EXPIRED') {
    return 'hết hạn giữ chỗ';
  }
  return 'đang chờ thanh toán';
}

/**
 * POST /support/lookup
 * Tra cứu trạng thái đơn hàng cho khách hàng bằng mã đơn/mã giao dịch + email hoặc SĐT.
 * - Chỉ trả kết quả chi tiết khi email hoặc SĐT khớp hoàn toàn với đơn hàng.
 * - Không khớp: Trả thông báo chung (không tiết lộ đơn hàng có tồn tại hay không).
 * - Giới hạn tần suất tra cứu theo IP (RATE_LIMITED).
 * - Trả trạng thái dễ hiểu: đang xác minh, đã có vé, đã tạo lệnh hoàn, đã hoàn xong.
 */
router.post(
  '/lookup',
  checkLookupRateLimit,
  validate({ body: lookupSchema }),
  asyncHandler(async (req, res) => {
    const { orderId, txnId, contact, email, phone } = req.body;
    const inputContact = (contact || email || phone || '').trim().toLowerCase();

    // 1. Tìm đơn hàng theo orderId hoặc txnId (gateway_txn_id hoặc gateway_trans_no)
    let order = null;

    if (orderId) {
      order = await knex('orders').where({ order_id: orderId.trim() }).first();
    } else if (txnId) {
      const trimmedTxn = txnId.trim();
      const attempt = await knex('payment_attempts')
        .where({ gateway_txn_id: trimmedTxn })
        .orWhere({ gateway_trans_no: trimmedTxn })
        .first();

      if (attempt) {
        order = await knex('orders').where({ order_id: attempt.order_id }).first();
      }
    }

    // 2. Kiểm tra thông tin liên hệ: email hoặc phone
    let isMatched = false;
    if (order && inputContact) {
      const orderEmail = (order.customer_email || '').toLowerCase();
      const orderPhone = (order.customer_phone || '').toLowerCase();

      if (orderEmail === inputContact || orderPhone === inputContact) {
        isMatched = true;
      }
    }

    // 3. Nếu không tìm thấy hoặc không khớp thông tin liên hệ: trả thông báo chung an toàn
    if (!order || !isMatched) {
      return sendOk(res, {
        found: false,
        message:
          'Không tìm thấy thông tin giao dịch phù hợp với thông tin cung cấp. Vui lòng kiểm tra lại mã đơn/giao dịch và email/số điện thoại.',
      });
    }

    // 4. Nếu khớp: lấy thông tin refund, ticket và timeline
    const [refund, ticket, timeline] = await Promise.all([
      knex('refunds')
        .where({ order_id: order.order_id })
        .whereNot('status', 'REJECTED')
        .orderBy('detected_at', 'desc')
        .first(),
      knex('tickets').where({ order_id: order.order_id }).first(),
      knex('order_status_history')
        .where({ order_id: order.order_id })
        .orderBy('at', 'desc')
        .orderBy('id', 'desc'),
    ]);

    const friendlyStatus = getCustomerFriendlyStatus(order.status, refund);

    const result = {
      found: true,
      orderId: order.order_id,
      status: order.status,
      statusText: STATUS_DESCRIPTIONS[order.status] || order.status,
      friendlyStatus,
      customerStatus: friendlyStatus,
      amount: order.amount_total,
      amountTotal: order.amount_total,
      paymentMethod: order.payment_method,
      showtimeId: order.showtime_id,
      createdAt: order.created_at,
      hasRefund: Boolean(refund),
      estimatedRefundTime: refund
        ? (REFUND_ESTIMATED_TIMES[order.payment_method] || REFUND_ESTIMATED_TIMES.DEFAULT)
        : null,
      refund: refund
        ? {
            refundId: refund.refund_id,
            amount: refund.amount,
            status: refund.status,
            statusText: REFUND_STATUS_DESCRIPTIONS[refund.status] || refund.status,
            detectedAt: refund.detected_at,
            sentAt: refund.sent_at,
            completedAt: refund.completed_at,
          }
        : null,
      ticket: ticket
        ? {
            ticketId: ticket.ticket_id,
            ticket_id: ticket.ticket_id,
            qrPayload: ticket.qr_payload,
            status: ticket.status,
            issuedAt: ticket.issued_at,
          }
        : null,
      timeline: timeline.map((h) => ({
        id: h.id,
        fromStatus: h.from_status,
        toStatus: h.to_status,
        reason: h.reason,
        actorType: h.actor_type,
        actorId: h.actor_id,
        at: h.at,
      })),
    };

    sendOk(res, result);
  })
);

/**
 * Helper kiểm tra tệp ảnh biên lai hợp lệ
 * - Dung lượng tối đa: 5MB
 * - Định dạng cho phép: image/jpeg, image/jpg, image/png, image/webp
 */
const MAX_RECEIPT_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function validateReceiptImage(receiptImage) {
  if (!receiptImage) return null;

  let mimeType = '';
  let size = 0;
  let identifier = 'receipt_attachment';

  if (typeof receiptImage === 'string') {
    const trimmed = receiptImage.trim();
    if (trimmed.startsWith('data:')) {
      const match = trimmed.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        throw new AppError('VALIDATION_ERROR', 400, 'Chuỗi ảnh base64 không đúng định dạng.');
      }
      mimeType = match[1].toLowerCase();
      // Kích thước ước lượng từ độ dài base64
      size = Math.round((match[2].length * 3) / 4);
      identifier = 'data_uri';
    } else {
      // Dạng URL
      const extMatch = trimmed.match(/\.(jpg|jpeg|png|webp)(\?.*)?$/i);
      if (!extMatch) {
        throw new AppError('VALIDATION_ERROR', 400, 'Định dạng ảnh biên lai không hợp lệ. Chỉ chấp nhận JPG, PNG, WEBP.');
      }
      mimeType = `image/${extMatch[1].toLowerCase() === 'jpg' ? 'jpeg' : extMatch[1].toLowerCase()}`;
      size = 1024; // Dummy size nếu là link hợp lệ
      identifier = trimmed;
    }
  } else if (typeof receiptImage === 'object') {
    mimeType = (receiptImage.mimeType || receiptImage.type || '').toLowerCase();
    size = Number(receiptImage.size || 0);
    identifier = receiptImage.filename || receiptImage.name || 'receipt_file';

    if (!mimeType && receiptImage.filename) {
      const ext = receiptImage.filename.split('.').pop()?.toLowerCase();
      if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
      else if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'webp') mimeType = 'image/webp';
    }
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new AppError('VALIDATION_ERROR', 400, 'Định dạng ảnh biên lai không hợp lệ. Chỉ chấp nhận JPG, PNG, WEBP.');
  }

  if (size > MAX_RECEIPT_IMAGE_SIZE_BYTES) {
    throw new AppError('VALIDATION_ERROR', 400, 'Dung lượng ảnh biên lai vượt quá giới hạn cho phép (tối đa 5MB).');
  }

  return identifier;
}

const createTicketSchema = z.object({
  orderId: z.string().optional(),
  txnId: z.string().optional(),
  contact: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  issueType: z.string().min(1, 'Vui lòng chọn loại sự cố'),
  description: z.string().min(5, 'Mô tả sự cố phải có ít nhất 5 ký tự').max(2000, 'Mô tả sự cố tối đa 2000 ký tự'),
  receiptImage: z.union([z.string(), z.record(z.any())]).optional(),
});

/**
 * POST /support/tickets
 * Khách hàng tạo ticket hỗ trợ / khiếu nại:
 * - Loại sự cố: trừ tiền chưa có vé, thanh toán hai lần, chưa nhận vé, hoàn tiền chậm, khác.
 * - Mô tả, ảnh biên lai (giới hạn định dạng JPG/PNG/WEBP và dung lượng tối đa 5MB).
 * - Tính sla_due_at (24h).
 * - Kiểm tra mốc 60 phút sau thanh toán theo điều khoản:
 *   + Quá 60 phút: Chuyển trạng thái REJECTED (Từ chối) theo điều khoản khiếu nại của Beta Cinemas.
 *   + Trong vòng 60 phút: Trạng thái NEW (Mới), gắn sla_due_at.
 */
router.post(
  '/tickets',
  checkLookupRateLimit,
  validate({ body: createTicketSchema }),
  asyncHandler(async (req, res) => {
    const { orderId, txnId, contact, email, phone, issueType, description, receiptImage } = req.body;

    const finalContact = (contact || email || phone || '').trim();
    if (!finalContact) {
      throw new AppError('VALIDATION_ERROR', 400, 'Vui lòng cung cấp email hoặc số điện thoại liên hệ.');
    }

    // Chuẩn hoá issueType
    const normalizedKey = issueType.trim().toLowerCase();
    const canonicalIssueType = ISSUE_TYPE_MAP[issueType.trim()] || ISSUE_TYPE_MAP[normalizedKey];
    if (!canonicalIssueType) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'Loại sự cố không hợp lệ. Vui lòng chọn một trong các loại: trừ tiền chưa có vé, thanh toán hai lần, chưa nhận vé, hoàn tiền chậm, khác.'
      );
    }

    // Kiểm tra ảnh biên lai đính kèm
    const attachmentUrl = validateReceiptImage(receiptImage);

    const nowIso = clock.nowIso();
    const nowMs = clock.nowMs();

    const result = await knex.transaction(async (trx) => {
      // 1. Kiểm tra đơn hàng nếu có cung cấp
      let order = null;
      if (orderId && orderId.trim()) {
        order = await trx('orders').where({ order_id: orderId.trim() }).first();
        if (!order) {
          throw new AppError('VALIDATION_ERROR', 400, 'Mã đơn hàng không tồn tại trên hệ thống.');
        }
      } else if (txnId && txnId.trim()) {
        const attempt = await trx('payment_attempts')
          .where({ gateway_txn_id: txnId.trim() })
          .orWhere({ gateway_trans_no: txnId.trim() })
          .first();
        if (attempt) {
          order = await trx('orders').where({ order_id: attempt.order_id }).first();
        }
      }

      // 2. Kiểm tra mốc 60 phút sau thanh toán theo Điều khoản
      // Điều khoản mục 3: Phản hồi trong vòng 60 phút kể từ khi thanh toán thành công.
      // Sau khoảng thời gian trên, Beta Cinemas không chấp nhận giải quyết khiếu nại.
      let isExpired60Min = false;
      let paymentTimestamp = null;

      if (order) {
        const attempt = await trx('payment_attempts')
          .where({ order_id: order.order_id })
          .orderBy('created_at', 'desc')
          .first();

        paymentTimestamp = attempt?.created_at || order.created_at;
        if (paymentTimestamp) {
          const paymentMs = new Date(paymentTimestamp).getTime();
          const diffMinutes = (nowMs - paymentMs) / (60 * 1000);
          if (diffMinutes > 60) {
            isExpired60Min = true;
          }
        }
      }

      const ticketId = ids.newTicketId();
      let status = 'NEW';
      let resolution = null;
      let resolvedAt = null;
      let slaDueAt = null;

      if (isExpired60Min) {
        // Xử lý theo quy định hiện có: Từ chối giải quyết (REJECTED) do quá 60 phút sau thanh toán
        status = 'REJECTED';
        resolution = 'Từ chối: Quá thời hạn khiếu nại 60 phút kể từ khi thanh toán thành công theo điều khoản của Beta Cinemas.';
        resolvedAt = nowIso;
        slaDueAt = null;
      } else {
        // Trong hạn 60 phút: Tiếp nhận (NEW), SLA 24 giờ
        status = 'NEW';
        slaDueAt = new Date(nowMs + 24 * 3600 * 1000).toISOString();
      }

      await trx('support_tickets').insert({
        ticket_id: ticketId,
        order_id: order?.order_id || null,
        user_id: req.user?.id || order?.user_id || null,
        contact: finalContact,
        source: 'CUSTOMER',
        status,
        assigned_to: null,
        sla_due_at: slaDueAt,
        created_at: nowIso,
        resolved_at: resolvedAt,
        resolution,
        issue_type: canonicalIssueType,
        description: description.trim(),
        attachment_url: attachmentUrl,
      });

      // Ghi chú ban đầu của khách hàng
      await trx('support_ticket_notes').insert({
        ticket_id: ticketId,
        author_id: req.user?.id || null,
        note: `[Khách hàng gửi yêu cầu - ${ISSUE_TYPE_LABELS[canonicalIssueType]}]: ${description.trim()}`,
        created_at: nowIso,
      });

      if (isExpired60Min) {
        // Ghi nhận ghi chú tự động từ chối
        await trx('support_ticket_notes').insert({
          ticket_id: ticketId,
          author_id: null,
          note: '[HỆ THỐNG] Tự động từ chối yêu cầu do quá thời hạn khiếu nại 60 phút sau thanh toán theo quy định điều khoản.',
          created_at: nowIso,
        });
      }

      return {
        ticketId,
        orderId: order?.order_id || null,
        issueType: canonicalIssueType,
        issueTypeLabel: ISSUE_TYPE_LABELS[canonicalIssueType],
        status,
        statusLabel: TICKET_STATUS_MAP[status].label,
        statusDescription: TICKET_STATUS_MAP[status].description,
        isExpired60Min,
        slaDueAt,
        resolution,
        message: isExpired60Min
          ? 'Yêu cầu hỗ trợ đã được ghi nhận nhưng bị từ chối do quá thời hạn khiếu nại 60 phút sau khi thanh toán theo điều khoản của Beta Cinemas.'
          : 'Yêu cầu hỗ trợ của bạn đã được gửi thành công. Đội ngũ CSKH sẽ phản hồi trong vòng 24 giờ.',
      };
    });

    sendOk(res, result, {}, 201);
  })
);

/**
 * GET /support/tickets/:code
 * Tra cứu trạng thái phiếu hỗ trợ bằng mã ticket kèm email hoặc SĐT.
 * - Yêu cầu xác thực thông tin liên hệ để bảo mật.
 * - Nếu sai mã ticket hoặc sai thông tin liên hệ: trả cùng một lỗi chung NOT_FOUND (không tiết lộ sự tồn tại).
 * - Không để lộ thông tin nội bộ (assigned_to, ghi chú nội bộ của nhân viên).
 */
router.get(
  '/tickets/:code',
  checkLookupRateLimit,
  asyncHandler(async (req, res) => {
    const code = (req.params.code || '').trim();
    const contact = (req.query.contact || req.query.email || req.query.phone || '').trim().toLowerCase();

    if (!contact) {
      throw new AppError('VALIDATION_ERROR', 400, 'Vui lòng cung cấp email hoặc số điện thoại để tra cứu phiếu hỗ trợ.');
    }

    const ticket = await knex('support_tickets').where({ ticket_id: code }).first();

    let order = null;
    if (ticket && ticket.order_id) {
      order = await knex('orders').where({ order_id: ticket.order_id }).first();
    }

    let isMatched = false;
    if (ticket) {
      const ticketContact = (ticket.contact || '').trim().toLowerCase();
      const orderEmail = (order?.customer_email || '').trim().toLowerCase();
      const orderPhone = (order?.customer_phone || '').trim().toLowerCase();

      if (contact === ticketContact || (order && (contact === orderEmail || contact === orderPhone))) {
        isMatched = true;
      }
    }

    // Nếu không tìm thấy ticket HOẶC thông tin liên hệ không khớp:
    // Trả cùng một lỗi chung NOT_FOUND để ngăn ngừa dò quét mã ticket
    if (!ticket || !isMatched) {
      throw new AppError('NOT_FOUND', 404, 'Không tìm thấy phiếu hỗ trợ phù hợp với thông tin cung cấp. Vui lòng kiểm tra lại mã phiếu và email/số điện thoại.');
    }

    // Không để lộ thông tin nội bộ: assigned_to, source, notes nội bộ của CSKH
    const result = {
      ticketId: ticket.ticket_id,
      orderId: ticket.order_id,
      issueType: ticket.issue_type,
      issueTypeLabel: ISSUE_TYPE_LABELS[ticket.issue_type] || ticket.issue_type,
      description: ticket.description,
      hasAttachment: Boolean(ticket.attachment_url),
      status: ticket.status,
      statusLabel: TICKET_STATUS_MAP[ticket.status]?.label || ticket.status,
      statusDescription: TICKET_STATUS_MAP[ticket.status]?.description,
      slaDueAt: ticket.sla_due_at,
      createdAt: ticket.created_at,
      resolvedAt: ticket.resolved_at,
      resolution: ticket.resolution,
    };

    sendOk(res, result);
  })
);

const chatSchema = z.object({
  session_id: z.string().optional(),
  sessionId: z.string().optional(),
  message: z
    .string({ required_error: 'Vui lòng nhập nội dung tin nhắn' })
    .min(1, 'Nội dung tin nhắn không được để trống')
    .max(500, 'Tin nhắn không được vượt quá 500 ký tự'),
});

/**
 * POST /support/chat
 * Chatbot hỗ trợ dạng AI agent dùng function calling (Gemini @google/genai).
 * - Nhận: { session_id, message }
 * - Trả: { reply, ticket? }
 */
router.post(
  '/chat',
  checkChatRateLimit,
  validate({ body: chatSchema }),
  asyncHandler(async (req, res) => {
    const sessionId = req.body.session_id || req.body.sessionId;
    const message = req.body.message.trim();

    const result = await supportBotService.processUserMessage(sessionId, message);

    res.status(200).json({
      ok: true,
      reply: result.reply,
      ticket: result.ticket || null,
      data: {
        reply: result.reply,
        ticket: result.ticket || null,
      },
    });
  })
);

router._resetLookupRateLimits = _resetLookupRateLimits;
router._resetChatRateLimits = _resetChatRateLimits;

module.exports = router;
