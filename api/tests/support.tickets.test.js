'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');
const clock = require('../src/lib/clock');

describe('Step 10B: Support Lookup & Admin Tickets', () => {
  let app;
  let customerCookie;
  let cskhCookie;
  let managerCookie;

  const testOrderLookup = 'BC_LOOKUP_01';
  const testTxnLookup = 'GW_LOOKUP_01';
  const testOrderWithRf = 'BC_LOOKUP_RF';
  const testTxnWithRf = 'GW_LOOKUP_RF';

  const testTicketId = 'ST_ADMIN_TEST_01';

  async function cleanup() {
    await knex('support_ticket_notes').where({ ticket_id: testTicketId }).del();
    await knex('support_tickets').where({ ticket_id: testTicketId }).del();
    await knex('refunds').whereIn('order_id', [testOrderLookup, testOrderWithRf]).del();
    await knex('payment_attempts').whereIn('gateway_txn_id', [testTxnLookup, testTxnWithRf]).del();
    await knex('orders').whereIn('order_id', [testOrderLookup, testOrderWithRf]).del();
  }

  beforeAll(async () => {
    app = createApp();
    await cleanup();

    // 1. Đăng nhập Customer
    const resCust = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang@gmail.com', password: 'Password@123' });
    customerCookie = resCust.headers['set-cookie'];

    // 2. Đăng nhập CSKH
    const resCskh = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'cskh@betacinemas.vn', password: 'Password@123' });
    cskhCookie = resCskh.headers['set-cookie'];

    // 3. Đăng nhập Manager
    const resMgr = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'manager@betacinemas.vn', password: 'Password@123' });
    managerCookie = resMgr.headers['set-cookie'];

    const nowIso = clock.nowIso();

    // Tạo đơn 1 (bình thường, chưa có refund)
    await knex('orders').insert({
      order_id: testOrderLookup,
      user_id: 1,
      showtime_id: 1,
      status: 'PAID',
      amount_tickets: 60000,
      amount_combos: 0,
      amount_total: 60000,
      customer_name: 'Khách Tra Cứu',
      customer_phone: '0912345678',
      customer_email: 'tracuu@gmail.com',
      hold_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      created_at: nowIso,
      updated_at: nowIso,
    });
    await knex('payment_attempts').insert({
      attempt_id: 'ATT_' + testOrderLookup,
      order_id: testOrderLookup,
      gateway_txn_id: testTxnLookup,
      method: 'ATM',
      amount: 60000,
      status: 'SUCCESS',
      idempotency_key: 'idemp_' + testOrderLookup,
      created_at: nowIso,
    });

    // Tạo đơn 2 (FAILED + có refund)
    await knex('orders').insert({
      order_id: testOrderWithRf,
      user_id: 1,
      showtime_id: 1,
      status: 'REFUND_PENDING',
      amount_tickets: 80000,
      amount_combos: 0,
      amount_total: 80000,
      customer_name: 'Khách Hoàn Tiền',
      customer_phone: '0987654321',
      customer_email: 'hoantien@gmail.com',
      hold_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      created_at: nowIso,
      updated_at: nowIso,
    });
    await knex('payment_attempts').insert({
      attempt_id: 'ATT_' + testOrderWithRf,
      order_id: testOrderWithRf,
      gateway_txn_id: testTxnWithRf,
      method: 'ATM',
      amount: 80000,
      status: 'SUCCESS',
      idempotency_key: 'idemp_' + testOrderWithRf,
      created_at: nowIso,
    });
    await knex('refunds').insert({
      refund_id: 'RF_LOOKUP_TEST',
      order_id: testOrderWithRf,
      gateway_txn_id: testTxnWithRf,
      amount: 80000,
      type: 'AUTO',
      status: 'CHECKING',
      detected_at: nowIso,
      send_due_at: nowIso,
      checks_json: JSON.stringify({ a: true, b: true, c: true, d: true, e: true }),
    });

    // Tạo 1 ticket test cho admin
    await knex('support_tickets').insert({
      ticket_id: testTicketId,
      order_id: testOrderLookup,
      user_id: 1,
      contact: 'tracuu@gmail.com',
      source: 'CUSTOMER',
      status: 'NEW',
      created_at: nowIso,
    });
  });

  afterAll(async () => {
    await cleanup();
    await knex.destroy();
  });

  describe('POST /support/lookup', () => {
    it('1. Tra cứu bằng orderId + email khớp -> trả thông tin đơn + statusText dễ hiểu', async () => {
      const res = await request(app)
        .post('/api/v1/support/lookup')
        .send({
          orderId: testOrderLookup,
          email: 'tracuu@gmail.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.found).toBe(true);
      expect(res.body.data.orderId).toBe(testOrderLookup);
      expect(res.body.data.status).toBe('PAID');
      expect(res.body.data.statusText).toContain('Thanh toán thành công');
      expect(res.body.data.hasRefund).toBe(false);
    });

    it('2. Tra cứu bằng orderId + SĐT khớp -> trả thông tin thành công', async () => {
      const res = await request(app)
        .post('/api/v1/support/lookup')
        .send({
          orderId: testOrderLookup,
          phone: '0912345678',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.found).toBe(true);
    });

    it('3. Tra cứu bằng mã giao dịch (txnId) + email khớp -> trả thông tin thành công', async () => {
      const res = await request(app)
        .post('/api/v1/support/lookup')
        .send({
          txnId: testTxnLookup,
          contact: 'tracuu@gmail.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.found).toBe(true);
      expect(res.body.data.orderId).toBe(testOrderLookup);
    });

    it('4. Đơn có refund: trả hasRefund = true kèm thông tin refund chi tiết', async () => {
      const res = await request(app)
        .post('/api/v1/support/lookup')
        .send({
          orderId: testOrderWithRf,
          email: 'hoantien@gmail.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.found).toBe(true);
      expect(res.body.data.hasRefund).toBe(true);
      expect(res.body.data.refund).toBeDefined();
      expect(res.body.data.refund.refundId).toBe('RF_LOOKUP_TEST');
      expect(res.body.data.refund.status).toBe('CHECKING');
      expect(res.body.data.refund.statusText).toContain('kiểm tra');
    });

    it('5. Không khớp email/SĐT: trả thông báo chung, không lộ đơn có tồn tại hay không', async () => {
      const res = await request(app)
        .post('/api/v1/support/lookup')
        .send({
          orderId: testOrderLookup,
          email: 'email_sai@gmail.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.found).toBe(false);
      expect(res.body.data.message).toContain('Không tìm thấy thông tin giao dịch');
      expect(res.body.data.orderId).toBeUndefined();
    });

    it('6. Mã đơn không tồn tại: cũng trả cùng một thông báo chung', async () => {
      const res = await request(app)
        .post('/api/v1/support/lookup')
        .send({
          orderId: 'BC_KHONG_TON_TAI_999',
          email: 'tracuu@gmail.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.found).toBe(false);
      expect(res.body.data.message).toContain('Không tìm thấy thông tin giao dịch');
    });
  });

  describe('Admin Tickets: GET & PATCH /admin/tickets', () => {
    it('7. Khách hàng (CUSTOMER) bị chặn truy cập /admin/tickets -> 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/admin/tickets')
        .set('Cookie', customerCookie);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('8. CSKH truy cập /admin/tickets -> 200, nhận danh sách tickets', async () => {
      const res = await request(app)
        .get('/api/v1/admin/tickets')
        .set('Cookie', cskhCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const found = res.body.data.find((t) => t.ticket_id === testTicketId);
      expect(found).toBeDefined();
    });

    it('9. Manager truy cập /admin/tickets với bộ lọc ?status=NEW', async () => {
      const res = await request(app)
        .get('/api/v1/admin/tickets?status=NEW')
        .set('Cookie', managerCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.every((t) => t.status === 'NEW')).toBe(true);
    });

    it('10. CSKH cập nhật ticket và ghi chú vào support_ticket_notes (PATCH /admin/tickets/:id)', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/tickets/${testTicketId}`)
        .set('Cookie', cskhCookie)
        .send({
          status: 'IN_REVIEW',
          resolution: 'Đang liên hệ khách hàng để kiểm tra sao kê ngân hàng',
          note: 'Đã gọi cho khách hàng lúc 14h, khách xác nhận đã bị trừ tiền.',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.ticket.status).toBe('IN_REVIEW');
      expect(res.body.data.ticket.resolution).toContain('kiểm tra sao kê');
      expect(res.body.data.notes).toHaveLength(1);
      expect(res.body.data.notes[0].note).toContain('Đã gọi cho khách hàng');

      // Kiểm tra trong CSDL bảng support_ticket_notes
      const noteRow = await knex('support_ticket_notes')
        .where({ ticket_id: testTicketId })
        .first();
      expect(noteRow).toBeDefined();
      expect(noteRow.note).toContain('Đã gọi cho khách hàng');
    });
  });
});
