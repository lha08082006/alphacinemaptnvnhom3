'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');
const clock = require('../src/lib/clock');

describe('Step 11: Admin Orders & Reconcile Verification', () => {
  let app;
  let managerCookie;
  let itCookie;
  let customerCookie;

  const testOrderId1 = 'BC_TEST_ORD_01';
  const testOrderId2 = 'BC_TEST_ORD_02';
  const testTxnId1 = 'GW_TEST_TXN_01';

  async function cleanup() {
    await knex('audit_log').where({ action: 'MANUAL_RECON_RUN' }).del();
    await knex('order_status_history').whereIn('order_id', [testOrderId1, testOrderId2]).del();
    await knex('payment_attempts').whereIn('order_id', [testOrderId1, testOrderId2]).del();
    await knex('order_seats').whereIn('order_id', [testOrderId1, testOrderId2]).del();
    await knex('orders').whereIn('order_id', [testOrderId1, testOrderId2]).del();
  }

  beforeAll(async () => {
    app = createApp();
    await cleanup();

    // Login Manager & Customer
    const resMgr = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'manager@betacinemas.vn', password: 'Password@123' });
    managerCookie = resMgr.headers['set-cookie'];

    const resIt = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'it@betacinemas.vn', password: 'Password@123' });
    itCookie = resIt.headers['set-cookie'];

    const resCust = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang@gmail.com', password: 'Password@123' });
    customerCookie = resCust.headers['set-cookie'];

    const nowIso = clock.nowIso();

    // Tạo đơn 1: PAID
    await knex('orders').insert({
      order_id: testOrderId1,
      user_id: 1,
      showtime_id: 1,
      status: 'PAID',
      amount_tickets: 90000,
      amount_combos: 0,
      amount_total: 90000,
      customer_name: 'Nguyễn Văn Test',
      customer_phone: '0912345678',
      customer_email: 'testuser1@betacinemas.vn',
      hold_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      paid_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    });

    const existingSeat = await knex('seats').first();
    const seatId = existingSeat ? existingSeat.id : 1;

    await knex('order_seats').insert({
      order_id: testOrderId1,
      seat_id: seatId,
      seat_type: 'STANDARD',
      price: 90000,
    });

    await knex('payment_attempts').insert({
      attempt_id: 'ATT_' + testOrderId1,
      order_id: testOrderId1,
      gateway_txn_id: testTxnId1,
      method: 'ATM',
      amount: 90000,
      status: 'SUCCESS',
      idempotency_key: 'idemp_' + testOrderId1,
      created_at: nowIso,
    });

    // Tạo lịch sử trạng thái cho đơn 1: HOLDING -> AWAITING_PAYMENT -> PAID
    await knex('order_status_history').insert([
      {
        order_id: testOrderId1,
        from_status: null,
        to_status: 'HOLDING',
        actor_type: 'USER',
        at: new Date(Date.now() - 300000).toISOString(),
        reason: 'Khách hàng giữ ghế',
      },
      {
        order_id: testOrderId1,
        from_status: 'HOLDING',
        to_status: 'AWAITING_PAYMENT',
        actor_type: 'USER',
        at: new Date(Date.now() - 200000).toISOString(),
        reason: 'Khởi tạo thanh toán cổng',
      },
      {
        order_id: testOrderId1,
        from_status: 'AWAITING_PAYMENT',
        to_status: 'PAID',
        actor_type: 'GATEWAY',
        at: nowIso,
        reason: 'Cổng thanh toán xác nhận thành công',
      },
    ]);

    // Tạo đơn 2: PENDING_VERIFY
    await knex('orders').insert({
      order_id: testOrderId2,
      user_id: 1,
      showtime_id: 1,
      status: 'PENDING_VERIFY',
      amount_tickets: 100000,
      amount_combos: 0,
      amount_total: 100000,
      customer_name: 'Trần Thị Demo',
      customer_phone: '0987654321',
      customer_email: 'demo2@betacinemas.vn',
      hold_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      created_at: nowIso,
      updated_at: nowIso,
    });

    await knex('order_status_history').insert([
      {
        order_id: testOrderId2,
        from_status: null,
        to_status: 'HOLDING',
        actor_type: 'USER',
        at: nowIso,
        reason: 'Khách hàng giữ ghế',
      },
      {
        order_id: testOrderId2,
        from_status: 'HOLDING',
        to_status: 'PENDING_VERIFY',
        actor_type: 'SYSTEM',
        at: nowIso,
        reason: 'Đang xác minh giao dịch cổng',
      },
    ]);
  });

  afterAll(async () => {
    await cleanup();
    await knex.destroy();
  });

  describe('1. GET /api/v1/admin/orders - Tìm kiếm & Phân trang', () => {
    it('Chặn truy cập khách hàng -> 403', async () => {
      const res = await request(app)
        .get('/api/v1/admin/orders')
        .set('Cookie', customerCookie);
      expect(res.status).toBe(403);
    });

    it('Tìm kiếm theo mã đơn hàng', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/orders?q=${testOrderId1}`)
        .set('Cookie', managerCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      const found = res.body.data.items.find((o) => o.order_id === testOrderId1);
      expect(found).toBeDefined();
      expect(found.customer_name).toBe('Nguyễn Văn Test');
    });

    it('Tìm kiếm theo email khách hàng', async () => {
      const res = await request(app)
        .get('/api/v1/admin/orders?q=demo2@betacinemas.vn')
        .set('Cookie', managerCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0].order_id).toBe(testOrderId2);
    });

    it('Tìm kiếm theo số điện thoại khách hàng', async () => {
      const res = await request(app)
        .get('/api/v1/admin/orders?q=0912345678')
        .set('Cookie', managerCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0].order_id).toBe(testOrderId1);
    });

    it('Lọc theo trạng thái và phân trang', async () => {
      const res = await request(app)
        .get('/api/v1/admin/orders?status=PAID&page=1&limit=5')
        .set('Cookie', managerCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('pagination');
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(5);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);

      res.body.data.items.forEach((o) => {
        expect(o.status).toBe('PAID');
      });
    });
  });

  describe('2. GET /api/v1/admin/orders/:id - Chi tiết & Timeline trạng thái', () => {
    it('Lấy đầy đủ thông tin chi tiết, ghế, thanh toán và timeline lịch sử', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/orders/${testOrderId1}`)
        .set('Cookie', managerCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      const data = res.body.data;

      expect(data.order_id).toBe(testOrderId1);
      expect(data.customer_name).toBe('Nguyễn Văn Test');
      expect(data.amount_total).toBe(90000);

      // Ghế
      expect(Array.isArray(data.seats)).toBe(true);
      expect(data.seats.length).toBe(1);
      expect(data.seats[0]).toHaveProperty('seat_code');

      // Thanh toán
      expect(Array.isArray(data.payments)).toBe(true);
      expect(data.payments.length).toBe(1);
      expect(data.payments[0].gateway_txn_id).toBe(testTxnId1);

      // Timeline lịch sử trạng thái
      expect(Array.isArray(data.timeline)).toBe(true);
      expect(data.timeline.length).toBe(3);
      expect(data.timeline[0].to_status).toBe('HOLDING');
      expect(data.timeline[1].to_status).toBe('AWAITING_PAYMENT');
      expect(data.timeline[2].to_status).toBe('PAID');
    });

    it('Đơn hàng không tồn tại -> 404 NOT_FOUND', async () => {
      const res = await request(app)
        .get('/api/v1/admin/orders/BC_KHONG_TON_TAI')
        .set('Cookie', managerCookie);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('3. POST /api/v1/admin/recon/run & audit_log', () => {
    it('Chạy đối soát thủ công ghi nhận audit_log', async () => {
      const reconService = require('../src/services/reconService');
      reconService.setGatewayAdapter({
        queryTransaction: jest.fn().mockResolvedValue({
          vnp_ResponseCode: '00',
          vnp_TransactionStatus: '00',
          vnp_Amount: '10000000',
        }),
      });

      const res = await request(app)
        .post('/api/v1/admin/recon/run')
        .set('Cookie', itCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.trigger).toBe('MANUAL');
      expect(res.body.data.status).toBe('DONE');

      // Kiểm tra bản ghi audit_log tương ứng
      const log = await knex('audit_log')
        .where({ action: 'MANUAL_RECON_RUN', entity: 'RECON_RUN' })
        .orderBy('id', 'desc')
        .first();

      expect(log).toBeDefined();
      expect(log.actor_type).toBe('STAFF');
      expect(log.entity_id).toBe(String(res.body.data.runId));
      const after = JSON.parse(log.after_json);
      expect(after.trigger).toBe('MANUAL');
      expect(after.status).toBe('DONE');
    });
  });

  describe('4. GET /api/v1/admin/recon/runs - Danh sách lượt chạy có phân trang', () => {
    it('Trả về danh sách lượt chạy và thông tin pagination', async () => {
      const res = await request(app)
        .get('/api/v1/admin/recon/runs?page=1&limit=5')
        .set('Cookie', managerCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(5);
    });

    it('Lọc theo trigger MANUAL', async () => {
      const res = await request(app)
        .get('/api/v1/admin/recon/runs?trigger=MANUAL')
        .set('Cookie', managerCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      res.body.data.items.forEach((run) => {
        expect(run.trigger).toBe('MANUAL');
      });
    });
  });

  describe('5. GET /api/v1/admin/recon/items - Danh sách từng dòng lệch', () => {
    it('Trả về các dòng đối soát kèm tính toán chênh lệch (difference) và pagination', async () => {
      const res = await request(app)
        .get('/api/v1/admin/recon/items?page=1&limit=10')
        .set('Cookie', managerCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data.items)).toBe(true);

      if (res.body.data.items.length > 0) {
        const item = res.body.data.items[0];
        expect(item).toHaveProperty('order_id');
        expect(item).toHaveProperty('amount_beta');
        expect(item).toHaveProperty('amount_gateway');
        expect(item).toHaveProperty('difference');
        expect(item.difference).toBe(item.amount_gateway - item.amount_beta);
      }
    });
  });
});
