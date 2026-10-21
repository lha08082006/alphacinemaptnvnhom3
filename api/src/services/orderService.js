'use strict';

const crypto = require('crypto');
const knex = require('../db/knex');
const ids = require('../lib/ids');

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
  const nowIso = new Date().toISOString();

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

  const [ticket, refund, timeline] = await Promise.all([
    knex('tickets').where({ order_id: orderId }).first(),
    knex('refunds').where({ order_id: orderId }).orderBy('detected_at', 'desc').first(),
    knex('order_status_history')
      .where({ order_id: orderId })
      .orderBy('at', 'desc')
      .orderBy('id', 'desc'),
  ]);

  return {
    orderId: order.order_id,
    status: order.status,
    amount: order.amount_total,
    amountTotal: order.amount_total,
    amountTickets: order.amount_tickets,
    amountCombos: order.amount_combos,
    paymentMethod: order.payment_method,
    holdExpiresAt: order.hold_expires_at,
    paidAt: order.paid_at,
    ticket: ticket || null,
    refund: refund || null,
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

module.exports = {
  issueTicket,
  releaseSeats,
  getOrderStatus,
};
