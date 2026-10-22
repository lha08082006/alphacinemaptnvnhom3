'use strict';

const crypto = require('crypto');
const knex = require('../db/knex');
const ids = require('../lib/ids');
const clock = require('../lib/clock');
const { AppError } = require('../lib/errors');
const { MAX_SEATS_PER_ORDER, DEFAULT_SETTINGS, REFUND_ESTIMATED_TIMES } = require('../config/constants');

/**
 * Xuất vé xem phim cho đơn hàng đã thanh toán thành công (PAID).
 * - Chuyển toàn bộ showtime_seats của đơn sang SOLD (xóa held_until).
 * - INSERT vào bảng tickets (ticket_id chuẩn CS..., qr_payload ngẫu nhiên, status VALID).
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {object} order - Bản ghi đơn hàng từ bảng orders
 * @returns {Promise<object>} Bản ghi vé vừa được tạo hoặc đã có
 */
async function issueTicket(trx, order) {
  const nowIso = clock.nowIso();

  // 1. Chuyển showtime_seats của đơn sang SOLD, xóa held_until
  const orderSeats = await trx('order_seats').where({ order_id: order.order_id });
  for (const os of orderSeats) {
    await trx('showtime_seats')
      .insert({
        showtime_id: order.showtime_id,
        seat_id: os.seat_id,
        state: 'SOLD',
        order_id: order.order_id,
        held_until: null,
      })
      .onConflict(['showtime_id', 'seat_id'])
      .merge({
        state: 'SOLD',
        held_until: null,
        order_id: order.order_id,
      });
  }

  // 2. Tạo vé trong bảng tickets nếu chưa có
  let ticket = await trx('tickets').where({ order_id: order.order_id }).first();
  if (!ticket) {
    const newTicket = {
      ticket_id: ids.newTicketId(),
      order_id: order.order_id,
      qr_payload: crypto.randomBytes(16).toString('hex'),
      status: 'VALID',
      issued_at: nowIso,
    };
    await trx('tickets').insert(newTicket);
    ticket = newTicket;
  }

  return ticket;
}

/**
 * Nhả ghế khi đơn hàng FAILED hoặc EXPIRED.
 * Xóa các bản ghi showtime_seats ở trạng thái HELD của đơn hàng.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {string} orderId - Mã đơn hàng
 * @returns {Promise<number>} Số lượng ghế được nhả
 */
async function releaseSeats(trx, orderId) {
  return await trx('showtime_seats')
    .where({ order_id: orderId, state: 'HELD' })
    .del();
}

/**
 * Lấy chi tiết trạng thái đơn hàng (dành cho chủ đơn xem).
 * Trả về status, amount, ticket (nếu có), refund (nếu có) và timeline từ order_status_history (mới nhất trước).
 *
 * @param {string} orderId
 * @param {number} userId
 * @returns {Promise<object|null>}
 */
async function getOrderStatus(orderId, userId) {
  const order = await knex('orders').where({ order_id: orderId }).first();
  if (!order || order.user_id !== userId) {
    return null;
  }

  const [ticket, refund, timeline, attempt] = await Promise.all([
    knex('tickets').where({ order_id: orderId }).first(),
    knex('refunds').where({ order_id: orderId }).orderBy('detected_at', 'desc').first(),
    knex('order_status_history')
      .where({ order_id: orderId })
      .orderBy('at', 'desc')
      .orderBy('id', 'desc'),
    knex('payment_attempts').where({ order_id: orderId }).orderBy('created_at', 'desc').first(),
  ]);

  const clock = require('../lib/clock');
  const paymentTime = attempt?.created_at || order.paid_at || order.created_at;
  const elapsedMs = paymentTime ? clock.nowMs() - new Date(paymentTime).getTime() : 0;
  const remainingClaimMinutes = Math.max(0, Math.floor((60 * 60 * 1000 - elapsedMs) / (60 * 1000)));

  return {
    orderId: order.order_id,
    status: order.status,
    amount: order.amount_total,
    amountTotal: order.amount_total,
    amountTickets: order.amount_tickets,
    amountCombos: order.amount_combos,
    paymentMethod: order.payment_method,
    holdExpiresAt: order.hold_expires_at,
    termsAcceptedAt: order.terms_accepted_at || null,
    termsVersion: order.terms_version || null,
    paidAt: order.paid_at,
    paymentTime,
    remainingClaimMinutes,
    isClaimExpired: remainingClaimMinutes <= 0,
    ticket: ticket || null,
    refund: refund || null,
    estimatedRefundTime: refund
      ? (REFUND_ESTIMATED_TIMES[order.payment_method] || REFUND_ESTIMATED_TIMES.DEFAULT)
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
}

/**
 * Tạo đơn giữ chỗ (HOLDING) và khóa ghế (HELD).
 * Thực hiện trong 1 transaction, kiểm tra xung đột ghế và ném 409 SEAT_TAKEN nếu có ghế bị giữ.
 *
 * @param {object} params
 * @param {number} params.userId
 * @param {number} params.showtimeId
 * @param {number[]} params.seatIds
 * @param {Array<{ comboId: number, qty: number }>} [params.combos]
 * @param {string} [params.customerName]
 * @param {string} [params.customerPhone]
 * @param {string} [params.customerEmail]
 * @returns {Promise<object>}
 */
async function createOrderHold({
  userId,
  showtimeId,
  seatIds,
  combos = [],
  customerName,
  customerPhone,
  customerEmail,
}) {
  return await knex.transaction(async (trx) => {
    // 1. Kiểm tra suất chiếu có tồn tại và đang mở không
    const showtime = await trx('showtimes')
      .where({ id: showtimeId, status: 'OPEN' })
      .first();

    if (!showtime) {
      throw new AppError('NOT_FOUND');
    }

    // 2. Kiểm tra số lượng ghế (BR-01: tối đa 8 ghế)
    if (!seatIds || seatIds.length === 0) {
      throw new AppError('VALIDATION_ERROR', 400, 'Vui lòng chọn ít nhất 1 ghế.');
    }
    if (seatIds.length > MAX_SEATS_PER_ORDER) {
      throw new AppError('MAX_SEATS_EXCEEDED');
    }

    // 3. Lấy thông tin các ghế từ bảng seats theo room_id
    const seats = await trx('seats')
      .where({ room_id: showtime.room_id })
      .whereIn('id', seatIds);

    if (seats.length !== seatIds.length) {
      throw new AppError('NOT_FOUND', 404, 'Một số ghế không tồn tại trong phòng chiếu.');
    }

    // 4. Đọc cấu hình thời gian giữ ghế (phút)
    const settingRow = await trx('settings').where({ key: 'holdMinutes' }).first();
    const holdMinutes = settingRow ? parseInt(settingRow.value, 10) : (DEFAULT_SETTINGS.holdMinutes || 5);

    const nowMs = clock.nowMs();
    const nowIso = clock.nowIso();
    const holdExpiresAt = new Date(nowMs + holdMinutes * 60 * 1000).toISOString();

    // 5. Khóa các ghế trong showtime_seats để kiểm tra xung đột (SELECT ... FOR UPDATE)
    const existingBookings = await trx('showtime_seats')
      .where({ showtime_id: showtimeId })
      .whereIn('seat_id', seatIds)
      .forUpdate();

    const conflictedSeats = [];
    for (const eb of existingBookings) {
      const seatInfo = seats.find((s) => s.id === eb.seat_id);
      const seatLabel = seatInfo ? `${seatInfo.row_label}${seatInfo.col_number}` : String(eb.seat_id);

      if (eb.state === 'SOLD') {
        conflictedSeats.push(seatLabel);
      } else if (eb.state === 'HELD') {
        // Kiểm tra xem thời gian giữ của người khác còn hiệu lực không
        if (eb.held_until && new Date(eb.held_until).getTime() > nowMs) {
          conflictedSeats.push(seatLabel);
        }
      }
    }

    if (conflictedSeats.length > 0) {
      throw new AppError(
        'SEAT_TAKEN',
        409,
        'Ghế bạn chọn vừa có người khác giữ, vui lòng chọn ghế khác.',
        { conflictedSeats }
      );
    }

    // 6. Tính toán tiền vé
    let amountTickets = 0;
    const seatItems = seats.map((s) => {
      let price = showtime.price_standard;
      if (s.seat_type === 'VIP') price = showtime.price_vip;
      else if (s.seat_type === 'COUPLE') price = showtime.price_couple;

      amountTickets += price;
      return {
        seat_id: s.id,
        seat_type: s.seat_type,
        price,
        label: `${s.row_label}${s.col_number}`,
      };
    });

    // 7. Tính tiền combo (nếu có)
    let amountCombos = 0;
    const comboItems = [];
    if (Array.isArray(combos) && combos.length > 0) {
      for (const c of combos) {
        if (c.qty > 0) {
          const comboRow = await trx('combos').where({ id: c.comboId, is_active: true }).first();
          if (comboRow) {
            const cost = comboRow.price * c.qty;
            amountCombos += cost;
            comboItems.push({
              combo_id: comboRow.id,
              qty: c.qty,
              unit_price: comboRow.price,
            });
          }
        }
      }
    }

    const amountTotal = amountTickets + amountCombos;
    const orderId = ids.newOrderId();

    // 8. Tạo đơn hàng mới trạng thái HOLDING
    await trx('orders').insert({
      order_id: orderId,
      user_id: userId,
      showtime_id: showtimeId,
      status: 'HOLDING',
      amount_tickets: amountTickets,
      amount_combos: amountCombos,
      amount_total: amountTotal,
      customer_name: customerName || 'Khách Hàng',
      customer_phone: customerPhone || '0987654321',
      customer_email: customerEmail || 'khach@betacinemas.vn',
      hold_expires_at: holdExpiresAt,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // 9. Lưu order_seats
    for (const item of seatItems) {
      await trx('order_seats').insert({
        order_id: orderId,
        seat_id: item.seat_id,
        seat_type: item.seat_type,
        price: item.price,
      });
    }

    // 10. Lưu order_combos nếu có
    for (const item of comboItems) {
      await trx('order_combos').insert({
        order_id: orderId,
        combo_id: item.combo_id,
        qty: item.qty,
        unit_price: item.unit_price,
      });
    }

    // 11. Khóa ghế trong bảng showtime_seats
    for (const item of seatItems) {
      await trx('showtime_seats')
        .insert({
          showtime_id: showtimeId,
          seat_id: item.seat_id,
          state: 'HELD',
          order_id: orderId,
          held_until: holdExpiresAt,
        })
        .onConflict(['showtime_id', 'seat_id'])
        .merge({
          state: 'HELD',
          order_id: orderId,
          held_until: holdExpiresAt,
        });
    }

    // 12. Ghi nhận lịch sử chuyển trạng thái
    await trx('order_status_history').insert({
      order_id: orderId,
      from_status: null,
      to_status: 'HOLDING',
      reason: 'Khách hàng chọn ghế và giữ chỗ',
      actor_type: 'USER',
      actor_id: userId,
      at: nowIso,
    });

    return {
      orderId,
      showtimeId,
      status: 'HOLDING',
      amountTickets,
      amountCombos,
      amountTotal,
      holdExpiresAt,
      holdMinutes,
      seats: seatItems,
    };
  });
}

module.exports = {
  issueTicket,
  releaseSeats,
  getOrderStatus,
  createOrderHold,
};
