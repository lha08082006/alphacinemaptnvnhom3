'use strict';

const crypto = require('crypto');
const knex = require('../db/knex');
const { AppError } = require('../lib/errors');
const { assertTransition } = require('./orderStateMachine');
const { issueTicket, releaseSeats } = require('./orderService');
const ids = require('../lib/ids');
const logger = require('../lib/logger');
const { env } = require('../config/env');
const { buildPaymentUrl } = require('../lib/vnpay');
const { createOneTimePaymentCheckout, verifyWebhookSignature } = require('../lib/sepay');

/**
 * Cập nhật trạng thái đơn hàng (orders.status) theo máy trạng thái và lưu lịch sử.
 * BẮT BUỘC nằm trong transaction CSDL.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {object} order - Bản ghi đơn hàng hiện tại
 * @param {string} toStatus - Trạng thái đích muốn chuyển sang
 * @param {object} [opts]
 * @param {string} [opts.reason] - Lý do thay đổi trạng thái
 * @param {string} [opts.actorType='SYSTEM'] - 'USER' | 'SYSTEM' | 'GATEWAY' | 'STAFF'
 * @param {number|null} [opts.actorId=null] - ID của người/hệ thống thực hiện
 * @param {object} [opts.extraUpdates={}] - Các trường bổ sung cập nhật vào bảng orders
 * @returns {Promise<object>} Đơn hàng với trạng thái đã cập nhật
 */
async function setStatus(trx, order, toStatus, opts = {}) {
  const { reason = null, actorType = 'SYSTEM', actorId = null, extraUpdates = {} } = opts;

  // Kiểm tra tính hợp lệ chuyển trạng thái qua máy trạng thái chuẩn
  assertTransition(order.status, toStatus);

  const nowIso = new Date().toISOString();

  // 1. Cập nhật bảng orders
  await trx('orders')
    .where({ order_id: order.order_id })
    .update({
      status: toStatus,
      updated_at: nowIso,
      ...extraUpdates,
    });

  // 2. Ghi nhật ký vào order_status_history
  await trx('order_status_history').insert({
    order_id: order.order_id,
    from_status: order.status,
    to_status: toStatus,
    reason,
    actor_type: actorType,
    actor_id: actorId,
    at: nowIso,
  });

  // Đồng bộ object order trong bộ nhớ
  order.status = toStatus;
  order.updated_at = nowIso;
  Object.assign(order, extraUpdates);

  // 3. Gửi thông báo đa kênh theo thứ tự WEB -> EMAIL -> SMS (BR-09)
  if (['PENDING_VERIFY', 'PAID', 'FAILED'].includes(toStatus)) {
    try {
      const { notify } = require('./notificationService');
      await notify(trx, order, toStatus);
    } catch (notifErr) {
      logger.error('notify_in_setStatus_failed', {
        orderId: order.order_id,
        cause: notifErr.message,
      });
    }
  }

  return order;
}

/**
 * Bản đồ chuyển đổi phương thức thanh toán sang mã ngân hàng / phương thức của VNPay
 */
function mapMethodToBankCode(method) {
  switch (method) {
    case 'ATM':
      return 'VNBANK';
    case 'INTL_CARD':
      return 'INTCARD';
    case 'QR':
    case 'WALLET':
      return 'VNPAYQR';
    default:
      return undefined;
  }
}

/**
 * Khởi tạo thanh toán VNPay cho đơn hàng:
 * - Đơn phải thuộc user, đang HOLDING, chưa quá hold_expires_at (nếu quá: HOLD_EXPIRED).
 * - Số tiền lấy từ orders.amount_total, KHÔNG nhận từ client.
 * - Idempotency-Key (BR-11): cùng key + cùng đơn -> trả lại paymentUrl của attempt cũ; cùng key khác đơn -> IDEMPOTENCY_CONFLICT.
 * - Tạo payment_attempts (gateway_txn_id = ids.newTxnId() làm vnp_TxnRef, status REDIRECTED), cập nhật orders.current_attempt_id, chuyển HOLDING -> AWAITING_PAYMENT.
 *
 * @param {object} params
 * @param {number} params.userId
 * @param {string} params.orderId
 * @param {'WALLET'|'ATM'|'INTL_CARD'} params.method
 * @param {string} params.idempotencyKey
 * @param {string} [params.ip='127.0.0.1']
 * @returns {Promise<{ attemptId: string, paymentUrl: string }>}
 */
async function createPayment({ userId, orderId, method, bankCode, termsVersion, idempotencyKey, ip = '127.0.0.1' }) {
  // 1. Kiểm tra Idempotency-Key trước
  const existingAttempt = await knex('payment_attempts')
    .where({ idempotency_key: idempotencyKey })
    .first();

  if (existingAttempt) {
    if (existingAttempt.order_id !== orderId) {
      throw new AppError('IDEMPOTENCY_CONFLICT');
    }

    // Cùng key + cùng đơn: Kiểm tra quyền sở hữu đơn hàng
    const order = await knex('orders').where({ order_id: orderId }).first();
    if (!order || order.user_id !== userId) {
      throw new AppError('NOT_FOUND');
    }

    // Tái tạo paymentUrl cho attempt cũ
    const paymentUrl = buildPaymentUrl({
      txnRef: existingAttempt.gateway_txn_id,
      amountVnd: existingAttempt.amount,
      orderInfo: `Thanh toan don hang ${order.order_id}`,
      ipAddr: ip,
      expireAt: order.hold_expires_at,
      method: bankCode || mapMethodToBankCode(existingAttempt.method),
    });

    return {
      attemptId: existingAttempt.attempt_id,
      paymentUrl,
    };
  }

  // 2. Tìm đơn hàng
  const order = await knex('orders').where({ order_id: orderId }).first();
  if (!order || order.user_id !== userId) {
    throw new AppError('NOT_FOUND');
  }

  // 3. Kiểm tra trạng thái đơn: Phải là HOLDING
  if (order.status !== 'HOLDING') {
    throw new AppError('INVALID_STATE_TRANSITION', 409, 'Đơn hàng không ở trạng thái giữ chỗ.');
  }

  // 4. Kiểm tra thời gian giữ chỗ (hold_expires_at)
  const nowMs = Date.now();
  const expireMs = new Date(order.hold_expires_at).getTime();
  if (expireMs <= nowMs) {
    throw new AppError('HOLD_EXPIRED');
  }

  // 5. Thực hiện khởi tạo trong transaction
  return await knex.transaction(async (trx) => {
    const attemptId = 'ATT_' + ids.randomCode(12);
    const gatewayTxnId = ids.newTxnId();
    const nowIso = new Date().toISOString();

    // Tạo payment_attempts
    await trx('payment_attempts').insert({
      attempt_id: attemptId,
      order_id: order.order_id,
      gateway_txn_id: gatewayTxnId,
      method,
      amount: order.amount_total, // Số tiền lấy từ CSDL
      status: 'REDIRECTED',
      idempotency_key: idempotencyKey,
      created_at: nowIso,
    });

    // Chuyển trạng thái đơn: HOLDING -> AWAITING_PAYMENT, cập nhật current_attempt_id và payment_method, lưu chấp thuận điều khoản
    await setStatus(trx, order, 'AWAITING_PAYMENT', {
      reason: 'Khởi tạo thanh toán VNPay',
      actorType: 'USER',
      actorId: userId,
      extraUpdates: {
        payment_method: method,
        current_attempt_id: attemptId,
        terms_accepted_at: nowIso,
        terms_version: termsVersion || 'v1.0',
      },
    });

    // Tạo URL thanh toán VNPay
    const paymentUrl = buildPaymentUrl({
      txnRef: gatewayTxnId,
      amountVnd: order.amount_total,
      orderInfo: `Thanh toan don hang ${order.order_id}`,
      ipAddr: ip,
      expireAt: order.hold_expires_at,
      method: bankCode || mapMethodToBankCode(method),
    });

    return {
      attemptId,
      paymentUrl,
    };
  });
}

/**
 * Áp dụng kết quả giao dịch từ cổng thanh toán (IPN, Return dev và Đối soát).
 * Đây là điểm DUY NHẤT cập nhật kết quả cổng vào hệ thống.
 * Toàn bộ thực thi trong 1 transaction CSDL.
 *
 * @param {object} params
 * @param {string} params.txnRef - Mã giao dịch gửi sang cổng (gateway_txn_id)
 * @param {string|number} [params.transNo] - Mã giao dịch VNPay cấp (gateway_trans_no)
 * @param {number} params.amountVnd - Số tiền VND thực tế cổng gửi về
 * @param {string} params.responseCode - Mã phản hồi (00 = thành công)
 * @param {string} [params.transactionStatus] - Trạng thái giao dịch cổng (00 = thành công)
 * @param {string} [params.payDate] - Thời gian thanh toán (yyyyMMddHHmmss)
 * @param {string} [params.bankCode] - Mã ngân hàng
 * @param {object} [params.raw] - Dữ liệu thô từ cổng gửi về
 * @returns {Promise<{ RspCode: string, Message: string }>}
 */
async function applyGatewayResult({
  txnRef,
  transNo,
  amountVnd,
  responseCode,
  transactionStatus,
  payDate,
  bankCode,
  raw,
}) {
  return await knex.transaction(async (trx) => {
    const eventId = `${txnRef}:${transNo || '0'}:${responseCode}`;
    const nowIso = new Date().toISOString();

    // 1. Chống trùng lặp (Idempotency của webhook)
    const existingEvent = await trx('webhook_events').where({ event_id: eventId }).first();
    if (existingEvent) {
      return { RspCode: '02', Message: 'Order already confirmed' };
    }

    // 2. Tìm payment_attempts tương ứng
    const attempt = await trx('payment_attempts').where({ gateway_txn_id: txnRef }).first();
    if (!attempt) {
      // Không thấy attempt -> ghi nhận webhook REJECTED và trả '01'
      await trx('webhook_events').insert({
        event_id: eventId,
        gateway_txn_id: txnRef,
        payload_json: JSON.stringify(raw || {}),
        signature_valid: true,
        received_at: nowIso,
        processed_at: nowIso,
        result: 'REJECTED',
        reject_reason: 'Order not found',
      });
      return { RspCode: '01', Message: 'Order not found' };
    }

    // 3. Kiểm tra số tiền: So sánh với payment_attempts.amount
    if (Number(attempt.amount) !== Number(amountVnd)) {
      // Số tiền lệch -> RspCode '04', ghi webhook_events REJECTED và tạo support_ticket nguồn SYSTEM, KHÔNG đổi đơn.
      await trx('webhook_events').insert({
        event_id: eventId,
        gateway_txn_id: txnRef,
        payload_json: JSON.stringify(raw || {}),
        signature_valid: true,
        received_at: nowIso,
        processed_at: nowIso,
        result: 'REJECTED',
        reject_reason: `Số tiền thanh toán lệch: cổng trả ${amountVnd}, hệ thống yêu cầu ${attempt.amount}`,
      });

      const order = await trx('orders').where({ order_id: attempt.order_id }).first();
      await trx('support_tickets').insert({
        ticket_id: 'ST_' + ids.randomCode(10),
        order_id: attempt.order_id,
        user_id: order ? order.user_id : null,
        contact: order ? (order.customer_email || order.customer_phone || 'SYSTEM') : 'SYSTEM',
        source: 'SYSTEM',
        status: 'NEW',
        created_at: nowIso,
        resolution: `Lệch số tiền thanh toán VNPay: cổng trả về ${amountVnd} VND, hệ thống yêu cầu ${attempt.amount} VND (txnRef: ${txnRef})`,
      });

      return { RspCode: '04', Message: 'Invalid amount' };
    }

    // 4. Xử lý kết quả giao dịch
    const isSuccess =
      String(responseCode) === '00' &&
      (transactionStatus === undefined || String(transactionStatus) === '00');

    const order = await trx('orders').where({ order_id: attempt.order_id }).first();
    let webhookResult = 'APPLIED';
    let rejectReason = null;

    if (isSuccess) {
      // Cập nhật attempt thành SUCCESS
      await trx('payment_attempts').where({ attempt_id: attempt.attempt_id }).update({
        status: 'SUCCESS',
        callback_at: nowIso,
        gateway_trans_no: transNo ? String(transNo) : null,
        gateway_pay_date: payDate ? String(payDate) : null,
        gateway_response_code: responseCode ? String(responseCode) : null,
        bank_code: bankCode ? String(bankCode) : null,
      });

      if (order) {
        if (order.status === 'AWAITING_PAYMENT') {
          // Thành công bình thường: chuyển sang PAID
          await setStatus(trx, order, 'PAID', {
            reason: 'VNPay thanh toán thành công',
            actorType: 'GATEWAY',
            extraUpdates: {
              paid_at: nowIso,
              callback_at: nowIso,
            },
          });

          // Xuất vé và cập nhật ghế sang SOLD (orderService)
          await issueTicket(trx, order);
          webhookResult = 'APPLIED';
        } else if (order.status === 'PENDING_VERIFY') {
          // BR-10: callback đến muộn khi đơn đang PENDING_VERIFY -> chuyển sang PAID
          await setStatus(trx, order, 'PAID', {
            reason: 'VNPay callback muộn khi đang PENDING_VERIFY (BR-10)',
            actorType: 'GATEWAY',
            extraUpdates: {
              paid_at: nowIso,
              callback_at: nowIso,
            },
          });

          // Xuất vé và cập nhật ghế sang SOLD (orderService)
          await issueTicket(trx, order);
          webhookResult = 'LATE_APPLIED';
        } else if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(order.status)) {
          // Đơn đã FAILED/EXPIRED/CANCELLED mà vẫn nhận tiền: KHÔNG chuyển PAID, ghi LATE_APPLIED
          webhookResult = 'LATE_APPLIED';
          rejectReason = `Nhận tiền cho đơn đã kết thúc ở trạng thái ${order.status}`;
          
          // BR-07: Gọi refundService để đánh giá và tạo lệnh hoàn tiền tự động
          const { evaluateAndCreate } = require('./refundService');
          try {
            await evaluateAndCreate(trx, order, {
              ...attempt,
              status: 'SUCCESS',
              gateway_response_code: responseCode,
              gateway_trans_no: transNo,
              gateway_pay_date: payDate,
              bank_code: bankCode,
              amount: amountVnd,
            });
          } catch (rfErr) {
            logger.error('applyGatewayResult_refund_failed', {
              orderId: order.order_id,
              cause: rfErr.message,
            });
          }
        } else if (order.status === 'PAID') {
          webhookResult = 'DUPLICATE';
        }
      }
    } else {
      // Giao dịch cổng thất bại
      await trx('payment_attempts').where({ attempt_id: attempt.attempt_id }).update({
        status: 'FAILED',
        callback_at: nowIso,
        gateway_trans_no: transNo ? String(transNo) : null,
        gateway_pay_date: payDate ? String(payDate) : null,
        gateway_response_code: responseCode ? String(responseCode) : null,
        bank_code: bankCode ? String(bankCode) : null,
      });

      if (order && order.status === 'AWAITING_PAYMENT') {
        await setStatus(trx, order, 'FAILED', {
          reason: `VNPay báo thất bại (code: ${responseCode})`,
          actorType: 'GATEWAY',
          extraUpdates: {
            callback_at: nowIso,
          },
        });
        // Nhả ghế (xóa showtime_seats HELD) khi đơn FAILED
        await releaseSeats(trx, order.order_id);
      }
      webhookResult = 'APPLIED';
      rejectReason = `Cổng báo lỗi: responseCode=${responseCode}`;
    }

    // 5. Luôn INSERT webhook_events
    await trx('webhook_events').insert({
      event_id: eventId,
      gateway_txn_id: txnRef,
      payload_json: JSON.stringify(raw || {}),
      signature_valid: true,
      received_at: nowIso,
      processed_at: nowIso,
      result: webhookResult,
      reject_reason: rejectReason,
    });

    return { RspCode: '00', Message: 'Confirm Success' };
  });
}

/**
 * Khởi tạo phiên thanh toán SePay cho đơn hàng đang ở trạng thái HOLD (HOLDING):
 * - Đơn phải thuộc user (nếu userId có truyền), đang HOLDING, chưa quá hold_expires_at (nếu quá: HOLD_EXPIRED).
 * - Số tiền lấy từ orders.amount_total (số nguyên VND), KHÔNG nhận từ client.
 * - Idempotency-Key: cùng key + cùng đơn -> trả lại thông tin attempt cũ; cùng key khác đơn -> IDEMPOTENCY_CONFLICT.
 * - Khởi tạo checkout URL & one-time payment fields bằng SePay SDK (sepay-pg-node).
 * - Trong Knex transaction:
 *   - Tạo payment_attempts (gateway_txn_id = order.order_id, method = 'BANK_TRANSFER', amount = order.amount_total, status = 'REDIRECTED').
 *   - Chuyển trạng thái đơn sang AWAITING_PAYMENT bằng setStatus(trx, order, 'AWAITING_PAYMENT', ...).
 * - Trả về: { attemptId, orderId, checkoutUrl, fields, paymentUrl }
 */
async function createSepayPayment({
  userId,
  orderId,
  paymentMethod = 'BANK_TRANSFER',
  termsVersion,
  idempotencyKey,
  successUrl,
  errorUrl,
  cancelUrl,
  customData,
}) {
  // 1. Kiểm tra Idempotency-Key nếu được cung cấp
  if (idempotencyKey) {
    const existingAttempt = await knex('payment_attempts')
      .where({ idempotency_key: idempotencyKey })
      .first();

    if (existingAttempt) {
      if (existingAttempt.order_id !== orderId) {
        throw new AppError('IDEMPOTENCY_CONFLICT');
      }

      const order = await knex('orders').where({ order_id: orderId }).first();
      if (!order || (userId && order.user_id !== userId)) {
        throw new AppError('NOT_FOUND');
      }

      const { checkoutUrl, fields } = createOneTimePaymentCheckout({
        orderInvoiceNumber: existingAttempt.gateway_txn_id,
        orderAmount: existingAttempt.amount,
        orderDescription: `Thanh toan don hang ${order.order_id}`,
        paymentMethod: existingAttempt.method || paymentMethod,
        successUrl,
        errorUrl,
        cancelUrl,
        customData,
      });

      return {
        attemptId: existingAttempt.attempt_id,
        orderId: order.order_id,
        checkoutUrl,
        fields,
        paymentUrl: checkoutUrl,
      };
    }
  }

  // 2. Tìm đơn hàng
  const order = await knex('orders').where({ order_id: orderId }).first();
  if (!order || (userId && order.user_id !== userId)) {
    throw new AppError('NOT_FOUND');
  }

  // 3. Kiểm tra trạng thái đơn: Phải là HOLDING
  if (order.status !== 'HOLDING') {
    throw new AppError('INVALID_STATE_TRANSITION', 409, 'Đơn hàng không ở trạng thái giữ chỗ.');
  }

  // 4. Kiểm tra thời gian giữ chỗ (hold_expires_at)
  const nowMs = Date.now();
  const expireMs = new Date(order.hold_expires_at).getTime();
  if (expireMs <= nowMs) {
    throw new AppError('HOLD_EXPIRED', 410, 'Thời gian giữ chỗ đã hết hạn.');
  }

  // 5. Thực hiện khởi tạo trong transaction
  return await knex.transaction(async (trx) => {
    const attemptId = 'ATT_' + ids.randomCode(12);
    const gatewayTxnId = order.order_id; // Mã hóa đơn dùng cho SePay
    const nowIso = new Date().toISOString();
    const finalIdempKey = idempotencyKey || ('IDEMP_' + ids.randomCode(16));

    // Tạo payment_attempts
    await trx('payment_attempts').insert({
      attempt_id: attemptId,
      order_id: order.order_id,
      gateway_txn_id: gatewayTxnId,
      method: paymentMethod || 'BANK_TRANSFER',
      amount: order.amount_total, // Số tiền lấy từ CSDL (số nguyên VND)
      status: 'REDIRECTED',
      idempotency_key: finalIdempKey,
      created_at: nowIso,
    });

    // Chuyển trạng thái đơn: HOLDING -> AWAITING_PAYMENT
    await setStatus(trx, order, 'AWAITING_PAYMENT', {
      reason: 'Khởi tạo thanh toán SePay (Sandbox)',
      actorType: 'USER',
      actorId: userId || null,
      extraUpdates: {
        payment_method: 'BANK_TRANSFER',
        current_attempt_id: attemptId,
        terms_accepted_at: nowIso,
        terms_version: termsVersion || 'v1.0',
      },
    });

    // Sinh checkout URL và form fields có signature từ SePay SDK
    const { checkoutUrl, fields } = createOneTimePaymentCheckout({
      orderInvoiceNumber: gatewayTxnId,
      orderAmount: order.amount_total,
      orderDescription: `Thanh toan don hang ${order.order_id}`,
      paymentMethod,
      successUrl: successUrl || `${env.SEPAY_RETURN_URL}?orderId=${order.order_id}&gateway=sepay&status=success`,
      errorUrl: errorUrl || `${env.SEPAY_CANCEL_URL || env.SEPAY_RETURN_URL}?orderId=${order.order_id}&gateway=sepay&status=error`,
      cancelUrl: cancelUrl || `${env.SEPAY_CANCEL_URL || env.SEPAY_RETURN_URL}?orderId=${order.order_id}&gateway=sepay&status=cancelled`,
      customData,
    });

    return {
      attemptId,
      orderId: order.order_id,
      checkoutUrl,
      fields,
      paymentUrl: checkoutUrl,
    };
  });
}

/**
 * Xử lý Webhook / IPN từ SePay (Sandbox & Production):
 * - Xác thực chữ ký nếu có header X-SePay-Signature
 * - Chống lặp (Idempotency) qua bảng webhook_events
 * - Đối chiếu mã đơn (order_invoice_number) và số tiền (order_amount)
 * - Chuyển trạng thái đơn sang PAID bằng setStatus(trx, order, 'PAID') -> gọi assertTransition -> ghi order_status_history
 * - Ghi nhận payment_attempts và webhook_events
 */
async function applySepayIpn({ payload, headers = {}, rawBody }) {
  const safePayload = payload || {};
  const orderInvoiceNumber =
    safePayload.order?.order_invoice_number ||
    safePayload.order_invoice_number ||
    safePayload.orderId ||
    safePayload.order_id;

  const rawAmount =
    safePayload.order?.order_amount !== undefined
      ? safePayload.order.order_amount
      : safePayload.transaction?.transfer_amount !== undefined
        ? safePayload.transaction.transfer_amount
        : safePayload.transaction?.transaction_amount !== undefined
          ? safePayload.transaction.transaction_amount
          : safePayload.order_amount !== undefined
            ? safePayload.order_amount
            : safePayload.amount || 0;

  const amountVnd = Math.round(Number(rawAmount));

  const notificationType = safePayload.notification_type;
  const orderStatus = safePayload.order?.order_status;
  const transStatus =
    safePayload.transaction?.transaction_status ||
    safePayload.transaction_status ||
    safePayload.status;

  const isSuccess =
    notificationType === 'ORDER_PAID' ||
    orderStatus === 'CAPTURED' ||
    transStatus === 'APPROVED' ||
    transStatus === 'SUCCESS';

  const transNo =
    safePayload.transaction?.id ||
    safePayload.sepay_transaction_id ||
    safePayload.transaction_id ||
    safePayload.id ||
    safePayload.order?.id;

  const bankCode =
    safePayload.transaction?.gateway ||
    safePayload.bank_code ||
    'BANK_TRANSFER';

  const payDate =
    safePayload.transaction?.transaction_date ||
    safePayload.transaction_date ||
    safePayload.pay_date ||
    null;

  // Xác thực chữ ký nếu header X-SePay-Signature được cung cấp
  const signatureHeader =
    headers['x-sepay-signature'] ||
    headers['X-SePay-Signature'] ||
    headers['x-signature'] ||
    headers['X-Signature'];
  const timestamp =
    headers['x-sepay-timestamp'] ||
    headers['X-SePay-Timestamp'] ||
    headers['x-timestamp'] ||
    headers['X-Timestamp'];

  let signatureValid = true;
  if (signatureHeader) {
    signatureValid = verifyWebhookSignature({
      signatureHeader,
      timestamp,
      rawBody: rawBody || safePayload,
      secretKey: env.SEPAY_SECRET_KEY,
    });

    if (!signatureValid) {
      const nowIso = new Date().toISOString();
      const eventId = `SEPAY:${orderInvoiceNumber || 'UNKNOWN'}:${transNo || '0'}:SIG_FAILED`;
      const existingSig = await knex('webhook_events').where({ event_id: eventId }).first();
      if (existingSig) {
        await knex('webhook_events').where({ event_id: eventId }).update({
          processed_at: nowIso,
          reject_reason: 'Invalid signature',
        });
      } else {
        await knex('webhook_events').insert({
          event_id: eventId,
          gateway_txn_id: String(orderInvoiceNumber || 'UNKNOWN'),
          payload_json: JSON.stringify(safePayload),
          signature_valid: false,
          received_at: nowIso,
          processed_at: nowIso,
          result: 'REJECTED',
          reject_reason: 'Invalid signature',
        });
      }
      return { success: false, message: 'Invalid signature' };
    }
  }

  return await knex.transaction(async (trx) => {
    const eventId = `SEPAY:${orderInvoiceNumber || 'UNKNOWN'}:${transNo || '0'}:${isSuccess ? 'SUCCESS' : 'FAILED'}`;
    const nowIso = new Date().toISOString();

    // 1. Chống trùng lặp (Idempotency của webhook)
    const existingEvent = await trx('webhook_events')
      .where({ event_id: eventId })
      .first();

    if (existingEvent && ['APPLIED', 'LATE_APPLIED', 'DUPLICATE'].includes(existingEvent.result)) {
      return { success: true, message: 'Order already confirmed', duplicate: true };
    }

    // Helper ghi nhận / cập nhật webhook_events an toàn không văng lỗi UNIQUE constraint
    async function recordEvent(resultStatus, reason, txnId = orderInvoiceNumber) {
      if (existingEvent) {
        await trx('webhook_events').where({ event_id: eventId }).update({
          gateway_txn_id: String(txnId || orderInvoiceNumber || 'UNKNOWN'),
          payload_json: JSON.stringify(safePayload),
          signature_valid: signatureValid,
          processed_at: nowIso,
          result: resultStatus,
          reject_reason: reason || null,
        });
      } else {
        await trx('webhook_events').insert({
          event_id: eventId,
          gateway_txn_id: String(txnId || orderInvoiceNumber || 'UNKNOWN'),
          payload_json: JSON.stringify(safePayload),
          signature_valid: signatureValid,
          received_at: nowIso,
          processed_at: nowIso,
          result: resultStatus,
          reject_reason: reason || null,
        });
      }
    }

    // 2. Tìm payment_attempts tương ứng
    const attempt = await trx('payment_attempts')
      .where({ gateway_txn_id: orderInvoiceNumber || '' })
      .orWhere({ order_id: orderInvoiceNumber || '' })
      .first();

    if (!attempt) {
      await recordEvent('REJECTED', 'Order not found', orderInvoiceNumber || 'UNKNOWN');
      return { success: false, message: 'Order not found' };
    }

    // 3. Kiểm tra số tiền: So sánh với payment_attempts.amount (Số nguyên VND)
    if (Number(attempt.amount) !== amountVnd) {
      await recordEvent(
        'REJECTED',
        `Số tiền thanh toán lệch: cổng trả ${amountVnd}, hệ thống yêu cầu ${attempt.amount}`,
        attempt.gateway_txn_id
      );

      const existingTicket = await trx('support_tickets')
        .where({ order_id: attempt.order_id, source: 'SYSTEM' })
        .andWhere('resolution', 'like', '%Lệch số tiền thanh toán SePay%')
        .first();

      if (!existingTicket) {
        const order = await trx('orders').where({ order_id: attempt.order_id }).first();
        await trx('support_tickets').insert({
          ticket_id: 'ST_' + ids.randomCode(10),
          order_id: attempt.order_id,
          user_id: order ? order.user_id : null,
          contact: order ? (order.customer_email || order.customer_phone || 'SYSTEM') : 'SYSTEM',
          source: 'SYSTEM',
          status: 'NEW',
          created_at: nowIso,
          resolution: `Lệch số tiền thanh toán SePay: cổng trả về ${amountVnd} VND, hệ thống yêu cầu ${attempt.amount} VND (invoice: ${orderInvoiceNumber})`,
        });
      }

      return { success: false, message: 'Invalid amount' };
    }

    // 4. Xử lý kết quả giao dịch
    const order = await trx('orders').where({ order_id: attempt.order_id }).first();
    let webhookResult = 'APPLIED';
    let rejectReason = null;

    if (isSuccess) {
      await trx('payment_attempts').where({ attempt_id: attempt.attempt_id }).update({
        status: 'SUCCESS',
        callback_at: nowIso,
        gateway_trans_no: transNo ? String(transNo) : null,
        gateway_response_code: '00',
        bank_code: bankCode,
        gateway_pay_date: payDate,
      });

      if (order) {
        if (order.status === 'AWAITING_PAYMENT') {
          await setStatus(trx, order, 'PAID', {
            reason: 'SePay thanh toán thành công',
            actorType: 'GATEWAY',
            extraUpdates: {
              paid_at: nowIso,
              callback_at: nowIso,
              payment_method: 'BANK_TRANSFER',
            },
          });
          await issueTicket(trx, order);
          webhookResult = 'APPLIED';
        } else if (order.status === 'HOLDING') {
          // Xử lý an toàn khi IPN đến sớm: HOLDING -> AWAITING_PAYMENT -> PAID
          await setStatus(trx, order, 'AWAITING_PAYMENT', {
            reason: 'Khởi tạo thanh toán SePay (IPN)',
            actorType: 'GATEWAY',
          });
          await setStatus(trx, order, 'PAID', {
            reason: 'SePay thanh toán thành công',
            actorType: 'GATEWAY',
            extraUpdates: {
              paid_at: nowIso,
              callback_at: nowIso,
              payment_method: 'BANK_TRANSFER',
            },
          });
          await issueTicket(trx, order);
          webhookResult = 'APPLIED';
        } else if (order.status === 'PENDING_VERIFY') {
          await setStatus(trx, order, 'PAID', {
            reason: 'SePay callback muộn khi đang PENDING_VERIFY (BR-10)',
            actorType: 'GATEWAY',
            extraUpdates: {
              paid_at: nowIso,
              callback_at: nowIso,
              payment_method: 'BANK_TRANSFER',
            },
          });
          await issueTicket(trx, order);
          webhookResult = 'LATE_APPLIED';
        } else if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(order.status)) {
          webhookResult = 'LATE_APPLIED';
          rejectReason = `Nhận tiền cho đơn đã kết thúc ở trạng thái ${order.status}`;

          // BR-07: Gọi refundService để đánh giá và tạo lệnh hoàn tiền tự động
          const { evaluateAndCreate } = require('./refundService');
          try {
            await evaluateAndCreate(trx, order, {
              ...attempt,
              status: 'SUCCESS',
              gateway_response_code: '00',
              gateway_trans_no: transNo ? String(transNo) : attempt.gateway_txn_id,
              gateway_pay_date: payDate || nowIso,
              bank_code: bankCode,
              amount: amountVnd,
            });
          } catch (rfErr) {
            logger.error('applySepayIpn_refund_failed', {
              orderId: order.order_id,
              cause: rfErr.message,
            });
          }
        } else if (['PAID', 'REFUND_PENDING', 'REFUNDED'].includes(order.status)) {
          webhookResult = 'DUPLICATE';
        }
      }
    } else {
      await trx('payment_attempts').where({ attempt_id: attempt.attempt_id }).update({
        status: 'FAILED',
        callback_at: nowIso,
        gateway_trans_no: transNo ? String(transNo) : null,
        gateway_response_code: 'FAILED',
      });

      if (order && order.status === 'AWAITING_PAYMENT') {
        await setStatus(trx, order, 'FAILED', {
          reason: 'SePay thanh toán thất bại',
          actorType: 'GATEWAY',
          extraUpdates: {
            callback_at: nowIso,
          },
        });
        await releaseSeats(trx, order.order_id);
      } else if (order && order.status === 'HOLDING') {
        await setStatus(trx, order, 'CANCELLED', {
          reason: 'SePay thanh toán thất bại từ trạng thái giữ chỗ',
          actorType: 'GATEWAY',
          extraUpdates: {
            callback_at: nowIso,
          },
        });
        await releaseSeats(trx, order.order_id);
      }
      webhookResult = 'APPLIED';
      rejectReason = 'SePay reported payment failure';
    }

    // 5. Ghi nhật ký vào webhook_events
    await recordEvent(webhookResult, rejectReason, attempt.gateway_txn_id);

    return {
      success: true,
      message: 'IPN processed successfully',
      result: webhookResult,
    };
  });
}

module.exports = {
  setStatus,
  createPayment,
  applyGatewayResult,
  createSepayPayment,
  applySepayIpn,
};
