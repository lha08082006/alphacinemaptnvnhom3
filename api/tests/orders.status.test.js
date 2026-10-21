'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');
const { applyGatewayResult } = require('../src/services/paymentService');

describe('Step 6: Order Service & GET /orders/:id/status', () => {
  let app;
  let user1Cookie;
  let user2Cookie;

  const testOrderPaid = 'BCTEST6_PAID';
  const testOrderFailed = 'BCTEST6_FAIL';
  const testOrderOwnerOnly = 'BCTEST6_OWNER';

  const testTxnPaid = 'GW_TEST6_TXN_P';
  const testTxnFailed = 'GW_TEST6_TXN_F';

  let testSeat1;
  let testSeat2;

  beforeAll(async () => {
    app = createApp();

    // 1. Đăng nhập User 1 và User 2
    const login1 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang@gmail.com', password: 'Password@123' });
    user1Cookie = login1.headers['set-cookie'];

    const login2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang2@gmail.com', password: 'Password@123' });
    user2Cookie = login2.headers['set-cookie'];

    // 2. Dọn dẹp dữ liệu test cũ
    const orderIds = [testOrderPaid, testOrderFailed, testOrderOwnerOnly];
    const txnIds = [testTxnPaid, testTxnFailed];

    await knex('tickets').whereIn('order_id', orderIds).del();
    await knex('showtime_seats').whereIn('order_id', orderIds).del();
    await knex('order_seats').whereIn('order_id', orderIds).del();
    await knex('support_tickets').whereIn('order_id', orderIds).del();
    await knex('webhook_events').whereIn('gateway_txn_id', txnIds).del();
    await knex('payment_attempts').whereIn('order_id', orderIds).del();
    await knex('order_status_history').whereIn('order_id', orderIds).del();
    await knex('orders').whereIn('order_id', orderIds).del();

    const nowIso = new Date().toISOString();
    const futureExp = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const existingSeats = await knex('seats').where({ room_id: 1 }).limit(2);
    testSeat1 = existingSeats[0].id;
    testSeat2 = existingSeats[1].id;

    // Đơn 1: Dùng để test PAID (có vé và ghế SOLD)
    await knex('orders').insert({
      order_id: testOrderPaid,
      user_id: 1,
      showtime_id: 1,
      status: 'AWAITING_PAYMENT',
      amount_tickets: 60000,
      amount_combos: 0,
      amount_total: 60000,
      customer_name: 'Khách Hàng',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: futureExp,
      current_attempt_id: 'ATT_TEST6_P',
      created_at: nowIso,
      updated_at: nowIso,
    });
    await knex('order_seats').insert({
      order_id: testOrderPaid,
      seat_id: testSeat1,
      seat_type: 'STANDARD',
      price: 60000,
    });
    await knex('showtime_seats').insert({
      showtime_id: 1,
      seat_id: testSeat1,
      state: 'HELD',
      order_id: testOrderPaid,
      held_until: futureExp,
    }).onConflict(['showtime_id', 'seat_id']).merge();
    await knex('payment_attempts').insert({
      attempt_id: 'ATT_TEST6_P',
      order_id: testOrderPaid,
      gateway_txn_id: testTxnPaid,
      method: 'ATM',
      amount: 60000,
      status: 'REDIRECTED',
      idempotency_key: 'idemp_t6_paid',
      created_at: nowIso,
    });

    // Đơn 2: Dùng để test FAILED (nhả ghế HELD)
    await knex('orders').insert({
      order_id: testOrderFailed,
      user_id: 1,
      showtime_id: 1,
      status: 'AWAITING_PAYMENT',
      amount_tickets: 60000,
      amount_combos: 0,
      amount_total: 60000,
      customer_name: 'Khách Hàng',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: futureExp,
      current_attempt_id: 'ATT_TEST6_F',
      created_at: nowIso,
      updated_at: nowIso,
    });
    await knex('order_seats').insert({
      order_id: testOrderFailed,
      seat_id: testSeat2,
      seat_type: 'STANDARD',
      price: 60000,
    });
    await knex('showtime_seats').insert({
      showtime_id: 1,
      seat_id: testSeat2,
      state: 'HELD',
      order_id: testOrderFailed,
      held_until: futureExp,
    }).onConflict(['showtime_id', 'seat_id']).merge();
    await knex('payment_attempts').insert({
      attempt_id: 'ATT_TEST6_F',
      order_id: testOrderFailed,
      gateway_txn_id: testTxnFailed,
      method: 'ATM',
      amount: 60000,
      status: 'REDIRECTED',
      idempotency_key: 'idemp_t6_fail',
      created_at: nowIso,
    });
  });

  afterAll(async () => {
    try {
      const orderIds = [testOrderPaid, testOrderFailed, testOrderOwnerOnly];
      const txnIds = [testTxnPaid, testTxnFailed];

      await knex('tickets').whereIn('order_id', orderIds).del();
      await knex('showtime_seats').whereIn('order_id', orderIds).del();
      await knex('order_seats').whereIn('order_id', orderIds).del();
      await knex('support_tickets').whereIn('order_id', orderIds).del();
      await knex('webhook_events').whereIn('gateway_txn_id', txnIds).del();
      await knex('payment_attempts').whereIn('order_id', orderIds).del();
      await knex('order_status_history').whereIn('order_id', orderIds).del();
      await knex('orders').whereIn('order_id', orderIds).del();
    } catch (_e) {}
    await knex.destroy();
  });

  it('should transition to PAID, issue ticket and set showtime_seats to SOLD (clearing held_until)', async () => {
    // 1. Áp kết quả thành công cho testTxnPaid
    const result = await applyGatewayResult({
      txnRef: testTxnPaid,
      transNo: '14666777',
      amountVnd: 60000,
      responseCode: '00',
      transactionStatus: '00',
      payDate: '20261021200000',
      bankCode: 'NCB',
    });

    expect(result.RspCode).toBe('00');

    // 2. Kiểm tra vé đã được tạo trong bảng tickets
    const ticket = await knex('tickets').where({ order_id: testOrderPaid }).first();
    expect(ticket).toBeDefined();
    expect(ticket.ticket_id.startsWith('CS')).toBe(true);
    expect(ticket.status).toBe('VALID');
    expect(ticket.qr_payload).toBeDefined();

    // 3. Kiểm tra ghế đã chuyển sang SOLD và xóa held_until
    const showtimeSeat = await knex('showtime_seats')
      .where({ showtime_id: 1, seat_id: testSeat1 })
      .first();
    expect(showtimeSeat).toBeDefined();
    expect(showtimeSeat.state).toBe('SOLD');
    expect(showtimeSeat.held_until).toBeNull();
    expect(showtimeSeat.order_id).toBe(testOrderPaid);
  });

  it('should transition to FAILED and release held seats (delete showtime_seats HELD)', async () => {
    // 1. Trước khi thất bại, ghế testSeat2 đang ở trạng thái HELD
    const seatBefore = await knex('showtime_seats')
      .where({ showtime_id: 1, seat_id: testSeat2 })
      .first();
    expect(seatBefore).toBeDefined();
    expect(seatBefore.state).toBe('HELD');

    // 2. Áp kết quả thất bại từ cổng (code: 24 - khách hủy)
    const result = await applyGatewayResult({
      txnRef: testTxnFailed,
      transNo: '14777888',
      amountVnd: 60000,
      responseCode: '24',
      transactionStatus: '02',
      payDate: '20261021200000',
      bankCode: 'NCB',
    });

    expect(result.RspCode).toBe('00');

    // 3. Kiểm tra đơn hàng đã chuyển sang FAILED
    const order = await knex('orders').where({ order_id: testOrderFailed }).first();
    expect(order.status).toBe('FAILED');

    // 4. Kiểm tra ghế HELD đã được nhả (bị xóa khỏi showtime_seats)
    const seatAfter = await knex('showtime_seats')
      .where({ showtime_id: 1, seat_id: testSeat2 })
      .first();
    expect(seatAfter).toBeUndefined();
  });

  describe('GET /api/v1/orders/:id/status', () => {
    it('should return 401 AUTH_REQUIRED when unauthenticated', async () => {
      const res = await request(app).get(`/api/v1/orders/${testOrderPaid}/status`);
      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    it('should return 404 NOT_FOUND when accessed by another customer', async () => {
      // testOrderPaid thuộc User 1, User 2 truy cập -> 404
      const res = await request(app)
        .get(`/api/v1/orders/${testOrderPaid}/status`)
        .set('Cookie', user2Cookie);

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return order status, amount, ticket and timeline ordered newest first for owner', async () => {
      // User 1 truy cập đơn của chính mình
      const res = await request(app)
        .get(`/api/v1/orders/${testOrderPaid}/status`)
        .set('Cookie', user1Cookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const data = res.body.data;
      expect(data.orderId).toBe(testOrderPaid);
      expect(data.status).toBe('PAID');
      expect(data.amount).toBe(60000);

      // Có thông tin vé
      expect(data.ticket).toBeDefined();
      expect(data.ticket.ticket_id).toBeDefined();
      expect(data.ticket.status).toBe('VALID');

      // Timeline có các mốc thay đổi, mốc mới nhất nằm trước
      expect(data.timeline).toBeDefined();
      expect(data.timeline.length).toBeGreaterThan(0);
      expect(data.timeline[0].toStatus).toBe('PAID');
    });
  });
});
