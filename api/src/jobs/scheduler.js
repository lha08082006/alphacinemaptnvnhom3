'use strict';

const knex = require('../db/knex');
const clock = require('../lib/clock');
const logger = require('../lib/logger');
const { DEFAULT_SETTINGS } = require('../config/constants');
const { setStatus } = require('../services/paymentService');
const { releaseSeats } = require('../services/orderService');
const { runRecon } = require('../services/reconService');
const { processRefundQueue } = require('../services/refundService');

let intervalHandle = null;
let lastReconMs = 0;

/**
 * Đọc cấu hình từ bảng settings, nếu thiếu trường nào thì dùng DEFAULT_SETTINGS từ constants.js.
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
 * Quét các đơn HOLDING đã quá hạn hold_expires_at:
 * - Chuyển sang EXPIRED qua setStatus.
 * - Nhả ghế (xóa các ghế HELD của đơn khỏi showtime_seats).
 * Dùng clock.nowIso() / clock.nowMs() để xác định thời điểm hiện tại.
 *
 * @param {string} [targetOrderId=null] Nếu truyền vào, chỉ quét và xử lý đơn này (hỗ trợ test)
 * @returns {Promise<string[]>} Danh sách orderId đã hết hạn
 */
async function expireHolds(targetOrderId = null) {
  const currentNowIso = clock.nowIso();

  // Tìm các đơn hàng HOLDING đã quá hạn
  let query = knex('orders')
    .where('status', 'HOLDING')
    .andWhere('hold_expires_at', '<=', currentNowIso);

  if (targetOrderId) {
    query = query.andWhere('order_id', targetOrderId);
  }

  const expiredOrders = await query.select('order_id', 'status', 'hold_expires_at');

  const processedIds = [];

  for (const o of expiredOrders) {
    try {
      await knex.transaction(async (trx) => {
        // Khóa hoặc kiểm tra lại trạng thái đơn trong transaction
        const order = await trx('orders')
          .where({ order_id: o.order_id, status: 'HOLDING' })
          .first();

        if (!order) return;

        // Chuyển trạng thái sang EXPIRED
        await setStatus(trx, order, 'EXPIRED', {
          reason: 'Hết thời gian giữ chỗ (expireHolds)',
          actorType: 'SYSTEM',
        });

        // Nhả ghế
        await releaseSeats(trx, order.order_id);

        processedIds.push(order.order_id);
      });
    } catch (err) {
      logger.error('expireHolds_order_failed', { orderId: o.order_id, cause: err.message });
    }
  }

  return processedIds;
}

/**
 * Quét các đơn AWAITING_PAYMENT có updated_at cũ hơn settings.callbackTimeoutSec:
 * - Chế độ 'ASIS': chuyển sang FAILED (qua setStatus) + nhả ghế.
 * - Chế độ 'TOBE': chuyển sang PENDING_VERIFY, đặt lại hold_expires_at = now + pendingVerifyHoldMin phút, GIỮ ghế.
 *
 * @param {string} [targetOrderId=null] Nếu truyền vào, chỉ quét và xử lý đơn này (hỗ trợ test)
 * @returns {Promise<string[]>} Danh sách orderId đã timeout
 */
async function timeoutAwaiting(targetOrderId = null) {
  const settings = await getSettings();
  const timeoutMs = (settings.callbackTimeoutSec || 15) * 1000;
  const cutoffMs = clock.nowMs() - timeoutMs;
  const cutoffIso = new Date(cutoffMs).toISOString();

  // Tìm các đơn AWAITING_PAYMENT có updated_at <= cutoffIso
  let query = knex('orders')
    .where('status', 'AWAITING_PAYMENT')
    .andWhere('updated_at', '<=', cutoffIso);

  if (targetOrderId) {
    query = query.andWhere('order_id', targetOrderId);
  }

  const timedOutOrders = await query.select('order_id', 'status', 'updated_at', 'hold_expires_at');

  const processedIds = [];

  for (const o of timedOutOrders) {
    try {
      await knex.transaction(async (trx) => {
        const order = await trx('orders')
          .where({ order_id: o.order_id, status: 'AWAITING_PAYMENT' })
          .first();

        if (!order) return;

        if (settings.mode === 'ASIS') {
          // ASIS: Chuyển sang FAILED + nhả ghế
          await setStatus(trx, order, 'FAILED', {
            reason: `Hết thời gian chờ thanh toán (${settings.callbackTimeoutSec}s, ASIS)`,
            actorType: 'SYSTEM',
          });

          await releaseSeats(trx, order.order_id);
        } else {
          // TOBE: Chuyển sang PENDING_VERIFY, gia hạn hold_expires_at, GIỮ ghế
          const newHoldExpiresAt = new Date(
            clock.nowMs() + (settings.pendingVerifyHoldMin || 15) * 60 * 1000
          ).toISOString();

          await setStatus(trx, order, 'PENDING_VERIFY', {
            reason: `Hết thời gian chờ thanh toán (${settings.callbackTimeoutSec}s, chuyển PENDING_VERIFY)`,
            actorType: 'SYSTEM',
            extraUpdates: {
              hold_expires_at: newHoldExpiresAt,
            },
          });

          // Giữ ghế: cập nhật lại held_until theo hạn mới
          await trx('showtime_seats')
            .where({ order_id: order.order_id, state: 'HELD' })
            .update({ held_until: newHoldExpiresAt });
        }

        processedIds.push(order.order_id);
      });
    } catch (err) {
      logger.error('timeoutAwaiting_order_failed', { orderId: o.order_id, cause: err.message });
    }
  }

  return processedIds;
}

/**
 * Khởi động scheduler chạy ngầm định kỳ.
 * KHÔNG chạy khi NODE_ENV=test.
 *
 * @param {number} [intervalMs=5000]
 */
function start(intervalMs = 5000) {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  if (intervalHandle) {
    return;
  }

  intervalHandle = setInterval(async () => {
    try {
      await expireHolds();
      await timeoutAwaiting();
      await processRefundQueue();

      // BR-06: Chạy đối soát tự động theo reconcileIntervalMin khi mode = 'TOBE'
      const settings = await getSettings();
      if (settings.mode === 'TOBE') {
        const reconIntervalMs = (settings.reconcileIntervalMin || 15) * 60 * 1000;
        const nowMs = clock.nowMs();
        if (nowMs - lastReconMs >= reconIntervalMs) {
          lastReconMs = nowMs;
          await runRecon('SCHEDULED');
        }
      }
    } catch (err) {
      logger.error('scheduler_job_error', { cause: err && err.message });
    }
  }, intervalMs);

  intervalHandle.unref();
}

/**
 * Dừng scheduler.
 */
function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  getSettings,
  expireHolds,
  timeoutAwaiting,
  runRecon,
  processRefundQueue,
  start,
  stop,
};
