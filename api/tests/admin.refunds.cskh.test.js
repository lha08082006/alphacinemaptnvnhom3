'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');
const clock = require('../src/lib/clock');

describe('Step 11: Admin Refunds & CSKH Ticket Management', () => {
  let app;
  const cookies = {
    CUSTOMER: null,
    IT: null,
    ACCOUNTANT: null,
    CSKH: null,
    MANAGER: null,
  };

  const testOrderId = 'BC_TEST_REF_CSKH_01';
  const testRefundOverdueId = 'RF_TEST_SLA_OVERDUE';
  const testRefundOkId = 'RF_TEST_SLA_OK';
  const testTicketId = 'TK_TEST_FLOW_01';
  let customerUserId = null;

  beforeAll(async () => {
    app = createApp();

    // Đăng nhập khách hàng
    const resCust = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang@gmail.com', password: 'Password@123' });
    cookies.CUSTOMER = resCust.headers['set-cookie'];

    // Lấy user_id của khách hàng
    const userCust = await knex('users').where({ email: 'khachhang@gmail.com' }).first();
    customerUserId = userCust?.id || 1;

    // Đăng nhập 4 vai trò nhân viên
    const resIt = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'it@betacinemas.vn', password: 'Password@123' });
    cookies.IT = resIt.headers['set-cookie'];

    const resAcct = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'ketoan@betacinemas.vn', password: 'Password@123' });
    cookies.ACCOUNTANT = resAcct.headers['set-cookie'];

    const resCskh = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'cskh@betacinemas.vn', password: 'Password@123' });
    cookies.CSKH = resCskh.headers['set-cookie'];

    const resMgr = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'manager@betacinemas.vn', password: 'Password@123' });
    cookies.MANAGER = resMgr.headers['set-cookie'];

    const nowMs = Date.now();
    const nowIso = clock.nowIso();

    // 1. Dọn dẹp dữ liệu test cũ nếu có
    await knex('audit_log').whereIn('entity_id', [testRefundOverdueId, testRefundOkId, testTicketId]).del();
    await knex('support_ticket_notes').where({ ticket_id: testTicketId }).del();
    await knex('support_tickets').where({ ticket_id: testTicketId }).del();
    await knex('refunds').whereIn('refund_id', [testRefundOverdueId, testRefundOkId]).del();
    await knex('orders').where({ order_id: testOrderId }).del();

    // 2. Tạo đơn hàng mẫu
    await knex('orders').insert({
      order_id: testOrderId,
      user_id: customerUserId,
      showtime_id: 1,
      status: 'REFUND_PENDING',
      amount_tickets: 180000,
      amount_combos: 0,
      amount_total: 180000,
      customer_name: 'Nguyễn Văn Khách',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // 3. Tạo lệnh hoàn tiền quá hạn SLA (send_due_at trong quá khứ 3 tiếng)
    const overdueTime = new Date(nowMs - 3 * 3600 * 1000).toISOString();
    await knex('refunds').insert({
      refund_id: testRefundOverdueId,
      order_id: testOrderId,
      gateway_txn_id: 'GW_TXN_TEST_OVERDUE',
      amount: 90000,
      status: 'CHECKING',
      type: 'MANUAL',
      detected_at: overdueTime,
      send_due_at: overdueTime,
      sla_breached: 0,
      checks_json: JSON.stringify({ manual: true }),
    });

    // 4. Tạo lệnh hoàn tiền còn hạn SLA (send_due_at tương lai 20 tiếng)
    const futureTime = new Date(nowMs + 20 * 3600 * 1000).toISOString();
    await knex('refunds').insert({
      refund_id: testRefundOkId,
      order_id: testOrderId,
      gateway_txn_id: 'GW_TXN_TEST_OK',
      amount: 90000,
      status: 'CHECKING',
      type: 'MANUAL',
      detected_at: nowIso,
      send_due_at: futureTime,
      sla_breached: 0,
      checks_json: JSON.stringify({ manual: true }),
    });

    // 5. Tạo support ticket mẫu ở trạng thái NEW
    await knex('support_tickets').insert({
      ticket_id: testTicketId,
      order_id: testOrderId,
      user_id: customerUserId,
      contact: 'khachhang@gmail.com',
      source: 'CUSTOMER',
      status: 'NEW',
      issue_type: 'PAYMENT_DEBITED_NO_TICKET',
      description: 'Tôi đã thanh toán thành công nhưng chưa nhận được mã vé',
      created_at: nowIso,
      sla_due_at: futureTime,
    });
  });

  afterAll(async () => {
    // Dọn dẹp dữ liệu test
    await knex('audit_log').whereIn('entity_id', [testRefundOverdueId, testRefundOkId, testTicketId]).del();
    await knex('support_ticket_notes').where({ ticket_id: testTicketId }).del();
    await knex('support_tickets').where({ ticket_id: testTicketId }).del();
    await knex('refunds').whereIn('refund_id', [testRefundOverdueId, testRefundOkId]).del();
    await knex('orders').where({ order_id: testOrderId }).del();
    await knex.destroy();
  });

  describe('PHẦN 1: Quản lý Hoàn tiền (GET /admin/refunds & POST /admin/refunds/:id/approve)', () => {
    it('1.1. Phân quyền: Khách hàng và IT bị chặn (403), Kế toán và CSKH được phép (200)', async () => {
      const resCust = await request(app)
        .get('/api/v1/admin/refunds')
        .set('Cookie', cookies.CUSTOMER);
      expect(resCust.status).toBe(403);

      const resIt = await request(app)
        .get('/api/v1/admin/refunds')
        .set('Cookie', cookies.IT);
      expect(resIt.status).toBe(403);

      const resAcct = await request(app)
        .get('/api/v1/admin/refunds')
        .set('Cookie', cookies.ACCOUNTANT);
      expect(resAcct.status).toBe(200);

      const resCskh = await request(app)
        .get('/api/v1/admin/refunds')
        .set('Cookie', cookies.CSKH);
      expect(resCskh.status).toBe(200);
    });

    it('1.2. Theo dõi SLA 24 giờ: phát hiện lệnh hoàn quá hạn và đánh dấu sla_breached', async () => {
      const res = await request(app)
        .get('/api/v1/admin/refunds')
        .set('Cookie', cookies.ACCOUNTANT);

      expect(res.status).toBe(200);
      const items = res.body.data;
      expect(Array.isArray(items)).toBe(true);

      const overdueRefund = items.find((r) => r.refund_id === testRefundOverdueId);
      expect(overdueRefund).toBeDefined();
      expect(overdueRefund.is_overdue).toBe(true);
      expect(overdueRefund.sla_breached).toBeTruthy();
      expect(overdueRefund.remaining_sla_minutes).toBeLessThan(0);

      const okRefund = items.find((r) => r.refund_id === testRefundOkId);
      expect(okRefund).toBeDefined();
      expect(okRefund.is_overdue).toBe(false);
      expect(okRefund.remaining_sla_minutes).toBeGreaterThan(0);

      // Kiểm tra CSDL đã được đồng bộ sla_breached = 1
      const dbRow = await knex('refunds').where({ refund_id: testRefundOverdueId }).first();
      expect(Boolean(dbRow.sla_breached)).toBe(true);
    });

    it('1.3. Lọc danh sách quá hạn (?overdue=true) và hỗ trợ phân trang', async () => {
      // Lọc overdue=true
      const resOverdue = await request(app)
        .get('/api/v1/admin/refunds?overdue=true')
        .set('Cookie', cookies.ACCOUNTANT);

      expect(resOverdue.status).toBe(200);
      const overdueList = resOverdue.body.data;
      expect(overdueList.every((r) => r.is_overdue === true)).toBe(true);
      expect(overdueList.some((r) => r.refund_id === testRefundOverdueId)).toBe(true);
      expect(overdueList.some((r) => r.refund_id === testRefundOkId)).toBe(false);

      // Phân trang
      const resPage = await request(app)
        .get('/api/v1/admin/refunds?page=1&limit=2')
        .set('Cookie', cookies.ACCOUNTANT);

      expect(resPage.status).toBe(200);
      expect(resPage.body.data).toHaveProperty('items');
      expect(resPage.body.data).toHaveProperty('pagination');
      expect(resPage.body.data.pagination.page).toBe(1);
      expect(resPage.body.data.pagination.limit).toBe(2);
    });

    it('1.4. Duyệt hoàn tiền: cập nhật trạng thái và ghi audit_log (trước/sau)', async () => {
      // Mock gateway adapter để hoàn tiền thành công
      const refundService = require('../src/services/refundService');
      refundService.setGatewayAdapter({
        refund: jest.fn().mockResolvedValue({
          vnp_ResponseCode: '00',
          vnp_ResponseId: 'RF_APPROVE_GW_001',
        }),
      });

      // IT không có quyền duyệt -> 403
      const resIt = await request(app)
        .post(`/api/v1/admin/refunds/${testRefundOverdueId}/approve`)
        .set('Cookie', cookies.IT);
      expect(resIt.status).toBe(403);

      // Kế toán phê duyệt lệnh hoàn tiền
      const resApprove = await request(app)
        .post(`/api/v1/admin/refunds/${testRefundOverdueId}/approve`)
        .set('Cookie', cookies.ACCOUNTANT);

      expect(resApprove.status).toBe(200);
      expect(resApprove.body.ok).toBe(true);
      expect(resApprove.body.data.status).toBe('COMPLETED');
      expect(resApprove.body.data.completed_at).toBeDefined();

      // Kiểm tra CSDL refunds
      const updatedRefund = await knex('refunds').where({ refund_id: testRefundOverdueId }).first();
      expect(updatedRefund.status).toBe('COMPLETED');

      // Kiểm tra audit_log ghi nhận trước/sau (before_json & after_json)
      const auditLog = await knex('audit_log')
        .where({
          entity: 'REFUND',
          entity_id: testRefundOverdueId,
          action: 'REFUND_APPROVE',
        })
        .first();

      expect(auditLog).toBeDefined();
      expect(auditLog.actor_type).toBe('STAFF');

      const beforeData = JSON.parse(auditLog.before_json);
      const afterData = JSON.parse(auditLog.after_json);

      expect(beforeData.refund_id).toBe(testRefundOverdueId);
      expect(beforeData.status).toBe('CHECKING');
      expect(afterData.refund_id).toBe(testRefundOverdueId);
      expect(afterData.status).toBe('COMPLETED');
      expect(afterData.completed_at).toBeDefined();
    });
  });

  describe('PHẦN 2: Trang CSKH Ticket (GET, PATCH & Luồng chuyển trạng thái)', () => {
    it('2.1. Phân quyền: IT và Kế toán bị chặn (403), CSKH và Quản lý được phép (200)', async () => {
      const resIt = await request(app)
        .get('/api/v1/admin/tickets')
        .set('Cookie', cookies.IT);
      expect(resIt.status).toBe(403);

      const resAcct = await request(app)
        .get('/api/v1/admin/tickets')
        .set('Cookie', cookies.ACCOUNTANT);
      expect(resAcct.status).toBe(403);

      const resCskh = await request(app)
        .get('/api/v1/admin/tickets')
        .set('Cookie', cookies.CSKH);
      expect(resCskh.status).toBe(200);

      const resMgr = await request(app)
        .get('/api/v1/admin/tickets')
        .set('Cookie', cookies.MANAGER);
      expect(resMgr.status).toBe(200);
    });

    it('2.2. GET /admin/tickets trả về liên kết đơn hàng và lệnh hoàn tiền', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/tickets?orderId=${testOrderId}`)
        .set('Cookie', cookies.CSKH);

      expect(res.status).toBe(200);
      const ticket = res.body.data.find((t) => t.ticket_id === testTicketId);
      expect(ticket).toBeDefined();
      expect(ticket.order_id).toBe(testOrderId);
      expect(ticket.order_status).toBe('REFUNDED');
      expect(ticket.amount_total).toBe(180000);
      expect(ticket.issue_type).toBe('PAYMENT_DEBITED_NO_TICKET');
    });

    it('2.3. GET /admin/tickets/:id trả về chi tiết ticket và danh sách ghi chú nội bộ', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/tickets/${testTicketId}`)
        .set('Cookie', cookies.CSKH);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveProperty('ticket');
      expect(res.body.data).toHaveProperty('notes');
      expect(res.body.data.ticket.ticket_id).toBe(testTicketId);
      expect(Array.isArray(res.body.data.notes)).toBe(true);
    });

    it('2.4. Ghi chú nội bộ: PATCH /admin/tickets/:id chỉ lưu note mà không đổi status', async () => {
      const noteContent = 'CSKH ghi chú: Đang rà soát lịch sử cổng thanh toán';
      const res = await request(app)
        .patch(`/api/v1/admin/tickets/${testTicketId}`)
        .set('Cookie', cookies.CSKH)
        .send({ note: noteContent });

      expect(res.status).toBe(200);
      expect(res.body.data.ticket.status).toBe('NEW'); // Trạng thái vẫn là NEW

      // Kiểm tra danh sách ghi chú trong kết quả trả về
      const createdNote = res.body.data.notes.find((n) => n.note === noteContent);
      expect(createdNote).toBeDefined();

      // Kiểm tra CSDL bảng support_ticket_notes
      const dbNote = await knex('support_ticket_notes')
        .where({ ticket_id: testTicketId, note: noteContent })
        .first();
      expect(dbNote).toBeDefined();
    });

    it('2.5. Chặn chuyển trạng thái không hợp lệ: NEW -> RESOLVED bị từ chối 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/tickets/${testTicketId}`)
        .set('Cookie', cookies.CSKH)
        .send({ status: 'RESOLVED', resolution: 'Giải quyết ngay' });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Không thể chuyển trạng thái ticket từ "NEW" sang "RESOLVED"');
    });

    it('2.6. Chuyển trạng thái đúng quy trình: NEW -> IN_REVIEW và ghi audit_log', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/tickets/${testTicketId}`)
        .set('Cookie', cookies.CSKH)
        .send({
          status: 'IN_REVIEW',
          note: 'Chuyển sang bước Đang xem xét để liên hệ bộ phận Kế toán',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.ticket.status).toBe('IN_REVIEW');

      // Kiểm tra audit_log ghi nhận chuyển trạng thái
      const auditLog = await knex('audit_log')
        .where({
          entity: 'SUPPORT_TICKET',
          entity_id: testTicketId,
          action: 'TICKET_STATUS_CHANGE',
        })
        .first();

      expect(auditLog).toBeDefined();
      const beforeData = JSON.parse(auditLog.before_json);
      const afterData = JSON.parse(auditLog.after_json);
      expect(beforeData.status).toBe('NEW');
      expect(afterData.status).toBe('IN_REVIEW');
    });

    it('2.7. Chuyển trạng thái tiếp: IN_REVIEW -> WAITING_REFUND', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/tickets/${testTicketId}`)
        .set('Cookie', cookies.CSKH)
        .send({
          status: 'WAITING_REFUND',
          note: 'Đã xác nhận tiền vào, chờ Kế toán duyệt lệnh hoàn tiền',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.ticket.status).toBe('WAITING_REFUND');
    });

    it('2.8. Chuyển trạng thái hoàn tất: WAITING_REFUND -> RESOLVED, gửi notification tới khách', async () => {
      const resolutionText = 'Đã hoàn tất lệnh hoàn tiền 90.000đ về thẻ của quý khách.';
      const res = await request(app)
        .patch(`/api/v1/admin/tickets/${testTicketId}`)
        .set('Cookie', cookies.CSKH)
        .send({
          status: 'RESOLVED',
          resolution: resolutionText,
          note: 'Hoàn tất ticket sau khi hoàn tiền thành công',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.ticket.status).toBe('RESOLVED');
      expect(res.body.data.ticket.resolution).toBe(resolutionText);
      expect(res.body.data.ticket.resolved_at).toBeDefined();

      // Kiểm tra thông báo được gửi đến khách hàng
      const notification = await knex('notifications')
        .where({
          user_id: customerUserId,
          order_id: testOrderId,
        })
        .orderBy('id', 'desc')
        .first();

      expect(notification).toBeDefined();
      expect(notification.title).toContain(testTicketId);
      expect(notification.body).toContain(resolutionText);
    });

    it('2.9. Chặn chuyển tiếp từ trạng thái kết thúc (RESOLVED là terminal): trả về 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/tickets/${testTicketId}`)
        .set('Cookie', cookies.CSKH)
        .send({ status: 'IN_REVIEW' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Không thể chuyển tiếp');
    });
  });
});
