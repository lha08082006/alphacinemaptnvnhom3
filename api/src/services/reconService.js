'use strict';

const knex = require('../db/knex');
const clock = require('../lib/clock');
const logger = require('../lib/logger');
const vnpay = require('../lib/vnpay');
const { DEFAULT_SETTINGS } = require('../config/constants');
const { applyGatewayResult } = require('./paymentService');

let gatewayAdapter = vnpay;

/**
 * Cho phép thiết lập adapter giao tiếp với cổng thanh toán (dùng cho testing/mocking).
 * @param {object} adapter
 */
function setGatewayAdapter(adapter) {
  gatewayAdapter = adapter;
}

/**
 * Lấy cấu hình hệ thống hiện tại từ bảng settings.
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
 * Chạy đối soát giữa hệ thống Beta Cinemas và Cổng thanh toán (VNPay).
 *
 * @param {'SCHEDULED'|'MANUAL'} [trigger='MANUAL'] Nguồn kích hoạt đối soát
 * @param {object} [options={}]
 * @param {object} [options.gatewayAdapter] Adapter tùy chọn (mock trong test)
 * @param {string} [options.targetOrderId] Đơn hàng cụ thể cần đối soát (cô lập test)
 * @returns {Promise<object|null>} Thông tin tóm tắt lần chạy đối soát
 */
async function runRecon(trigger = 'MANUAL', options = {}) {
  const currentAdapter = options.gatewayAdapter || gatewayAdapter;
  const settings = await getSettings();

  // Quy tắc: Chỉ chạy tự động khi settings.mode = 'TOBE'
  if (trigger === 'SCHEDULED' && settings.mode !== 'TOBE') {
    logger.info('recon_scheduled_skipped_asis_mode', { mode: settings.mode });
    return null;
  }

  const startedAt = clock.nowIso();

  // 1. Tạo bản ghi recon_runs ở trạng thái RUNNING
  const [runId] = await knex('recon_runs').insert({
    trigger,
    started_at: startedAt,
    scanned: 0,
    matched: 0,
    mismatched: 0,
    auto_refunds: 0,
    flagged: 0,
    status: 'RUNNING',
  });

  let scanned = 0;
  let matched = 0;
  let mismatched = 0;
  let autoRefunds = 0;
  let flagged = 0;

  try {
    const timeoutMs = (settings.callbackTimeoutSec || 15) * 1000;
    const cutoffIso = new Date(clock.nowMs() - timeoutMs).toISOString();

    // 2. Chọn các đơn có payment_attempts mà orders.status thuộc PENDING_VERIFY, FAILED, EXPIRED,
    //    hoặc AWAITING_PAYMENT đã quá callbackTimeoutSec.
    let query = knex('payment_attempts as pa')
      .join('orders as o', 'pa.order_id', 'o.order_id')
      .where((builder) => {
        builder
          .whereIn('o.status', ['PENDING_VERIFY', 'FAILED', 'EXPIRED'])
          .orWhere((b2) => {
            b2.where('o.status', 'AWAITING_PAYMENT').andWhere('o.updated_at', '<=', cutoffIso);
          });
      })
      .select(
        'pa.attempt_id',
        'pa.order_id',
        'pa.gateway_txn_id',
        'pa.method',
        'pa.amount as attempt_amount',
        'pa.status as attempt_status',
        'pa.gateway_trans_no',
        'pa.gateway_pay_date',
        'pa.created_at as attempt_created_at',
        'o.status as order_status',
        'o.amount_total as order_amount',
        'o.created_at as order_created_at',
        'o.updated_at as order_updated_at'
      );

    if (options.targetOrderId) {
      query = query.andWhere('o.order_id', options.targetOrderId);
    }

    const attempts = await query;

    // 3. Quét từng attempt
    for (const attempt of attempts) {
      scanned += 1;

      try {
        // Lấy lại trạng thái đơn mới nhất từ DB (phòng trường hợp các attempt trước làm thay đổi đơn)
        const currentOrder = await knex('orders')
          .where({ order_id: attempt.order_id })
          .first();

        const betaStatus = currentOrder ? currentOrder.status : attempt.order_status;
        const betaAmount = Number(attempt.attempt_amount || (currentOrder ? currentOrder.amount_total : 0));

        // Kiểm tra xem giao dịch này đã được hoàn tiền hoặc đã xử lý trước đó chưa
        const existingRefund = await knex('refunds')
          .where({ gateway_txn_id: attempt.gateway_txn_id })
          .whereNot('status', 'REJECTED')
          .first();

        if (existingRefund) {
          // ALREADY_HANDLED: Đã có lệnh refund được lập trước đó
          await knex('recon_items').insert({
            run_id: runId,
            order_id: attempt.order_id,
            gateway_txn_id: attempt.gateway_txn_id,
            beta_status: betaStatus,
            gateway_status: 'REFUNDED',
            gateway_debited: true,
            amount_beta: betaAmount,
            amount_gateway: betaAmount,
            classification: 'ALREADY_HANDLED',
            action: 'NONE',
          });
          matched += 1;
          continue;
        }

        // Gọi queryTransaction của gateway adapter
        const transDate = attempt.gateway_pay_date || attempt.attempt_created_at;
        const gwResult = await currentAdapter.queryTransaction({
          txnRef: attempt.gateway_txn_id,
          transDate,
          transactionNo: attempt.gateway_trans_no || '0',
          ipAddr: '127.0.0.1',
          orderInfo: `Tra cuu doi soat ${attempt.gateway_txn_id}`,
        });

        const isSuccess =
          String(gwResult.vnp_ResponseCode) === '00' &&
          String(gwResult.vnp_TransactionStatus) === '00';

        const gatewayDebited = Boolean(isSuccess);
        const amountGateway = gwResult.vnp_Amount
          ? Math.round(Number(gwResult.vnp_Amount) / 100)
          : (isSuccess ? betaAmount : 0);

        const gatewayStatus = String(gwResult.vnp_TransactionStatus || gwResult.vnp_ResponseCode || 'UNKNOWN');

        let classification = 'MATCHED';
        let action = 'NONE';

        // Phân loại kết quả đối soát:
        if (gatewayDebited) {
          // Cổng báo thành công (đã trừ tiền)
          if (amountGateway !== betaAmount) {
            // Lệch số tiền
            classification = 'AMOUNT_MISMATCH';
            action = 'FLAGGED';
            mismatched += 1;
            flagged += 1;
          } else if (betaStatus === 'PENDING_VERIFY' || betaStatus === 'AWAITING_PAYMENT') {
            // VNPay thành công, Beta chưa PAID -> LATE_CALLBACK: gọi applyGatewayResult để cấp vé
            classification = 'LATE_CALLBACK';
            action = 'NONE';
            mismatched += 1;

            try {
              await applyGatewayResult({
                txnRef: attempt.gateway_txn_id,
                transNo: gwResult.vnp_TransactionNo || attempt.gateway_trans_no,
                amountVnd: betaAmount,
                responseCode: gwResult.vnp_ResponseCode || '00',
                transactionStatus: gwResult.vnp_TransactionStatus || '00',
                payDate: gwResult.vnp_PayDate,
                bankCode: gwResult.vnp_BankCode,
                raw: gwResult,
              });
            } catch (applyErr) {
              logger.error('recon_apply_late_callback_failed', {
                orderId: attempt.order_id,
                txnRef: attempt.gateway_txn_id,
                cause: applyErr.message,
              });
            }
          } else if (betaStatus === 'FAILED' || betaStatus === 'EXPIRED') {
            // Đã trừ tiền, đơn FAILED/EXPIRED, không có vé -> NO_TICKET_DEBITED
            const validTicket = await knex('tickets')
              .where({ order_id: attempt.order_id, status: 'VALID' })
              .first();

            if (!validTicket) {
              classification = 'NO_TICKET_DEBITED';
              mismatched += 1;

              // Gọi refundService để đánh giá 5 Golden Rules (BR-07) và tạo lệnh hoàn tiền nếu đủ
              const { evaluateAndCreate } = require('./refundService');
              let rfResult = null;
              try {
                rfResult = await knex.transaction(async (trx) => {
                  return await evaluateAndCreate(
                    trx,
                    currentOrder || {
                      order_id: attempt.order_id,
                      status: betaStatus,
                      amount_total: betaAmount,
                    },
                    {
                      ...attempt,
                      amount: betaAmount,
                      status: 'SUCCESS',
                      amount_gateway: amountGateway,
                      gateway_debited: true,
                    }
                  );
                });
              } catch (rfErr) {
                logger.error('recon_refund_eval_failed', {
                  orderId: attempt.order_id,
                  cause: rfErr.message,
                });
              }

              if (rfResult && rfResult.ok) {
                action = 'AUTO_REFUND';
                autoRefunds += 1;
              } else {
                action = 'FLAGGED';
                flagged += 1;
              }
            } else {
              // Có vé hợp lệ -> Đã khớp
              classification = 'MATCHED';
              action = 'NONE';
              matched += 1;
            }
          } else if (betaStatus === 'PAID') {
            // Cả hai bên đều thành công
            classification = 'MATCHED';
            action = 'NONE';
            matched += 1;
          } else {
            classification = 'MATCHED';
            action = 'NONE';
            matched += 1;
          }
        } else {
          // Cổng báo không thành công / chưa thanh toán / lỗi
          if (betaStatus === 'AWAITING_PAYMENT' || betaStatus === 'PENDING_VERIFY') {
            classification = 'GATEWAY_FAILED';
            action = 'NONE';
            mismatched += 1;
          } else if (betaStatus === 'FAILED' || betaStatus === 'EXPIRED') {
            // Cả hai bên đều nhận diện là thất bại / không thu tiền -> MATCHED
            classification = 'MATCHED';
            action = 'NONE';
            matched += 1;
          } else {
            classification = 'GATEWAY_FAILED';
            action = 'NONE';
            mismatched += 1;
          }
        }

        // Ghi nhận bản ghi recon_items
        await knex('recon_items').insert({
          run_id: runId,
          order_id: attempt.order_id,
          gateway_txn_id: attempt.gateway_txn_id,
          beta_status: betaStatus,
          gateway_status: gatewayStatus,
          gateway_debited: gatewayDebited,
          amount_beta: betaAmount,
          amount_gateway: amountGateway,
          classification,
          action,
        });
      } catch (itemErr) {
        // Lỗi mạng hoặc lỗi xử lý ở 1 attempt không được làm hỏng cả lượt chạy
        logger.error('recon_item_processing_failed', {
          attemptId: attempt.attempt_id,
          orderId: attempt.order_id,
          cause: itemErr.message,
        });
        // Không rethrow, tiếp tục attempt tiếp theo
      }
    }

    // 4. Cập nhật recon_runs thành DONE
    const finishedAt = clock.nowIso();
    await knex('recon_runs').where({ run_id: runId }).update({
      scanned,
      matched,
      mismatched,
      auto_refunds: autoRefunds,
      flagged,
      status: 'DONE',
      finished_at: finishedAt,
    });

    return {
      runId,
      trigger,
      scanned,
      matched,
      mismatched,
      autoRefunds,
      flagged,
      status: 'DONE',
    };
  } catch (runErr) {
    logger.error('recon_run_failed', { runId, cause: runErr.message });

    await knex('recon_runs').where({ run_id: runId }).update({
      scanned,
      matched,
      mismatched,
      auto_refunds: autoRefunds,
      flagged,
      status: 'FAILED',
      finished_at: clock.nowIso(),
    });

    throw runErr;
  }
}

module.exports = {
  getSettings,
  setGatewayAdapter,
  runRecon,
};
