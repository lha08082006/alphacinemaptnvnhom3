'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');
const { REFUND_ESTIMATED_TIMES } = require('../src/config/constants');

describe('Result Page & Order Verification (BE-06 & Support Lookup)', () => {
  let app;
  let user1Cookie;
  let user2Cookie;
  const testOrderPaid = 'BC_RES_PAID_01';
  const testOrderRefundPending = 'BC_RES_RF_PENDING_01';
  const testOrderExpired = 'BC_RES_EXPIRED_01';
  const createdOrderIds = [testOrderPaid, testOrderRefundPending, testOrderExpired];

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

    const nowIso = new Date().toISOString();

    // 2. Chuẩn bị đơn 1: PAID có vé
    await knex('orders').insert({
      order_id: testOrderPaid,
      user_id: 1, // Thuộc user 1
      showtime_id: 1,
      status: 'PAID',
      amount_tickets: 60000,
      amount_combos: 0,
      amount_total: 60000,
      customer_name: 'Khách Hàng 1',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      payment_method: 'ATM',
      hold_expires_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    });
    await knex('tickets').insert({
      ticket_id: 'CS_RES_001',
      order_id: testOrderPaid,
      qr_payload: 'TICKET:CS_RES_001:PAID',
      status: 'VALID',
      issued_at: nowIso,
    });

    // 3. Chuẩn bị đơn 2: REFUND_PENDING có refund
    await knex('orders').insert({
      order_id: testOrderRefundPending,
      user_id: 1,
      showtime_id: 1,
      status: 'REFUND_PENDING',
      amount_tickets: 100000,
      amount_combos: 0,
      amount_total: 100000,
      customer_name: 'Khách Hàng 1',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      payment_method: 'INTL_CARD',
      hold_expires_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    });
    await knex('refunds').insert({
      refund_id: 'RF_RES_001',
      order_id: testOrderRefundPending,
      gateway_txn_id: 'GW_RES_TXN_001',
      type: 'AUTO',
      amount: 100000,
      status: 'CHECKING',
      detected_at: nowIso,
      send_due_at: nowIso,
      checks_json: JSON.stringify({ a: true, b: true, c: true, d: true, e: true }),
    });

    // 4. Chuẩn bị đơn 3: EXPIRED
    await knex('orders').insert({
      order_id: testOrderExpired,
      user_id: 1,
      showtime_id: 1,
      status: 'EXPIRED',
      amount_tickets: 50000,
      amount_combos: 0,
      amount_total: 50000,
      customer_name: 'Khách Hàng 1',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      payment_method: 'QR',
      hold_expires_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    });
  });

  afterAll(async () => {
    await knex('tickets').whereIn('order_id', createdOrderIds).del();
    await knex('refunds').whereIn('order_id', createdOrderIds).del();
    await knex('order_status_history').whereIn('order_id', createdOrderIds).del();
    await knex('orders').whereIn('order_id', createdOrderIds).del();
    await knex.destroy();
  });

  describe('1. Chính chủ truy cập GET /orders/:id/status', () => {
    it('chính chủ xem đơn PAID: nhận đủ status, amount, ticket VALID', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${testOrderPaid}/status`)
        .set('Cookie', user1Cookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.status).toBe('PAID');
      expect(res.body.data.ticket).toBeDefined();
      expect(res.body.data.ticket.ticket_id).toBe('CS_RES_001');
      expect(res.body.data.ticket.status).toBe('VALID');
    });

    it('chính chủ xem đơn REFUND_PENDING: nhận đủ thông tin hoàn tiền & thời gian dự kiến thẻ quốc tế (30 ngày)', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${testOrderRefundPending}/status`)
        .set('Cookie', user1Cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REFUND_PENDING');
      expect(res.body.data.refund).toBeDefined();
      expect(res.body.data.refund.refund_id).toBe('RF_RES_001');
      expect(res.body.data.estimatedRefundTime).toBe(REFUND_ESTIMATED_TIMES.INTL_CARD);
      expect(res.body.data.estimatedRefundTime).toContain('30 ngày làm việc');
    });

    it('khách khác (User 2) xem đơn của User 1: bị từ chối 404 NOT_FOUND', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${testOrderPaid}/status`)
        .set('Cookie', user2Cookie);

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('chưa đăng nhập gọi GET /orders/:id/status: bị từ chối 401 AUTH_REQUIRED', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${testOrderPaid}/status`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('2. Khách vãng lai / chưa đăng nhập tra cứu qua POST /support/lookup', () => {
    it('tra cứu đúng mã đơn + email: nhận đủ thông tin đơn và vé dù không có cookie đăng nhập', async () => {
      const res = await request(app)
        .post('/api/v1/support/lookup')
        .send({
          orderId: testOrderPaid,
          email: 'khachhang@gmail.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.found).toBe(true);
      expect(res.body.data.status).toBe('PAID');
      expect(res.body.data.ticket).toBeDefined();
      expect(res.body.data.ticket.ticketId).toBe('CS_RES_001');
    });

    it('tra cứu đúng mã đơn + SĐT đơn hoàn: nhận thông tin refund và estimatedRefundTime', async () => {
      const res = await request(app)
        .post('/api/v1/support/lookup')
        .send({
          orderId: testOrderRefundPending,
          phone: '0987654321',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.found).toBe(true);
      expect(res.body.data.hasRefund).toBe(true);
      expect(res.body.data.refund.refundId).toBe('RF_RES_001');
      expect(res.body.data.estimatedRefundTime).toBe(REFUND_ESTIMATED_TIMES.INTL_CARD);
    });

    it('tra cứu sai email/SĐT: trả found: false (không lộ đơn)', async () => {
      const res = await request(app)
        .post('/api/v1/support/lookup')
        .send({
          orderId: testOrderPaid,
          email: 'sai_email@gmail.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.found).toBe(false);
      expect(res.body.data.ticket).toBeUndefined();
    });
  });
});
