'use strict';

const knex = require('../db/knex');
const clock = require('../lib/clock');
const ids = require('../lib/ids');
const logger = require('../lib/logger');
const vnpay = require('../lib/vnpay');
const { AppError } = require('../lib/errors');
const { DEFAULT_SETTINGS } = require('../config/constants');
const { setStatus } = require('./paymentService');

let gatewayAdapter = vnpay;

/**
 * Thiết lập gateway adapter (dùng cho testing/mocking).
 * @param {object} adapter
 */
function setGatewayAdapter(adapter) {
  gatewayAdapter = adapter;
}

/**
 * Đọc cấu hình từ bảng settings, fallback về DEFAULT_SETTINGS.
 * @param {import('knex').Knex|import('knex').Knex.Transaction} [trx=knex]
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
async function getSettings(trx = knex) {
  try {
    const rows = await trx('settings').select('key', 'value');
    const settings = { ...DEFAULT_SETTINGS };

    for (const row of rows) {
      if (row.key in settings) {
        if (typeof DEFAULT_SETTINGS[row.key] === 'number') {
          settings[row.key] = Number(row.value);
        } else {
          settings[row.key] = row.value;
        }
      }
    }

    return settings;
  } catch (_err) {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Đánh giá 5 điều kiện an toàn (5 Golden Rules - BR-07) và tạo lệnh hoàn tiền tự động nếu thỏa mãn:
 * - Điều kiện a: Cổng xác nhận SUCCESS và đã trừ tiền.
 * - Điều kiện b: Beta chưa có vé hợp lệ (bảng tickets).
 * - Điều kiện c: Số tiền hoàn khớp chính xác với số tiền cổng đã trừ.
 * - Điều kiện d: Chưa có lệnh refund nào cho gateway_txn_id này (trạng thái khác REJECTED).
 * - Điều kiện e: Đơn chưa bị CSKH xử lý thủ công (kiểm tra support_tickets và audit_log).
 *
 * Nếu đủ cả 5: INSERT vào bảng refunds (type AUTO, status CHECKING, detected_at, send_due_at = +24h, checks_json),
 * và chuyển trạng thái đơn hàng: order -> REFUND_PENDING (qua setStatus).
 * Nếu thiếu: Tạo support_ticket nguồn SYSTEM, không tự hoàn.
 * Bắt lỗi unique idx_refunds_unique_txn ném DUPLICATE_REFUND.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {object} order - Bản ghi đơn hàng từ bảng orders
 * @param {object} attempt - Bản ghi payment_attempts hoặc thông tin giao dịch cổng
 * @returns {Promise<{ ok: boolean, refundId?: string, ticketId?: string, checks: object, reason?: string }>}
 */
async function evaluateAndCreate(trx, order, attempt) {
  const refundAmount = Number(order.amount_total);
  const attemptAmount = Number(attempt.amount !== undefined ? attempt.amount : attempt.attempt_amount);
  const gatewayAmount =
    attempt.amount_gateway !== undefined ? Number(attempt.amount_gateway) : attemptAmount;

  // Điều kiện a: Cổng xác nhận SUCCESS và đã trừ tiền
  const checkA = Boolean(
    attempt.status === 'SUCCESS' ||
      attempt.gateway_response_code === '00' ||
      attempt.gateway_debited === true ||
      attempt.debited === true
  );

  // Điều kiện b: Beta chưa có vé hợp lệ
  const validTicket = await trx('tickets')
    .where({ order_id: order.order_id, status: 'VALID' })
    .first();
  const checkB = !validTicket;

  // Điều kiện c: Số tiền hoàn khớp với số tiền cổng đã trừ và giá trị đơn
  const checkC = Boolean(
    refundAmount > 0 && refundAmount === attemptAmount && refundAmount === gatewayAmount
  );

  // Điều kiện d: Chưa có refund nào cho gateway_txn_id này
  const existingRefund = await trx('refunds')
    .where({ gateway_txn_id: attempt.gateway_txn_id })
    .whereNot('status', 'REJECTED')
    .first();
  const checkD = !existingRefund;

  // Điều kiện e: Đơn chưa bị CSKH xử lý thủ công (support_tickets không phải SYSTEM hoặc audit_log)
  const manualTicket = await trx('support_tickets')
    .where({ order_id: order.order_id })
    .whereNot('source', 'SYSTEM')
    .first();

  let manualAudit = null;
  try {
    manualAudit = await trx('audit_log')
      .where({ entity_type: 'ORDER', entity_id: order.order_id })
      .whereNot('actor_type', 'SYSTEM')
      .first();
  } catch (_e) {
    // Nếu bảng audit_log không có cột tương ứng thì bỏ qua
  }
  const checkE = !manualTicket && !manualAudit;

  const checks = {
    a: checkA,
    b: checkB,
    c: checkC,
    d: checkD,
    e: checkE,
  };

  const allPassed = checkA && checkB && checkC && checkD && checkE;

  if (allPassed) {
    const refundId = ids.newRefundId();
    const detectedAt = clock.nowIso();
    const sendDueAt = new Date(clock.nowMs() + 24 * 3600 * 1000).toISOString();

    try {
      await trx('refunds').insert({
        refund_id: refundId,
        order_id: order.order_id,
        gateway_txn_id: attempt.gateway_txn_id,
        amount: refundAmount,
        type: 'AUTO',
        status: 'CHECKING',
        detected_at: detectedAt,
        send_due_at: sendDueAt,
        checks_json: JSON.stringify(checks),
        sla_breached: false,
        created_by: null, // SYSTEM
      });
    } catch (err) {
      if (
        err.message &&
        (err.message.includes('idx_refunds_unique_txn') ||
          err.message.includes('UNIQUE constraint failed'))
      ) {
        throw new AppError('DUPLICATE_REFUND');
      }
      throw err;
    }

    // Chuyển trạng thái đơn: order -> REFUND_PENDING
    await setStatus(trx, order, 'REFUND_PENDING', {
      reason: 'Đủ 5 điều kiện hoàn tiền tự động (BR-07)',
      actorType: 'SYSTEM',
    });

    return {
      ok: true,
      refundId,
      status: 'CHECKING',
      checks,
    };
  }

  // Nếu vi phạm điều kiện d do đã có lệnh hoàn tiền -> ném lỗi DUPLICATE_REFUND
  if (!checkD) {
    throw new AppError('DUPLICATE_REFUND');
  }

  // Thiếu điều kiện: tạo support_ticket nguồn SYSTEM, không tự hoàn
  const failedReasons = [];
  if (!checkA) failedReasons.push('Cổng chưa xác nhận thành công hoặc chưa trừ tiền (a)');
  if (!checkB) failedReasons.push('Đã có vé hợp lệ trong hệ thống (b)');
  if (!checkC) failedReasons.push('Số tiền hoàn không khớp số tiền cổng đã trừ (c)');
  if (!checkE) failedReasons.push('Đơn hàng đã bị can thiệp xử lý thủ công (e)');

  const ticketId = 'ST_' + ids.randomCode(10);
  const nowIso = clock.nowIso();

  await trx('support_tickets').insert({
    ticket_id: ticketId,
    order_id: order.order_id,
    user_id: order.user_id || null,
    contact: order.customer_email || order.customer_phone || 'SYSTEM',
    source: 'SYSTEM',
    status: 'NEW',
    created_at: nowIso,
    resolution: `Không đủ 5 điều kiện hoàn tiền tự động (BR-07): ${failedReasons.join('; ')}`,
  });

  return {
    ok: false,
    ticketId,
    checks,
    reason: failedReasons.join('; '),
  };
}

/**
 * Xử lý hàng đợi hoàn tiền:
 * - Đánh dấu sla_breached = true nếu quá send_due_at mà chưa gửi.
 * - Quét các refund CHECKING đã quá settings.refundSendDelayMin:
 *   + Gọi vnpay.refund.
 *   + Nếu OK -> status: 'SENT' -> 'BANK_PROCESSING' (lưu sent_at, gateway_request_id).
 *   + Nếu hoàn tất -> status: 'COMPLETED' + chuyển đơn sang REFUNDED.
 *   + Nếu bị từ chối -> status: 'REJECTED' + reject_reason.
 *
 * @param {object} [options={}]
 * @param {object} [options.gatewayAdapter]
 * @param {string} [options.targetRefundId]
 * @param {boolean} [options.completeImmediately]
 * @param {boolean} [options.advanceBankProcessing]
 * @returns {Promise<Array<{ refundId: string, status: string }>>}
 */
async function processRefundQueue(options = {}) {
  const currentAdapter = options.gatewayAdapter || gatewayAdapter;
  const settings = await getSettings();
  const nowMs = clock.nowMs();
  const nowIso = clock.nowIso();

  // 1. Quá send_due_at mà chưa gửi -> sla_breached = true
  await knex('refunds')
    .where('status', 'CHECKING')
    .where('sla_breached', false)
    .where('send_due_at', '<=', nowIso)
    .update({ sla_breached: true });

  // 2. refund CHECKING đã quá settings.refundSendDelayMin -> gọi vnpay.refund
  const delayMin = settings.refundSendDelayMin !== undefined ? settings.refundSendDelayMin : 30;
  const cutoffMs = nowMs - delayMin * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  let readyRefundsQuery = knex('refunds').where('status', 'CHECKING');

  if (options.targetRefundId) {
    readyRefundsQuery = readyRefundsQuery.where('refund_id', options.targetRefundId);
  } else {
    readyRefundsQuery = readyRefundsQuery.where('detected_at', '<=', cutoffIso);
  }

  const readyRefunds = await readyRefundsQuery;
  const processed = [];

  for (const rf of readyRefunds) {
    try {
      const order = await knex('orders').where({ order_id: rf.order_id }).first();
      const attempt = await knex('payment_attempts').where({ gateway_txn_id: rf.gateway_txn_id }).first();

      const reqId = rf.gateway_request_id || `RF_${Date.now()}_${ids.randomCode(4)}`;
      const transDate =
        (attempt && (attempt.gateway_pay_date || attempt.created_at)) || rf.detected_at;
      const transNo = (attempt && attempt.gateway_trans_no) || '0';

      const gwResult = await currentAdapter.refund({
        requestId: reqId,
        txnRef: rf.gateway_txn_id,
        amountVnd: rf.amount,
        transDate,
        transactionNo: transNo,
        createBy: 'SYSTEM',
        orderInfo: `Hoan tien don hang ${rf.order_id}`,
        ipAddr: '127.0.0.1',
      });

      const isOk = String(gwResult.vnp_ResponseCode) === '00';

      if (!isOk) {
        // Bị từ chối -> REJECTED + reject_reason
        await knex('refunds')
          .where({ refund_id: rf.refund_id })
          .update({
            status: 'REJECTED',
            reject_reason: gwResult.vnp_Message || `Cổng từ chối: mã ${gwResult.vnp_ResponseCode}`,
            gateway_request_id: reqId,
            sent_at: clock.nowIso(),
          });
        processed.push({ refundId: rf.refund_id, status: 'REJECTED' });
      } else {
        // OK -> SENT -> BANK_PROCESSING (lưu sent_at, gateway_request_id)
        const sentAt = clock.nowIso();
        const gatewayRefundRef =
          gwResult.vnp_ResponseId ||
          gwResult.vnp_TransactionNo ||
          String(gwResult.vnp_ResponseCode);

        const isComplete = Boolean(options.completeImmediately || gwResult.completed);

        if (!isComplete) {
          await knex.transaction(async (trx) => {
            await trx('refunds')
              .where({ refund_id: rf.refund_id })
              .update({
                status: 'BANK_PROCESSING',
                sent_at: sentAt,
                gateway_request_id: reqId,
                gateway_refund_ref: gatewayRefundRef,
              });

            if (order) {
              const { notify } = require('./notificationService');
              await notify(trx, order, 'REFUND_SENT', { refund: rf });
            }
          });
          processed.push({ refundId: rf.refund_id, status: 'BANK_PROCESSING' });
        } else {
          // Hoàn tất -> COMPLETED + đơn REFUNDED
          await knex.transaction(async (trx) => {
            await trx('refunds')
              .where({ refund_id: rf.refund_id })
              .update({
                status: 'COMPLETED',
                sent_at: sentAt,
                completed_at: sentAt,
                gateway_request_id: reqId,
                gateway_refund_ref: gatewayRefundRef,
              });

            if (order && order.status === 'REFUND_PENDING') {
              await setStatus(trx, order, 'REFUNDED', {
                reason: 'Cổng thanh toán đã hoàn tất hoàn tiền',
                actorType: 'SYSTEM',
              });
            }

            if (order) {
              const { notify } = require('./notificationService');
              await notify(trx, order, 'REFUND_COMPLETED', { refund: rf });
            }
          });
          processed.push({ refundId: rf.refund_id, status: 'COMPLETED' });
        }
      }
    } catch (err) {
      logger.error('processRefundQueue_item_failed', {
        refundId: rf.refund_id,
        cause: err.message,
      });
    }
  }

  // 3. Xử lý các refund đang ở BANK_PROCESSING hoàn tất
  let bankProcessingQuery = knex('refunds').where('status', 'BANK_PROCESSING');
  if (options.targetRefundId) {
    bankProcessingQuery = bankProcessingQuery.where('refund_id', options.targetRefundId);
  }
  const bankRefunds = await bankProcessingQuery;

  for (const rf of bankRefunds) {
    const shouldComplete =
      options.advanceBankProcessing ||
      (rf.bank_eta_at && new Date(rf.bank_eta_at).getTime() <= nowMs);

    if (shouldComplete) {
      try {
        await knex.transaction(async (trx) => {
          const currentRf = await trx('refunds').where({ refund_id: rf.refund_id }).first();
          if (!currentRf || currentRf.status !== 'BANK_PROCESSING') return;

          const order = await trx('orders').where({ order_id: rf.order_id }).first();

          await trx('refunds')
            .where({ refund_id: rf.refund_id })
            .update({
              status: 'COMPLETED',
              completed_at: clock.nowIso(),
            });

          if (order && order.status === 'REFUND_PENDING') {
            await setStatus(trx, order, 'REFUNDED', {
              reason: 'Ngân hàng đã hoàn tất chuyển tiền hoàn lại',
              actorType: 'SYSTEM',
            });
          }

          if (order) {
            const { notify } = require('./notificationService');
            await notify(trx, order, 'REFUND_COMPLETED', { refund: rf });
          }
        });
        processed.push({ refundId: rf.refund_id, status: 'COMPLETED' });
      } catch (err) {
        logger.error('processRefundQueue_bank_complete_failed', {
          refundId: rf.refund_id,
          cause: err.message,
        });
      }
    }
  }

  return processed;
}

module.exports = {
  getSettings,
  setGatewayAdapter,
  evaluateAndCreate,
  processRefundQueue,
};
