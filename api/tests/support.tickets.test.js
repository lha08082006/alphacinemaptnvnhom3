'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');
const clock = require('../src/lib/clock');
const supportRouter = require('../src/routes/support');

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
      .post('/api/v1/admin/auth/login')
      .send({ email: 'cskh@betacinemas.vn', password: 'Password@123' });
    cskhCookie = resCskh.headers['set-cookie'];

    // 3. Đăng nhập Manager
    const resMgr = await request(app)
      .post('/api/v1/admin/auth/login')
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

    it('4. Đơn có refund: trả hasRefund = true kèm thông tin refund chi tiết + friendlyStatus = đã tạo lệnh hoàn', async () => {
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
      expect(res.body.data.friendlyStatus).toBe('đã tạo lệnh hoàn');
      expect(res.body.data.customerStatus).toBe('đã tạo lệnh hoàn');
      expect(res.body.data.refund).toBeDefined();
      expect(res.body.data.refund.refundId).toBe('RF_LOOKUP_TEST');
      expect(res.body.data.refund.status).toBe('CHECKING');
      expect(res.body.data.refund.statusText).toContain('kiểm tra');
    });

    it('4b. Đơn PAID: friendlyStatus = đã có vé', async () => {
      const res = await request(app)
        .post('/api/v1/support/lookup')
        .send({
          orderId: testOrderLookup,
          email: 'tracuu@gmail.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.friendlyStatus).toBe('đã có vé');
      expect(res.body.data.customerStatus).toBe('đã có vé');
    });

    it('4c. Đơn PENDING_VERIFY: friendlyStatus = đang xác minh', async () => {
      const testPvOrder = 'BC_LOOKUP_PV';
      const nowIso = clock.nowIso();
      await knex('orders').insert({
        order_id: testPvOrder,
        user_id: 1,
        showtime_id: 1,
        status: 'PENDING_VERIFY',
        amount_tickets: 60000,
        amount_combos: 0,
        amount_total: 60000,
        customer_name: 'Khách Đang Xác Minh',
        customer_phone: '0977888999',
        customer_email: 'xacminh@gmail.com',
        hold_expires_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      });

      const res = await request(app)
        .post('/api/v1/support/lookup')
        .send({
          orderId: testPvOrder,
          email: 'xacminh@gmail.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.friendlyStatus).toBe('đang xác minh');

      await knex('orders').where({ order_id: testPvOrder }).del();
    });

    it('4d. Đơn hoàn tất REFUNDED: friendlyStatus = đã hoàn xong', async () => {
      const testDoneRfOrder = 'BC_LOOKUP_DONE_RF';
      const nowIso = clock.nowIso();
      await knex('orders').insert({
        order_id: testDoneRfOrder,
        user_id: 1,
        showtime_id: 1,
        status: 'REFUNDED',
        amount_tickets: 70000,
        amount_combos: 0,
        amount_total: 70000,
        customer_name: 'Khách Hoàn Xong',
        customer_phone: '0933444555',
        customer_email: 'hoanxong@gmail.com',
        hold_expires_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      });

      const res = await request(app)
        .post('/api/v1/support/lookup')
        .send({
          orderId: testDoneRfOrder,
          phone: '0933444555',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.friendlyStatus).toBe('đã hoàn xong');

      await knex('orders').where({ order_id: testDoneRfOrder }).del();
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

  describe('Customer Support Tickets: POST /support/tickets & GET /support/tickets/:code', () => {
    const testOrderWithin60 = 'BC_TICKET_IN_60';
    const testOrderPast60 = 'BC_TICKET_OUT_60';
    let createdTicketIn60Id = null;
    let createdTicketPast60Id = null;

    beforeAll(async () => {
      if (supportRouter._resetLookupRateLimits) {
        supportRouter._resetLookupRateLimits();
      }

      const nowMs = clock.nowMs();
      const within60Iso = new Date(nowMs - 20 * 60 * 1000).toISOString(); // 20 phút trước
      const past60Iso = new Date(nowMs - 120 * 60 * 1000).toISOString(); // 120 phút trước (2 tiếng)

      // Xoá sạch tàn dư nếu có trước khi insert
      const existingTickets = await knex('support_tickets')
        .whereIn('order_id', [testOrderWithin60, testOrderPast60])
        .select('ticket_id');
      const exIds = existingTickets.map((t) => t.ticket_id);
      if (exIds.length > 0) {
        await knex('support_ticket_notes').whereIn('ticket_id', exIds).del();
        await knex('support_tickets').whereIn('ticket_id', exIds).del();
      }
      await knex('payment_attempts').whereIn('order_id', [testOrderWithin60, testOrderPast60]).del();
      await knex('orders').whereIn('order_id', [testOrderWithin60, testOrderPast60]).del();

      // Đơn 1: Mới thanh toán 20 phút trước (trong hạn 60 phút)
      await knex('orders').insert({
        order_id: testOrderWithin60,
        user_id: 1,
        showtime_id: 1,
        status: 'PAID',
        amount_tickets: 80000,
        amount_combos: 0,
        amount_total: 80000,
        customer_name: 'Khách Trong Hạn',
        customer_phone: '0901111222',
        customer_email: 'tronghan@gmail.com',
        hold_expires_at: within60Iso,
        created_at: within60Iso,
        updated_at: within60Iso,
      });
      await knex('payment_attempts').insert({
        attempt_id: 'ATT_' + testOrderWithin60,
        order_id: testOrderWithin60,
        gateway_txn_id: 'GW_IN_60',
        method: 'ATM',
        amount: 80000,
        status: 'SUCCESS',
        idempotency_key: 'idemp_' + testOrderWithin60,
        created_at: within60Iso,
      });

      // Đơn 2: Thanh toán 2 giờ trước (ngoài hạn 60 phút)
      await knex('orders').insert({
        order_id: testOrderPast60,
        user_id: 1,
        showtime_id: 1,
        status: 'PAID',
        amount_tickets: 90000,
        amount_combos: 0,
        amount_total: 90000,
        customer_name: 'Khách Quá Hạn',
        customer_phone: '0903333444',
        customer_email: 'quahan@gmail.com',
        hold_expires_at: past60Iso,
        created_at: past60Iso,
        updated_at: past60Iso,
      });
      await knex('payment_attempts').insert({
        attempt_id: 'ATT_' + testOrderPast60,
        order_id: testOrderPast60,
        gateway_txn_id: 'GW_OUT_60',
        method: 'ATM',
        amount: 90000,
        status: 'SUCCESS',
        idempotency_key: 'idemp_' + testOrderPast60,
        created_at: past60Iso,
      });
    });

    afterAll(async () => {
      const ticketsToDelete = await knex('support_tickets')
        .whereIn('order_id', [testOrderWithin60, testOrderPast60])
        .select('ticket_id');
      const ticketIds = ticketsToDelete.map((t) => t.ticket_id);
      if (ticketIds.length > 0) {
        await knex('support_ticket_notes').whereIn('ticket_id', ticketIds).del();
        await knex('support_tickets').whereIn('ticket_id', ticketIds).del();
      }
      if (createdTicketIn60Id) {
        await knex('support_ticket_notes').where({ ticket_id: createdTicketIn60Id }).del();
        await knex('support_tickets').where({ ticket_id: createdTicketIn60Id }).del();
      }
      if (createdTicketPast60Id) {
        await knex('support_ticket_notes').where({ ticket_id: createdTicketPast60Id }).del();
        await knex('support_tickets').where({ ticket_id: createdTicketPast60Id }).del();
      }
      await knex('payment_attempts').whereIn('order_id', [testOrderWithin60, testOrderPast60]).del();
      await knex('orders').whereIn('order_id', [testOrderWithin60, testOrderPast60]).del();
    });

    it('11. Tạo ticket trong hạn 60 phút -> status = NEW, có sla_due_at (24h)', async () => {
      const res = await request(app)
        .post('/api/v1/support/tickets')
        .send({
          orderId: testOrderWithin60,
          contact: 'tronghan@gmail.com',
          issueType: 'trừ tiền chưa có vé',
          description: 'Tôi đã bị trừ 80.000đ từ tài khoản Vietcombank nhưng hệ thống báo lỗi không có vé.',
          receiptImage: 'https://cdn.betacinemas.vn/receipts/test_bill.png',
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.ticketId).toBeDefined();
      expect(res.body.data.ticketId.startsWith('CS')).toBe(true);
      expect(res.body.data.status).toBe('NEW');
      expect(res.body.data.statusLabel).toBe('Mới');
      expect(res.body.data.isExpired60Min).toBe(false);
      expect(res.body.data.slaDueAt).toBeDefined();

      createdTicketIn60Id = res.body.data.ticketId;

      // Kiểm tra DB
      const ticketDb = await knex('support_tickets').where({ ticket_id: createdTicketIn60Id }).first();
      expect(ticketDb).toBeDefined();
      expect(ticketDb.status).toBe('NEW');
      expect(ticketDb.issue_type).toBe('DEBITED_NO_TICKET');
      expect(ticketDb.description).toContain('Tôi đã bị trừ 80.000đ');

      // Kiểm tra notes
      const notes = await knex('support_ticket_notes').where({ ticket_id: createdTicketIn60Id });
      expect(notes.length).toBeGreaterThanOrEqual(1);
      expect(notes[0].note).toContain('Trừ tiền chưa có vé');
    });

    it('12. Tạo ticket ngoài hạn 60 phút sau thanh toán -> xử lý theo quy định: status = REJECTED (Từ chối)', async () => {
      const res = await request(app)
        .post('/api/v1/support/tickets')
        .send({
          orderId: testOrderPast60,
          contact: 'quahan@gmail.com',
          issueType: 'DOUBLE_PAYMENT',
          description: 'Tôi lỡ thanh toán 2 lần cho đơn này 2 tiếng trước, cần hoàn lại 1 lượt.',
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.status).toBe('REJECTED');
      expect(res.body.data.statusLabel).toBe('Từ chối');
      expect(res.body.data.isExpired60Min).toBe(true);
      expect(res.body.data.slaDueAt).toBeNull();
      expect(res.body.data.resolution).toContain('60 phút');

      createdTicketPast60Id = res.body.data.ticketId;

      // Kiểm tra DB
      const ticketDb = await knex('support_tickets').where({ ticket_id: createdTicketPast60Id }).first();
      expect(ticketDb).toBeDefined();
      expect(ticketDb.status).toBe('REJECTED');
      expect(ticketDb.resolution).toContain('60 phút');

      // Kiểm tra ghi chú tự động từ chối
      const notes = await knex('support_ticket_notes').where({ ticket_id: createdTicketPast60Id });
      const systemNote = notes.find((n) => n.note.includes('[HỆ THỐNG]'));
      expect(systemNote).toBeDefined();
      expect(systemNote.note).toContain('60 phút');
    });

    it('13. Tạo ticket với loại file không phải ảnh (.pdf) -> bị từ chối 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/support/tickets')
        .send({
          orderId: testOrderWithin60,
          contact: 'tronghan@gmail.com',
          issueType: 'OTHER',
          description: 'Tôi gửi biên nhận qua tệp pdf',
          receiptImage: {
            filename: 'biennhan.pdf',
            mimeType: 'application/pdf',
            size: 2048,
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Chỉ chấp nhận JPG, PNG, WEBP');
    });

    it('14. Tạo ticket với dung lượng ảnh vượt 5MB -> bị từ chối 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/support/tickets')
        .send({
          orderId: testOrderWithin60,
          contact: 'tronghan@gmail.com',
          issueType: 'OTHER',
          description: 'Ảnh quá nặng',
          receiptImage: {
            filename: 'heavy_photo.png',
            mimeType: 'image/png',
            size: 6 * 1024 * 1024, // 6MB > 5MB
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('tối đa 5MB');
    });

    it('15. Tra cứu ticket bằng mã ticket + email khớp -> trả thông tin thành công, KHÔNG lộ nội bộ', async () => {
      const res = await request(app)
        .get(`/api/v1/support/tickets/${createdTicketIn60Id}?email=tronghan@gmail.com`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.ticketId).toBe(createdTicketIn60Id);
      expect(res.body.data.status).toBe('NEW');
      expect(res.body.data.statusLabel).toBe('Mới');
      expect(res.body.data.description).toContain('Tôi đã bị trừ 80.000đ');

      // Đảm bảo không lộ thông tin nội bộ
      expect(res.body.data.assigned_to).toBeUndefined();
      expect(res.body.data.assignedTo).toBeUndefined();
      expect(res.body.data.notes).toBeUndefined();
      expect(res.body.data.source).toBeUndefined();
    });

    it('16. Tra cứu ticket bằng mã ticket bị từ chối (quá hạn) -> trả status = REJECTED + lý do giải quyết', async () => {
      const res = await request(app)
        .get(`/api/v1/support/tickets/${createdTicketPast60Id}?phone=0903333444`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.status).toBe('REJECTED');
      expect(res.body.data.statusLabel).toBe('Từ chối');
      expect(res.body.data.resolution).toContain('60 phút');
    });

    it('17. Tra cứu sai thông tin: mã ticket không tồn tại -> trả cùng một lỗi chung NOT_FOUND 404', async () => {
      const res = await request(app)
        .get('/api/v1/support/tickets/CS_KHONG_TON_TAI?email=tronghan@gmail.com');

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBe(
        'Không tìm thấy phiếu hỗ trợ phù hợp với thông tin cung cấp. Vui lòng kiểm tra lại mã phiếu và email/số điện thoại.'
      );
    });

    it('18. Tra cứu sai thông tin: mã ticket đúng nhưng email/SĐT sai -> trả CÙNG một lỗi chung NOT_FOUND 404', async () => {
      const res = await request(app)
        .get(`/api/v1/support/tickets/${createdTicketIn60Id}?email=email_sai@gmail.com`);

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
      // Thông điệp lỗi hoàn toàn trùng khớp với trường hợp không tồn tại để chống dò quét
      expect(res.body.error.message).toBe(
        'Không tìm thấy phiếu hỗ trợ phù hợp với thông tin cung cấp. Vui lòng kiểm tra lại mã phiếu và email/số điện thoại.'
      );
    });
  });
});
