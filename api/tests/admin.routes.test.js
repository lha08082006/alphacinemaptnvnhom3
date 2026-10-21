'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');
const clock = require('../src/lib/clock');

describe('Step 10C: Admin Reports, Refunds, Recon & Settings', () => {
  let app;
  let customerCookie;
  let itCookie;
  let accountantCookie;
  let cskhCookie;
  let managerCookie;

  const testRefundId = 'RF_ADMIN_APPR_01';
  const testOrderId = 'BC_ADMIN_APPR_01';
  const testTxnId = 'GW_ADMIN_APPR_01';

  async function cleanup() {
    await knex('audit_log').where({ entity_id: 'SYSTEM' }).del();
    await knex('refunds').where({ refund_id: testRefundId }).del();
    await knex('payment_attempts').where({ gateway_txn_id: testTxnId }).del();
    await knex('orders').where({ order_id: testOrderId }).del();
  }

  beforeAll(async () => {
    app = createApp();
    await cleanup();

    // 1. Đăng nhập các role
    const resCust = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang@gmail.com', password: 'Password@123' });
    customerCookie = resCust.headers['set-cookie'];

    const resIt = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'it@betacinemas.vn', password: 'Password@123' });
    itCookie = resIt.headers['set-cookie'];

    const resAcct = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ketoan@betacinemas.vn', password: 'Password@123' });
    accountantCookie = resAcct.headers['set-cookie'];

    const resCskh = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'cskh@betacinemas.vn', password: 'Password@123' });
    cskhCookie = resCskh.headers['set-cookie'];

    const resMgr = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'manager@betacinemas.vn', password: 'Password@123' });
    managerCookie = resMgr.headers['set-cookie'];

    // 2. Tạo đơn và refund mẫu để test approve
    const nowIso = clock.nowIso();
    await knex('orders').insert({
      order_id: testOrderId,
      user_id: 1,
      showtime_id: 1,
      status: 'REFUND_PENDING',
      amount_tickets: 50000,
      amount_combos: 0,
      amount_total: 50000,
      customer_name: 'Khách Test Approve',
      customer_phone: '0987654321',
      customer_email: 'khach@test.com',
      hold_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      created_at: nowIso,
      updated_at: nowIso,
    });
    await knex('payment_attempts').insert({
      attempt_id: 'ATT_' + testOrderId,
      order_id: testOrderId,
      gateway_txn_id: testTxnId,
      method: 'ATM',
      amount: 50000,
      status: 'SUCCESS',
      idempotency_key: 'idemp_' + testOrderId,
      created_at: nowIso,
    });
    await knex('refunds').insert({
      refund_id: testRefundId,
      order_id: testOrderId,
      gateway_txn_id: testTxnId,
      amount: 50000,
      type: 'MANUAL',
      status: 'CHECKING',
      detected_at: nowIso,
      send_due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      checks_json: JSON.stringify({ a: true, b: true, c: true, d: true, e: true }),
    });
  });

  afterAll(async () => {
    await cleanup();
    // Trả lại settings về ASIS
    await knex('settings').insert([
      { key: 'mode', value: 'ASIS', updated_at: clock.nowIso() },
    ]).onConflict('key').merge();
    await knex.destroy();
  });

  describe('1. GET /admin/reports/reconciliation', () => {
    it('CUSTOMER bị chặn truy cập -> 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/reconciliation')
        .set('Cookie', customerCookie);
      expect(res.status).toBe(403);
    });

    it('ACCOUNTANT xem được báo cáo đối soát theo ngày', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/reconciliation')
        .set('Cookie', accountantCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      if (res.body.data.length > 0) {
        const item = res.body.data[0];
        expect(item).toHaveProperty('date');
        expect(item).toHaveProperty('gateway_total');
        expect(item).toHaveProperty('beta_total');
        expect(item).toHaveProperty('difference');
        expect(item).toHaveProperty('hanging_count');
        expect(item).toHaveProperty('refunded_count');
        expect(item).toHaveProperty('refunding_count');
      }
    });

    it('MANAGER xem được báo cáo đối soát', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/reconciliation')
        .set('Cookie', managerCookie);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('2. GET /admin/reports/reconciliation/export.csv', () => {
    it('Xuất file CSV báo cáo đối soát có UTF-8 BOM', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/reconciliation/export.csv')
        .set('Cookie', accountantCookie);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('reconciliation-report.csv');

      // Kiểm tra có ký tự BOM UTF-8 (\uFEFF)
      expect(res.text.startsWith('\uFEFF')).toBe(true);
      expect(res.text).toContain('Ngày,Tổng tiền Cổng (VND),Tổng tiền Beta (VND),Chênh lệch (VND),Số GD treo,Đã hoàn,Đang hoàn');
    });
  });

  describe('3. GET /admin/refunds', () => {
    it('CUSTOMER bị chặn -> 403', async () => {
      const res = await request(app)
        .get('/api/v1/admin/refunds')
        .set('Cookie', customerCookie);
      expect(res.status).toBe(403);
    });

    it('CSKH / ACCOUNTANT xem được danh sách refunds', async () => {
      const res = await request(app)
        .get('/api/v1/admin/refunds')
        .set('Cookie', cskhCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const found = res.body.data.find((r) => r.refund_id === testRefundId);
      expect(found).toBeDefined();
      expect(found.amount).toBe(50000);
    });
  });

  describe('4. POST /admin/refunds/:id/approve', () => {
    it('ACCOUNTANT duyệt lệnh hoàn tiền -> thực thi và chuyển trạng thái', async () => {
      // Mock gateway refund
      const refundService = require('../src/services/refundService');
      refundService.setGatewayAdapter({
        refund: jest.fn().mockResolvedValue({
          vnp_ResponseCode: '00',
          vnp_ResponseId: 'RF_APPROVE_GW_001',
          vnp_Message: 'Hoan tien thanh cong',
        }),
      });

      const res = await request(app)
        .post(`/api/v1/admin/refunds/${testRefundId}/approve`)
        .set('Cookie', accountantCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.refund_id).toBe(testRefundId);
      expect(res.body.data.status).toBe('COMPLETED');

      // Đơn hàng tương ứng chuyển sang REFUNDED
      const order = await knex('orders').where({ order_id: testOrderId }).first();
      expect(order.status).toBe('REFUNDED');
    });

    it('Duyệt refund không tồn tại -> 404 NOT_FOUND', async () => {
      const res = await request(app)
        .post('/api/v1/admin/refunds/RF_KHONG_TON_TAI/approve')
        .set('Cookie', accountantCookie);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('5. POST /admin/recon/run', () => {
    it('CUSTOMER bị chặn -> 403', async () => {
      const res = await request(app)
        .post('/api/v1/admin/recon/run')
        .set('Cookie', customerCookie);
      expect(res.status).toBe(403);
    });

    it('IT kích hoạt chạy đối soát thủ công thành công', async () => {
      const reconService = require('../src/services/reconService');
      reconService.setGatewayAdapter({
        queryTransaction: jest.fn().mockResolvedValue({
          vnp_ResponseCode: '02',
          vnp_TransactionStatus: '02',
        }),
      });

      const res = await request(app)
        .post('/api/v1/admin/recon/run')
        .set('Cookie', itCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.trigger).toBe('MANUAL');
      expect(res.body.data.status).toBe('DONE');
    });
  });

  describe('6. PATCH /admin/settings', () => {
    it('CUSTOMER hoặc CSKH bị chặn sửa settings -> 403 FORBIDDEN', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/settings')
        .set('Cookie', cskhCookie)
        .send({ mode: 'TOBE' });
      expect(res.status).toBe(403);
    });

    it('IT cập nhật settings thành công, ghi audit_log', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/settings')
        .set('Cookie', itCookie)
        .send({
          mode: 'TOBE',
          reconcileIntervalMin: 5,
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.mode).toBe('TOBE');
      expect(res.body.data.reconcileIntervalMin).toBe('5');

      // Kiểm tra CSDL settings
      const rowMode = await knex('settings').where({ key: 'mode' }).first();
      expect(rowMode.value).toBe('TOBE');

      // Kiểm tra bản ghi audit_log
      const log = await knex('audit_log')
        .where({ action: 'UPDATE_SETTINGS', entity: 'SETTINGS' })
        .orderBy('id', 'desc')
        .first();
      expect(log).toBeDefined();
      expect(log.actor_type).toBe('USER');
      expect(JSON.parse(log.after_json).mode).toBe('TOBE');
    });

    it('Dữ liệu không hợp lệ (sai enum) -> 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/settings')
        .set('Cookie', itCookie)
        .send({
          mode: 'INVALID_MODE',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
