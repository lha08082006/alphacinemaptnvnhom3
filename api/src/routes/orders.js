'use strict';

const express = require('express');
const { z } = require('zod');
const knex = require('../db/knex');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { AppError } = require('../lib/errors');
const { asyncHandler, sendOk } = require('../lib/http');
const orderService = require('../services/orderService');

const router = express.Router();

const holdOrderSchema = z.object({
  showtimeId: z.coerce.number().int().positive('Mã suất chiếu không hợp lệ'),
  seatIds: z
    .array(z.coerce.number().int().positive())
    .min(1, 'Vui lòng chọn ít nhất 1 ghế')
    .max(8, 'Mỗi đơn chỉ được chọn tối đa 8 ghế'),
  combos: z
    .array(
      z.object({
        comboId: z.coerce.number().int().positive(),
        qty: z.coerce.number().int().min(1).max(10),
      })
    )
    .optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email('Email không đúng định dạng').optional(),
});

/**
 * POST /orders/hold
 * Tạo đơn giữ chỗ (HOLDING) và khóa ghế trong 1 transaction.
 * Ném 409 SEAT_TAKEN nếu có ghế bị người khác giữ.
 */
router.post(
  '/hold',
  requireAuth,
  validate({ body: holdOrderSchema }),
  asyncHandler(async (req, res) => {
    const { showtimeId, seatIds, combos, customerName, customerPhone, customerEmail } = req.valid.body;
    const userId = req.user.id;

    const result = await orderService.createOrderHold({
      userId,
      showtimeId,
      seatIds,
      combos,
      customerName: customerName || req.user.full_name,
      customerPhone: customerPhone || req.user.phone,
      customerEmail: customerEmail || req.user.email,
    });

    sendOk(res, result, {}, 201);
  })
);

/**
 * GET /orders
 * Lấy danh sách lịch sử đơn hàng của người dùng hiện tại (CUSTOMER).
 * Kèm theo thông tin vé, refund, và tính thời gian khiếu nại còn lại (mốc 60 phút).
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const orders = await knex('orders')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc');

    if (orders.length === 0) {
      return sendOk(res, []);
    }

    const orderIds = orders.map((o) => o.order_id);
    const showtimeIds = [...new Set(orders.map((o) => o.showtime_id).filter(Boolean))];

    const [tickets, refunds, attempts, showtimes, orderSeats, orderCombos] = await Promise.all([
      knex('tickets').whereIn('order_id', orderIds),
      knex('refunds').whereIn('order_id', orderIds).whereNot('status', 'REJECTED'),
      knex('payment_attempts').whereIn('order_id', orderIds).orderBy('created_at', 'desc'),
      showtimeIds.length > 0
        ? knex('showtimes as st')
            .join('movies as m', 'st.movie_id', 'm.id')
            .join('rooms as r', 'st.room_id', 'r.id')
            .join('cinemas as c', 'r.cinema_id', 'c.id')
            .whereIn('st.id', showtimeIds)
            .select(
              'st.id as showtime_id',
              'st.starts_at',
              'st.ends_at',
              'm.title as movie_title',
              'r.name as room_name',
              'c.name as cinema_name'
            )
        : [],
      knex('order_seats as os')
        .join('seats as s', 'os.seat_id', 's.id')
        .whereIn('os.order_id', orderIds)
        .select('os.order_id', 's.row_label', 's.col_number', 'os.seat_type', 'os.price'),
      knex('order_combos as oc')
        .join('combos as cb', 'oc.combo_id', 'cb.id')
        .whereIn('oc.order_id', orderIds)
        .select('oc.order_id', 'cb.name as combo_name', 'oc.qty', 'oc.unit_price'),
    ]);

    const clock = require('../lib/clock');
    const nowMs = clock.nowMs();

    const result = orders.map((o) => {
      const ticket = tickets.find((t) => t.order_id === o.order_id);
      const refund = refunds.find((r) => r.order_id === o.order_id);
      const attempt = attempts.find((a) => a.order_id === o.order_id);
      const st = showtimes.find((s) => s.showtime_id === o.showtime_id);
      const seats = orderSeats.filter((s) => s.order_id === o.order_id);
      const combos = orderCombos.filter((c) => c.order_id === o.order_id);

      const paymentTime = attempt?.created_at || o.created_at;
      const elapsedMs = paymentTime ? nowMs - new Date(paymentTime).getTime() : 0;
      const remainingClaimMinutes = Math.max(0, Math.floor((60 * 60 * 1000 - elapsedMs) / (60 * 1000)));

      return {
        orderId: o.order_id,
        status: o.status,
        amountTotal: o.amount_total,
        showtimeId: o.showtime_id,
        createdAt: o.created_at,
        paymentTime,
        remainingClaimMinutes,
        isClaimExpired: remainingClaimMinutes <= 0,
        hasTicket: Boolean(ticket),
        hasRefund: Boolean(refund),
        ticketId: ticket?.ticket_id || null,
        refundStatus: refund?.status || null,
        movieTitle: st?.movie_title || 'Vé xem phim Beta',
        moviePoster: st?.movie_poster_url || '',
        cinemaName: st?.cinema_name || 'Beta Cinemas',
        roomName: st?.room_name || 'Phòng chiếu',
        startsAt: st?.starts_at || o.created_at,
        seats: seats.map((s) => `${s.row_label}${s.col_number}`),
        seatDetails: seats,
        combos: combos.map((c) => `${c.qty}x ${c.combo_name}`),
      };
    });

    sendOk(res, result);
  })
);

/**
 * GET /orders/:id/status
 * Lấy thông tin trạng thái đơn hàng (chỉ chủ sở hữu đơn mới được xem).
 * Trả về: status, amount, ticket (nếu có), refund (nếu có) và timeline từ order_status_history (mới nhất trước).
 */
router.get(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const userId = req.user.id;

    const result = await orderService.getOrderStatus(orderId, userId);
    if (!result) {
      throw new AppError('NOT_FOUND');
    }

    sendOk(res, result);
  })
);

module.exports = router;
