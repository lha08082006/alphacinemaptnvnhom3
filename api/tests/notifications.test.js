'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');
const clock = require('../src/lib/clock');
const { notify } = require('../src/services/notificationService');

describe('Step 10A: Notification Service & Routes (BR-09)', () => {
  let app;
  let user1Cookie;
  let user2Cookie;

  const testOrderPending = 'BC_NOTIF_PENDING';
  const testOrderPaid = 'BC_NOTIF_PAID';
  const testOrderFailedNoRf = 'BC_NOTIF_FAIL_NO_RF';
  const testOrderFailedWithRf = 'BC_NOTIF_FAIL_WITH_RF';
  const testOrderRefundSent = 'BC_NOTIF_RF_SENT';
  const testOrderRefundDone = 'BC_NOTIF_RF_DONE';

  const allOrderIds = [
    testOrderPending,
    testOrderPaid,
    testOrderFailedNoRf,
    testOrderFailedWithRf,
    testOrderRefundSent,
    testOrderRefundDone,
  ];

  async function cleanup() {
    await knex('notifications').whereIn('order_id', allOrderIds).del();
    await knex('refunds').whereIn('order_id', allOrderIds).del();
    await knex('orders').whereIn('order_id', allOrderIds).del();
  }

  async function insertOrder(orderId, status = 'PENDING_VERIFY', userId = 1) {
    const nowIso = clock.nowIso();
    await knex('orders').insert({
      order_id: orderId,
      user_id: userId,
      showtime_id: 1,
      status,
      amount_tickets: 50000,
      amount_combos: 0,
      amount_total: 50000,
      customer_name: 'Test Khách',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      created_at: nowIso,
      updated_at: nowIso,
    });
  }

  beforeAll(async () => {
    app = createApp();
    await cleanup();

    // Đăng nhập User 1
    const login1 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang@gmail.com', password: 'Password@123' });
    user1Cookie = login1.headers['set-cookie'];

    // Đăng nhập User 2
    const login2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang2@gmail.com', password: 'Password@123' });
    user2Cookie = login2.headers['set-cookie'];
  });

  afterAll(async () => {
    await cleanup();
    await knex.destroy();
  });

  describe('notify() service', () => {
    it('1. PENDING_VERIFY: ghi 3 bản ghi theo thứ tự WEB -> EMAIL -> SMS với tiêu đề "Đang xử lý"', async () => {
      await insertOrder(testOrderPending, 'PENDING_VERIFY', 1);
      const order = await knex('orders').where({ order_id: testOrderPending }).first();

      const created = await knex.transaction(async (trx) => {
        return await notify(trx, order, 'PENDING_VERIFY');
      });

      expect(created).toHaveLength(3);
      expect(created[0].channel).toBe('WEB');
      expect(created[1].channel).toBe('EMAIL');
      expect(created[2].channel).toBe('SMS');

      const rows = await knex('notifications').where({ order_id: testOrderPending }).orderBy('id', 'asc');
      expect(rows).toHaveLength(3);
      expect(rows[0].channel).toBe('WEB');
      expect(rows[1].channel).toBe('EMAIL');
      expect(rows[2].channel).toBe('SMS');
      expect(rows[0].title).toBe('Đang xử lý');
      expect(rows[0].status).toBe('SENT');
      expect(rows[0].read_at).toBeNull();
    });

    it('2. PAID: thông báo "Đặt vé thành công" qua 3 kênh', async () => {
      await insertOrder(testOrderPaid, 'PAID', 1);
      const order = await knex('orders').where({ order_id: testOrderPaid }).first();

      await knex.transaction(async (trx) => {
        return await notify(trx, order, 'PAID');
      });

      const rows = await knex('notifications').where({ order_id: testOrderPaid }).orderBy('id', 'asc');
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.channel)).toEqual(['WEB', 'EMAIL', 'SMS']);
      expect(rows[0].title).toBe('Đặt vé thành công');
    });

    it('3. FAILED không có refund: "Thanh toán thất bại"', async () => {
      await insertOrder(testOrderFailedNoRf, 'FAILED', 1);
      const order = await knex('orders').where({ order_id: testOrderFailedNoRf }).first();

      await knex.transaction(async (trx) => {
        return await notify(trx, order, 'FAILED');
      });

      const rows = await knex('notifications').where({ order_id: testOrderFailedNoRf });
      expect(rows).toHaveLength(3);
      expect(rows[0].title).toBe('Thanh toán thất bại');
    });

    it('4. FAILED có refund: "Thất bại - đã tạo lệnh hoàn"', async () => {
      await insertOrder(testOrderFailedWithRf, 'FAILED', 1);
      const nowIso = clock.nowIso();
      await knex('refunds').insert({
        refund_id: 'RF_NOTIF_TEST',
        order_id: testOrderFailedWithRf,
        gateway_txn_id: 'GW_NOTIF_TEST',
        amount: 50000,
        type: 'AUTO',
        status: 'CHECKING',
        detected_at: nowIso,
        send_due_at: nowIso,
        checks_json: JSON.stringify({ a: true, b: true, c: true, d: true, e: true }),
      });

      const order = await knex('orders').where({ order_id: testOrderFailedWithRf }).first();

      await knex.transaction(async (trx) => {
        return await notify(trx, order, 'FAILED');
      });

      const rows = await knex('notifications').where({ order_id: testOrderFailedWithRf });
      expect(rows).toHaveLength(3);
      expect(rows[0].title).toBe('Thất bại - đã tạo lệnh hoàn');
      expect(rows[0].body).toContain('50.000 đ');
    });

    it('5. REFUND_SENT: "Đã gửi lệnh hoàn tiền"', async () => {
      await insertOrder(testOrderRefundSent, 'REFUND_PENDING', 1);
      const order = await knex('orders').where({ order_id: testOrderRefundSent }).first();

      await knex.transaction(async (trx) => {
        return await notify(trx, order, 'REFUND_SENT');
      });

      const rows = await knex('notifications').where({ order_id: testOrderRefundSent });
      expect(rows).toHaveLength(3);
      expect(rows[0].title).toBe('Đã gửi lệnh hoàn tiền');
    });

    it('6. REFUND_COMPLETED: "Hoàn tiền thành công"', async () => {
      await insertOrder(testOrderRefundDone, 'REFUNDED', 1);
      const order = await knex('orders').where({ order_id: testOrderRefundDone }).first();

      await knex.transaction(async (trx) => {
        return await notify(trx, order, 'REFUND_COMPLETED');
      });

      const rows = await knex('notifications').where({ order_id: testOrderRefundDone });
      expect(rows).toHaveLength(3);
      expect(rows[0].title).toBe('Hoàn tiền thành công');
    });
  });

  describe('Routes: GET /notifications & PATCH /notifications/:id/read', () => {
    it('GET /notifications: yêu cầu đăng nhập (401 nếu thiếu auth)', async () => {
      const res = await request(app).get('/api/v1/notifications');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    it('GET /notifications: lấy danh sách thông báo của người dùng hiện tại', async () => {
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Cookie', user1Cookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it('PATCH /notifications/:id/read: đánh dấu đã đọc thành công', async () => {
      const notif = await knex('notifications').where({ user_id: 1, read_at: null }).first();
      expect(notif).toBeDefined();

      const res = await request(app)
        .patch(`/api/v1/notifications/${notif.id}/read`)
        .set('Cookie', user1Cookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.read_at).toBeDefined();

      const updated = await knex('notifications').where({ id: notif.id }).first();
      expect(updated.read_at).not.toBeNull();
    });

    it('PATCH /notifications/:id/read: người dùng khác không được sửa thông báo của người khác -> 404', async () => {
      const notif = await knex('notifications').where({ user_id: 1 }).first();
      expect(notif).toBeDefined();

      const res = await request(app)
        .patch(`/api/v1/notifications/${notif.id}/read`)
        .set('Cookie', user2Cookie);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
