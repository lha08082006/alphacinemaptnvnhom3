'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');
const clock = require('../src/lib/clock');

describe('Acceptance Criteria: Full Flow from Lookup to Ticket Creation and Tracking', () => {
  let app;
  let customerCookie;
  const testOrderId = 'BC_FLOW_ORDER_01';
  let createdTicketId = null;

  beforeAll(async () => {
    app = createApp();

    // 1. Đăng nhập Customer
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang@gmail.com', password: 'Password@123' });
    customerCookie = loginRes.headers['set-cookie'];

    // Dọn dẹp
    await knex('support_ticket_notes').where({ ticket_id: 'CS_FLOW_TEST' }).del();
    await knex('support_tickets').where({ order_id: testOrderId }).del();
    await knex('payment_attempts').where({ order_id: testOrderId }).del();
    await knex('orders').where({ order_id: testOrderId }).del();

    const nowMs = clock.nowMs();
    const orderTimeIso = new Date(nowMs - 25 * 60 * 1000).toISOString(); // Tạo 25 phút trước -> còn 35 phút khiếu nại

    await knex('orders').insert({
      order_id: testOrderId,
      user_id: 1,
      showtime_id: 1,
      status: 'PAID',
      amount_tickets: 90000,
      amount_combos: 0,
      amount_total: 90000,
      customer_name: 'Khách Hàng Flow',
      customer_phone: '0988776655',
      customer_email: 'flow_khach@gmail.com',
      hold_expires_at: orderTimeIso,
      created_at: orderTimeIso,
      updated_at: orderTimeIso,
    });

    await knex('payment_attempts').insert({
      attempt_id: 'ATT_' + testOrderId,
      order_id: testOrderId,
      gateway_txn_id: 'GW_FLOW_TXN_01',
      method: 'ATM',
      amount: 90000,
      status: 'SUCCESS',
      idempotency_key: 'idemp_' + testOrderId,
      created_at: orderTimeIso,
    });
  });

  afterAll(async () => {
    if (createdTicketId) {
      await knex('support_ticket_notes').where({ ticket_id: createdTicketId }).del();
      await knex('support_tickets').where({ ticket_id: createdTicketId }).del();
    }
    await knex('support_tickets').where({ order_id: testOrderId }).del();
    await knex('payment_attempts').where({ order_id: testOrderId }).del();
    await knex('orders').where({ order_id: testOrderId }).del();
    await knex.destroy();
  });

  it('Bước 1: Tra cứu lịch sử đơn hàng (GET /api/v1/orders) hiển thị hạn khiếu nại còn lại', async () => {
    const res = await request(app)
      .get('/api/v1/orders')
      .set('Cookie', customerCookie);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const targetOrder = res.body.data.find((o) => o.orderId === testOrderId);
    expect(targetOrder).toBeDefined();
    expect(targetOrder.status).toBe('PAID');
    expect(targetOrder.remainingClaimMinutes).toBeGreaterThanOrEqual(30);
    expect(targetOrder.remainingClaimMinutes).toBeLessThanOrEqual(40);
    expect(targetOrder.isClaimExpired).toBe(false);
  });

  it('Bước 2: Chi tiết đơn hàng (GET /api/v1/orders/:id/status) cung cấp đủ thông tin và hạn khiếu nại', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${testOrderId}/status`)
      .set('Cookie', customerCookie);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.orderId).toBe(testOrderId);
    expect(res.body.data.remainingClaimMinutes).toBeDefined();
    expect(res.body.data.isClaimExpired).toBe(false);
  });

  it('Bước 3: Tại trang khiếu nại - Bước 1 tra cứu đơn hàng (POST /api/v1/support/lookup)', async () => {
    const res = await request(app)
      .post('/api/v1/support/lookup')
      .send({
        orderId: testOrderId,
        email: 'flow_khach@gmail.com',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.found).toBe(true);
    expect(res.body.data.orderId).toBe(testOrderId);
    expect(res.body.data.friendlyStatus).toBe('đã có vé');
    expect(res.body.data.amount).toBe(90000);
  });

  it('Bước 4: Chỉ khi cần khiếu nại -> Tạo ticket (POST /api/v1/support/tickets)', async () => {
    const res = await request(app)
      .post('/api/v1/support/tickets')
      .send({
        orderId: testOrderId,
        contact: 'flow_khach@gmail.com',
        issueType: 'DOUBLE_PAYMENT',
        description: 'Tôi đã thanh toán 2 lần cho đơn hàng này, cần hoàn lại 1 lượt giao dịch trùng.',
        receiptImage: 'https://files.betacorp.vn/receipt_double.png',
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.ticketId).toBeDefined();
    expect(res.body.data.ticketId.startsWith('CS')).toBe(true);
    expect(res.body.data.status).toBe('NEW');
    expect(res.body.data.statusLabel).toBe('Mới');
    expect(res.body.data.isExpired60Min).toBe(false);
    expect(res.body.data.slaDueAt).toBeDefined();

    createdTicketId = res.body.data.ticketId;
  });

  it('Bước 5: Chuyển sang Theo dõi khiếu nại (GET /api/v1/support/tickets/:code) xem tiến độ và phản hồi', async () => {
    const res = await request(app)
      .get(`/api/v1/support/tickets/${createdTicketId}?contact=flow_khach@gmail.com`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.ticketId).toBe(createdTicketId);
    expect(res.body.data.orderId).toBe(testOrderId);
    expect(res.body.data.issueTypeLabel).toBe('Thanh toán hai lần');
    expect(res.body.data.status).toBe('NEW');
    expect(res.body.data.statusLabel).toBe('Mới');
    expect(res.body.data.slaDueAt).toBeDefined();
    expect(res.body.data.hasAttachment).toBe(true);

    // Không để lộ thông tin nội bộ
    expect(res.body.data.assigned_to).toBeUndefined();
    expect(res.body.data.notes).toBeUndefined();
  });
});
