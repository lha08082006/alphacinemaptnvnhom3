'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');

describe('Step 4: Payment Service & Route POST /payments', () => {
  let app;
  let user1Cookie;
  let user2Cookie;

  const testOrder1 = 'BCTEST4001';
  const testOrder2 = 'BCTEST4002';
  const testExpiredOrder = 'BCTEST4EXP';

  beforeAll(async () => {
    app = createApp();

    // 1. Đăng nhập User 1 (id: 1, khachhang@gmail.com)
    const login1 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang@gmail.com', password: 'Password@123' });
    user1Cookie = login1.headers['set-cookie'];

    // 2. Đăng nhập User 2 (id: 2, khachhang2@gmail.com)
    const login2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang2@gmail.com', password: 'Password@123' });
    user2Cookie = login2.headers['set-cookie'];

    // Dọn dẹp dữ liệu test cũ nếu có
    await knex('payment_attempts').whereIn('order_id', [testOrder1, testOrder2, testExpiredOrder]).del();
    await knex('order_status_history').whereIn('order_id', [testOrder1, testOrder2, testExpiredOrder]).del();
    await knex('orders').whereIn('order_id', [testOrder1, testOrder2, testExpiredOrder]).del();

    const futureExp = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const pastExp = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    // Tạo các đơn hàng mẫu cho test
    // Đơn 1: thuộc User 1, HOLDING, còn hạn
    await knex('orders').insert({
      order_id: testOrder1,
      user_id: 1,
      showtime_id: 1,
      status: 'HOLDING',
      amount_tickets: 60000,
      amount_combos: 0,
      amount_total: 60000,
      customer_name: 'Khách Hàng',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: futureExp,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // Đơn 2: thuộc User 2, HOLDING, còn hạn
    await knex('orders').insert({
      order_id: testOrder2,
      user_id: 2,
      showtime_id: 1,
      status: 'HOLDING',
      amount_tickets: 100000,
      amount_combos: 0,
      amount_total: 100000,
      customer_name: 'Khách Hàng 2',
      customer_phone: '0987654322',
      customer_email: 'khachhang2@gmail.com',
      hold_expires_at: futureExp,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // Đơn hết hạn: thuộc User 1, HOLDING nhưng quá hạn
    await knex('orders').insert({
      order_id: testExpiredOrder,
      user_id: 1,
      showtime_id: 1,
      status: 'HOLDING',
      amount_tickets: 50000,
      amount_combos: 0,
      amount_total: 50000,
      customer_name: 'Khách Hàng',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: pastExp,
      created_at: nowIso,
      updated_at: nowIso,
    });
  });

  afterAll(async () => {
    try {
      await knex('payment_attempts').whereIn('order_id', [testOrder1, testOrder2, testExpiredOrder]).del();
      await knex('order_status_history').whereIn('order_id', [testOrder1, testOrder2, testExpiredOrder]).del();
      await knex('orders').whereIn('order_id', [testOrder1, testOrder2, testExpiredOrder]).del();
    } catch (_e) {}
    await knex.destroy();
  });

  it('should require authentication (401 AUTH_REQUIRED)', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Idempotency-Key', 'idemp_key_test_01')
      .send({ orderId: testOrder1, method: 'ATM' });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('should validate Idempotency-Key header format (400 VALIDATION_ERROR)', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', user1Cookie)
      .set('Idempotency-Key', 'short') // < 8 ký tự
      .send({ orderId: testOrder1, method: 'ATM' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should create payment successfully with valid order and idempotency key', async () => {
    const idempotencyKey = 'idemp_key_success_001';

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', user1Cookie)
      .set('Idempotency-Key', idempotencyKey)
      .send({ orderId: testOrder1, method: 'ATM' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toBeDefined();

    const { attemptId, paymentUrl } = res.body.data;
    expect(attemptId).toBeDefined();
    expect(attemptId.startsWith('ATT_')).toBe(true);

    // Kiểm tra paymentUrl VNPay
    expect(paymentUrl).toContain('vnp_Amount=6000000'); // 60,000 VND * 100
    expect(paymentUrl).toContain('vnp_BankCode=VNBANK');
    expect(paymentUrl).toContain('vnp_SecureHash=');

    // Kiểm tra CSDL
    const updatedOrder = await knex('orders').where({ order_id: testOrder1 }).first();
    expect(updatedOrder.status).toBe('AWAITING_PAYMENT');
    expect(updatedOrder.current_attempt_id).toBe(attemptId);
    expect(updatedOrder.payment_method).toBe('ATM');
    expect(updatedOrder.terms_accepted_at).toBeDefined();
    expect(updatedOrder.terms_version).toBe('v1.0');

    // Kiểm tra order_status_history
    const history = await knex('order_status_history')
      .where({ order_id: testOrder1 })
      .orderBy('id', 'desc')
      .first();
    expect(history.from_status).toBe('HOLDING');
    expect(history.to_status).toBe('AWAITING_PAYMENT');
    expect(history.actor_type).toBe('USER');
    expect(history.actor_id).toBe(1);

    // Kiểm tra payment_attempts
    const attempt = await knex('payment_attempts').where({ attempt_id: attemptId }).first();
    expect(attempt).toBeDefined();
    expect(attempt.status).toBe('REDIRECTED');
    expect(attempt.amount).toBe(60000);
    expect(attempt.idempotency_key).toBe(idempotencyKey);
  });

  it('should return existing attempt and paymentUrl when called with same Idempotency-Key (BR-11)', async () => {
    const idempotencyKey = 'idemp_key_success_001';

    // Đếm số lượng attempt trước khi gọi lại
    const countBefore = await knex('payment_attempts')
      .where({ order_id: testOrder1 })
      .count('attempt_id as count')
      .first();

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', user1Cookie)
      .set('Idempotency-Key', idempotencyKey)
      .send({ orderId: testOrder1, method: 'ATM' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.attemptId).toBeDefined();
    expect(res.body.data.paymentUrl).toBeDefined();

    // Không tạo thêm attempt thứ hai trong CSDL
    const countAfter = await knex('payment_attempts')
      .where({ order_id: testOrder1 })
      .count('attempt_id as count')
      .first();
    expect(countAfter.count).toBe(countBefore.count);
  });

  it('should reject with 409 IDEMPOTENCY_CONFLICT when same key is used for a different order', async () => {
    const idempotencyKey = 'idemp_key_success_001'; // Đã dùng cho testOrder1

    // Dùng key trên nhưng gửi cho testOrder2 (dù đăng nhập là user2)
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', user2Cookie)
      .set('Idempotency-Key', idempotencyKey)
      .send({ orderId: testOrder2, method: 'WALLET' });

    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('should reject with 404 NOT_FOUND when accessing another user order', async () => {
    // User 1 cố gắng tạo thanh toán cho testOrder2 (thuộc User 2)
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', user1Cookie)
      .set('Idempotency-Key', 'idemp_other_user_order')
      .send({ orderId: testOrder2, method: 'ATM' });

    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should reject with 409 HOLD_EXPIRED when order holding time has expired', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', user1Cookie)
      .set('Idempotency-Key', 'idemp_expired_order_test')
      .send({ orderId: testExpiredOrder, method: 'INTL_CARD' });

    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('HOLD_EXPIRED');
  });

  it('should create payment with method QR and custom termsVersion', async () => {
    const newOrderId = 'BC777888999';
    await knex('orders').insert({
      order_id: newOrderId,
      user_id: 1,
      showtime_id: 1,
      status: 'HOLDING',
      amount_tickets: 50000,
      amount_combos: 0,
      amount_total: 50000,
      customer_name: 'Nguyen Van A',
      customer_phone: '0901234567',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', user1Cookie)
      .set('Idempotency-Key', 'idemp_qr_test_001')
      .send({
        orderId: newOrderId,
        method: 'QR',
        termsAccepted: true,
        termsVersion: 'v2.1',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.paymentUrl).toContain('vnp_BankCode=VNPAYQR');

    const updated = await knex('orders').where({ order_id: newOrderId }).first();
    expect(updated.payment_method).toBe('QR');
    expect(updated.terms_version).toBe('v2.1');
    expect(updated.terms_accepted_at).toBeDefined();

    // Cleanup
    await knex('payment_attempts').where({ order_id: newOrderId }).del();
    await knex('order_status_history').where({ order_id: newOrderId }).del();
    await knex('orders').where({ order_id: newOrderId }).del();
  });

  it('should reject with 400 VALIDATION_ERROR when termsAccepted is false', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', user1Cookie)
      .set('Idempotency-Key', 'idemp_terms_false')
      .send({ orderId: testOrder1, method: 'QR', termsAccepted: false });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject with 400 VALIDATION_ERROR when method is not in allowed enum', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', user1Cookie)
      .set('Idempotency-Key', 'idemp_invalid_method')
      .send({ orderId: testOrder1, method: 'MOMO' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
