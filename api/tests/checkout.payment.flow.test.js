'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');

describe('Checkout & Payment Flow (Timer consistency, methods enum, terms acceptance)', () => {
  let app;
  let customerCookie;
  let testShowtimeId;
  let testSeatId;
  const createdOrderIds = [];

  async function cleanupOrders() {
    if (createdOrderIds.length > 0) {
      await knex('payment_attempts').whereIn('order_id', createdOrderIds).del();
      await knex('order_seats').whereIn('order_id', createdOrderIds).del();
      await knex('order_status_history').whereIn('order_id', createdOrderIds).del();
      await knex('showtime_seats').whereIn('order_id', createdOrderIds).del();
      await knex('orders').whereIn('order_id', createdOrderIds).del();
      createdOrderIds.length = 0;
    }
  }

  beforeAll(async () => {
    app = createApp();

    // 1. Đăng nhập Customer
    const resLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang@gmail.com', password: 'Password@123' });
    customerCookie = resLogin.headers['set-cookie'];

    // 2. Lấy suất chiếu mở và ghế khả dụng
    const showtime = await knex('showtimes').where({ status: 'OPEN' }).first();
    testShowtimeId = showtime.id;

    let seat = await knex('seats')
      .where({ room_id: showtime.room_id })
      .whereNotIn(
        'id',
        knex('showtime_seats').where({ showtime_id: testShowtimeId }).select('seat_id')
      )
      .first();

    if (!seat) {
      await knex('showtime_seats').where({ showtime_id: testShowtimeId, state: 'HELD' }).del();
      seat = await knex('seats')
        .where({ room_id: showtime.room_id })
        .whereNotIn(
          'id',
          knex('showtime_seats').where({ showtime_id: testShowtimeId }).select('seat_id')
        )
        .first();
    }
    testSeatId = seat.id;
  });

  afterEach(async () => {
    await cleanupOrders();
  });

  afterAll(async () => {
    await cleanupOrders();
    await knex.destroy();
  });

  it('1. should hold seat and return holdExpiresAt based on server settings (5 minutes)', async () => {
    const resHold = await request(app)
      .post('/api/v1/orders/hold')
      .set('Cookie', customerCookie)
      .send({
        showtimeId: testShowtimeId,
        seatIds: [testSeatId],
      });

    expect(resHold.status).toBe(201);
    expect(resHold.body.ok).toBe(true);

    const order = resHold.body.data;
    createdOrderIds.push(order.orderId);

    expect(order.orderId).toBeDefined();
    expect(order.status).toBe('HOLDING');
    expect(order.holdExpiresAt).toBeDefined();

    // Thời gian hết hạn phải là khoảng 5 phút trong tương lai
    const now = Date.now();
    const expireTime = new Date(order.holdExpiresAt).getTime();
    const diffMs = expireTime - now;
    expect(diffMs).toBeGreaterThan(4 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(5 * 60 * 1000 + 5000);
  });

  it('2. reload verification: re-querying order status returns exact same hold_expires_at without grant reset', async () => {
    // Tạo đơn giữ chỗ
    const resHold = await request(app)
      .post('/api/v1/orders/hold')
      .set('Cookie', customerCookie)
      .send({
        showtimeId: testShowtimeId,
        seatIds: [testSeatId],
      });

    const orderId = resHold.body.data.orderId;
    const initialHoldExpiresAt = resHold.body.data.holdExpiresAt;
    createdOrderIds.push(orderId);

    // Chờ 50ms để mô phỏng tải lại trang
    await new Promise((r) => setTimeout(r, 50));

    // Lần tải lại thứ nhất
    const reload1 = await request(app)
      .get(`/api/v1/orders/${orderId}/status`)
      .set('Cookie', customerCookie);

    expect(reload1.status).toBe(200);
    expect(reload1.body.data.holdExpiresAt).toBe(initialHoldExpiresAt);
    expect(reload1.body.data.status).toBe('HOLDING');

    // Chờ tiếp 50ms
    await new Promise((r) => setTimeout(r, 50));

    // Lần tải lại thứ hai (ở trang checkout)
    const reload2 = await request(app)
      .get(`/api/v1/orders/${orderId}/status`)
      .set('Cookie', customerCookie);

    expect(reload2.status).toBe(200);
    expect(reload2.body.data.holdExpiresAt).toBe(initialHoldExpiresAt);
  });

  it('3. should reject payment when termsAccepted is false (mandatory terms agreement)', async () => {
    const resHold = await request(app)
      .post('/api/v1/orders/hold')
      .set('Cookie', customerCookie)
      .send({
        showtimeId: testShowtimeId,
        seatIds: [testSeatId],
      });

    const orderId = resHold.body.data.orderId;
    createdOrderIds.push(orderId);

    const resPay = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', customerCookie)
      .set('Idempotency-Key', 'idemp_terms_refuse_01')
      .send({
        orderId,
        method: 'QR',
        termsAccepted: false,
      });

    expect(resPay.status).toBe(400);
    expect(resPay.body.ok).toBe(false);
    expect(resPay.body.error.code).toBe('VALIDATION_ERROR');
    expect(resPay.body.error.details[0].message).toContain('Bắt buộc đồng ý');
  });

  it('4. should save terms_accepted_at and terms_version to order upon creating payment', async () => {
    const resHold = await request(app)
      .post('/api/v1/orders/hold')
      .set('Cookie', customerCookie)
      .send({
        showtimeId: testShowtimeId,
        seatIds: [testSeatId],
      });

    const orderId = resHold.body.data.orderId;
    const holdExpiresAt = resHold.body.data.holdExpiresAt;
    createdOrderIds.push(orderId);

    const resPay = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', customerCookie)
      .set('Idempotency-Key', 'idemp_terms_accept_01')
      .send({
        orderId,
        method: 'QR',
        termsAccepted: true,
        termsVersion: 'v1.0',
      });

    expect(resPay.status).toBe(200);
    expect(resPay.body.ok).toBe(true);
    expect(resPay.body.data.paymentUrl).toContain('vnp_BankCode=VNPAYQR');

    // Kiểm tra CSDL
    const orderInDb = await knex('orders').where({ order_id: orderId }).first();
    expect(orderInDb.status).toBe('AWAITING_PAYMENT');
    expect(orderInDb.payment_method).toBe('QR');
    expect(orderInDb.terms_accepted_at).toBeDefined();
    expect(orderInDb.terms_version).toBe('v1.0');
    expect(orderInDb.hold_expires_at).toBe(holdExpiresAt);

    // Tải lại trạng thái đơn hàng (GET /orders/:id/status)
    const resStatus = await request(app)
      .get(`/api/v1/orders/${orderId}/status`)
      .set('Cookie', customerCookie);

    expect(resStatus.status).toBe(200);
    expect(resStatus.body.data.termsAcceptedAt).toBe(orderInDb.terms_accepted_at);
    expect(resStatus.body.data.termsVersion).toBe('v1.0');
    expect(resStatus.body.data.holdExpiresAt).toBe(holdExpiresAt);
  });

  it('5. payment methods enum: only QR, ATM, INTL_CARD (and WALLET alias) are accepted; MoMo/ShopeePay/ZaloPay are rejected', async () => {
    const resHold = await request(app)
      .post('/api/v1/orders/hold')
      .set('Cookie', customerCookie)
      .send({
        showtimeId: testShowtimeId,
        seatIds: [testSeatId],
      });

    const orderId = resHold.body.data.orderId;
    createdOrderIds.push(orderId);

    // Thử gửi MoMo -> 400
    const resMomo = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', customerCookie)
      .set('Idempotency-Key', 'idemp_momo_01')
      .send({ orderId, method: 'MOMO' });
    expect(resMomo.status).toBe(400);

    // Thử gửi SHOPEEPAY -> 400
    const resShopee = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', customerCookie)
      .set('Idempotency-Key', 'idemp_shopee_01')
      .send({ orderId, method: 'SHOPEEPAY' });
    expect(resShopee.status).toBe(400);

    // Thử gửi ZALOPAY -> 400
    const resZalo = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', customerCookie)
      .set('Idempotency-Key', 'idemp_zalo_01')
      .send({ orderId, method: 'ZALOPAY' });
    expect(resZalo.status).toBe(400);

    // Gửi phương thức hợp lệ: ATM -> 200
    const resAtm = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', customerCookie)
      .set('Idempotency-Key', 'idemp_valid_atm_01')
      .send({ orderId, method: 'ATM' });
    expect(resAtm.status).toBe(200);
    expect(resAtm.body.data.paymentUrl).toContain('vnp_BankCode=VNBANK');
  });
});
