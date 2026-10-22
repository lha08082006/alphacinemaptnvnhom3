'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');
const clock = require('../src/lib/clock');
const {
  getRevenueReportData,
  getReconciliationReportData,
  getRefundsReportData,
  getTicketsReportData,
  getOccupancyReportData,
} = require('../src/routes/admin');

describe('Step 12: Admin Reports & Performance Verification on Large Dataset', () => {
  let app;
  const cookies = {
    CUSTOMER: null,
    IT: null,
    ACCOUNTANT: null,
    CSKH: null,
    MANAGER: null,
  };

  const seedOrderPrefix = 'BC_PERF_ORD_';
  const seedRefundPrefix = 'RF_PERF_';
  const seedTicketPrefix = 'TK_PERF_';
  const NUM_ORDERS = 300;
  const NUM_REFUNDS = 50;
  const NUM_TICKETS = 50;

  beforeAll(async () => {
    app = createApp();

    // 1. Đăng nhập các vai trò
    const resCust = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang@gmail.com', password: 'Password@123' });
    cookies.CUSTOMER = resCust.headers['set-cookie'];

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

    const userCust = await knex('users').where({ email: 'khachhang@gmail.com' }).first();
    const customerUserId = userCust?.id || 1;

    // Lấy danh sách showtimes và seats thực tế trong DB để đảm bảo Foreign Key
    const existingShowtimes = await knex('showtimes').select('id').limit(10);
    const existingSeats = await knex('seats').select('id').limit(50);

    // 2. Chèn dữ liệu mẫu lớn phục vụ kiểm tra hiệu năng (Bulk Seed)
    const nowMs = Date.now();
    const ordersBatch = [];
    const orderSeatsBatch = [];
    const refundsBatch = [];
    const ticketsBatch = [];

    // Tạo 300 đơn hàng trải dài trong 30 ngày
    for (let i = 1; i <= NUM_ORDERS; i++) {
      const orderId = `${seedOrderPrefix}${String(i).padStart(4, '0')}`;
      const dayOffset = i % 30;
      const orderDate = new Date(nowMs - dayOffset * 24 * 3600 * 1000).toISOString();
      const isPaid = i % 4 !== 0; // 75% đơn PAID, 25% đơn khác
      const status = isPaid ? 'PAID' : (i % 2 === 0 ? 'AWAITING_PAYMENT' : 'PENDING_VERIFY');
      const showtimeId = existingShowtimes[i % existingShowtimes.length].id;

      ordersBatch.push({
        order_id: orderId,
        user_id: customerUserId,
        showtime_id: showtimeId,
        status,
        amount_tickets: 90000,
        amount_combos: 45000,
        amount_total: 135000,
        customer_name: `Khách hàng mẫu ${i}`,
        customer_phone: '0987654321',
        customer_email: `khach_${i}@test.com`,
        hold_expires_at: orderDate,
        created_at: orderDate,
        updated_at: orderDate,
        paid_at: isPaid ? orderDate : null,
      });

      // Mỗi đơn 1 vé với seat_id hợp lệ
      const seatId = existingSeats[i % existingSeats.length].id;
      orderSeatsBatch.push({
        order_id: orderId,
        seat_id: seatId,
        seat_type: 'STANDARD',
        price: 90000,
      });
    }

    // Tạo 50 lệnh hoàn tiền
    for (let i = 1; i <= NUM_REFUNDS; i++) {
      const refundId = `${seedRefundPrefix}${String(i).padStart(4, '0')}`;
      const orderId = `${seedOrderPrefix}${String(i).padStart(4, '0')}`;
      const detectedTime = new Date(nowMs - (i * 2) * 3600 * 1000).toISOString();
      // Gửi hoàn sau 30 - 60 phút
      const sentTime = new Date(new Date(detectedTime).getTime() + 45 * 60 * 1000).toISOString();
      const isCompleted = i % 2 === 0;
      const isOverdue = i % 5 === 0;
      const sendDue = isOverdue
        ? new Date(nowMs - 2 * 3600 * 1000).toISOString()
        : new Date(nowMs + 20 * 3600 * 1000).toISOString();

      refundsBatch.push({
        refund_id: refundId,
        order_id: orderId,
        gateway_txn_id: `GW_TXN_PERF_${i}`,
        amount: 135000,
        type: i % 3 === 0 ? 'AUTO' : 'MANUAL',
        status: isCompleted ? 'COMPLETED' : 'CHECKING',
        detected_at: detectedTime,
        send_due_at: sendDue,
        sent_at: sentTime,
        completed_at: isCompleted ? sentTime : null,
        checks_json: JSON.stringify({ ok: true }),
        sla_breached: isOverdue ? 1 : 0,
      });
    }

    // Tạo 50 support tickets
    for (let i = 1; i <= NUM_TICKETS; i++) {
      const ticketId = `${seedTicketPrefix}${String(i).padStart(4, '0')}`;
      const orderId = `${seedOrderPrefix}${String(i).padStart(4, '0')}`;
      const createdTime = new Date(nowMs - (i * 3) * 3600 * 1000).toISOString();
      const isResolved = i % 2 === 0;
      // Giải quyết sau 2 giờ
      const resolvedTime = isResolved
        ? new Date(new Date(createdTime).getTime() + 2 * 3600 * 1000).toISOString()
        : null;

      ticketsBatch.push({
        ticket_id: ticketId,
        order_id: orderId,
        user_id: customerUserId,
        contact: `khach_${i}@test.com`,
        source: 'CUSTOMER',
        status: isResolved ? 'RESOLVED' : (i % 3 === 0 ? 'IN_REVIEW' : 'NEW'),
        issue_type: 'PAYMENT_DEBITED_NO_TICKET',
        description: `Khiếu nại kiểm tra hiệu năng ${i}`,
        created_at: createdTime,
        resolved_at: resolvedTime,
        resolution: isResolved ? 'Đã hỗ trợ thành công' : null,
      });
    }

    // Batch insert vào SQLite (Knex batchInsert theo chunk 100)
    await knex.batchInsert('orders', ordersBatch, 100);
    await knex.batchInsert('order_seats', orderSeatsBatch, 100);
    await knex.batchInsert('refunds', refundsBatch, 50);
    await knex.batchInsert('support_tickets', ticketsBatch, 50);
  });

  afterAll(async () => {
    // Dọn dẹp dữ liệu test
    await knex('support_tickets').where('ticket_id', 'like', `${seedTicketPrefix}%`).del();
    await knex('refunds').where('refund_id', 'like', `${seedRefundPrefix}%`).del();
    await knex('order_seats').where('order_id', 'like', `${seedOrderPrefix}%`).del();
    await knex('orders').where('order_id', 'like', `${seedOrderPrefix}%`).del();
    await knex.destroy();
  });

  describe('PHẦN 1: Phân quyền Truy cập Trang Báo cáo', () => {
    it('1.1. Khách hàng (CUSTOMER) bị từ chối 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/overview')
        .set('Cookie', cookies.CUSTOMER);
      expect(res.status).toBe(403);
    });

    it('1.2. IT và CSKH bị từ chối 403 FORBIDDEN (chỉ dành cho ACCOUNTANT & MANAGER)', async () => {
      const resIt = await request(app)
        .get('/api/v1/admin/reports/overview')
        .set('Cookie', cookies.IT);
      expect(resIt.status).toBe(403);

      const resCskh = await request(app)
        .get('/api/v1/admin/reports/overview')
        .set('Cookie', cookies.CSKH);
      expect(resCskh.status).toBe(403);
    });

    it('1.3. Kế toán (ACCOUNTANT) và Quản lý (MANAGER) được phép truy cập 200 OK', async () => {
      const resAcct = await request(app)
        .get('/api/v1/admin/reports/overview')
        .set('Cookie', cookies.ACCOUNTANT);
      expect(resAcct.status).toBe(200);
      expect(resAcct.body.ok).toBe(true);

      const resMgr = await request(app)
        .get('/api/v1/admin/reports/overview')
        .set('Cookie', cookies.MANAGER);
      expect(resMgr.status).toBe(200);
      expect(resMgr.body.ok).toBe(true);
    });
  });

  describe('PHẦN 2: Kiểm tra Chức năng & Chỉ số Báo cáo Chi tiết', () => {
    let reportData;

    beforeAll(async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/overview')
        .set('Cookie', cookies.ACCOUNTANT);
      reportData = res.body.data;
    });

    it('2.1. Doanh thu theo Ngày / theo Phim / theo Rạp', () => {
      expect(reportData).toHaveProperty('revenue');
      const { by_day, by_movie, by_cinema, totals } = reportData.revenue;

      expect(Array.isArray(by_day)).toBe(true);
      expect(by_day.length).toBeGreaterThan(0);
      expect(by_day[0]).toHaveProperty('date');
      expect(by_day[0]).toHaveProperty('orders_count');
      expect(by_day[0]).toHaveProperty('total_revenue');

      expect(Array.isArray(by_movie)).toBe(true);
      expect(by_movie.length).toBeGreaterThan(0);
      expect(by_movie[0]).toHaveProperty('movie_title');
      expect(by_movie[0]).toHaveProperty('tickets_count');
      expect(by_movie[0]).toHaveProperty('total_revenue');

      expect(Array.isArray(by_cinema)).toBe(true);
      expect(by_cinema.length).toBeGreaterThan(0);
      expect(by_cinema[0]).toHaveProperty('cinema_name');
      expect(by_cinema[0]).toHaveProperty('total_revenue');

      expect(totals.total_revenue).toBeGreaterThan(0);
      expect(totals.total_orders).toBeGreaterThan(0);
    });

    it('2.2. Đối soát (tiền cổng, tiền Beta, chênh lệch, giao dịch treo)', () => {
      expect(reportData).toHaveProperty('recon');
      expect(Array.isArray(reportData.recon)).toBe(true);
      if (reportData.recon.length > 0) {
        const item = reportData.recon[0];
        expect(item).toHaveProperty('date');
        expect(item).toHaveProperty('gateway_total');
        expect(item).toHaveProperty('beta_total');
        expect(item).toHaveProperty('difference');
        expect(item).toHaveProperty('hanging_count');
      }
    });

    it('2.3. Hoàn tiền: đã hoàn, đang xử lý, quá hạn SLA & thời gian trung bình phát hiện → gửi hoàn', () => {
      expect(reportData).toHaveProperty('refunds');
      const ref = reportData.refunds;

      expect(ref.completed_count).toBeGreaterThan(0);
      expect(ref.processing_count).toBeGreaterThan(0);
      expect(ref.overdue_count).toBeGreaterThan(0);
      expect(ref.avg_turnaround_minutes).toBeGreaterThan(0); // ~45 phút theo seed
      expect(Array.isArray(ref.items)).toBe(true);
    });

    it('2.4. CSKH: Ticket theo trạng thái và thời gian xử lý trung bình', () => {
      expect(reportData).toHaveProperty('tickets');
      const tkt = reportData.tickets;

      expect(tkt).toHaveProperty('by_status');
      expect(tkt.by_status).toHaveProperty('NEW');
      expect(tkt.by_status).toHaveProperty('IN_REVIEW');
      expect(tkt.by_status).toHaveProperty('RESOLVED');
      expect(tkt.by_status.RESOLVED).toBeGreaterThan(0);
      expect(tkt.avg_resolution_hours).toBeGreaterThan(0); // ~2 giờ theo seed
      expect(Array.isArray(tkt.items)).toBe(true);
    });

    it('2.5. Tỷ lệ lấp đầy ghế theo suất chiếu (occupancy rate)', () => {
      expect(reportData).toHaveProperty('occupancy');
      expect(Array.isArray(reportData.occupancy)).toBe(true);
      expect(reportData.occupancy.length).toBeGreaterThan(0);

      const show = reportData.occupancy[0];
      expect(show).toHaveProperty('showtime_id');
      expect(show).toHaveProperty('movie_title');
      expect(show).toHaveProperty('cinema_name');
      expect(show).toHaveProperty('room_name');
      expect(show).toHaveProperty('total_seats');
      expect(show).toHaveProperty('booked_seats');
      expect(show).toHaveProperty('occupancy_rate');
      expect(typeof show.occupancy_rate).toBe('number');
      expect(show.occupancy_rate).toBeGreaterThanOrEqual(0);
      expect(show.occupancy_rate).toBeLessThanOrEqual(100);
    });
  });

  describe('PHẦN 3: Xuất CSV UTF-8 BOM Chuẩn (GET /admin/reports/export.csv)', () => {
    const csvTypes = [
      'revenue_daily',
      'revenue_movie',
      'revenue_cinema',
      'recon',
      'refunds',
      'tickets',
      'occupancy',
    ];

    test.each(csvTypes)('Xuất CSV thành công cho loại báo cáo: %s', async (type) => {
      const res = await request(app)
        .get(`/api/v1/admin/reports/export.csv?type=${type}`)
        .set('Cookie', cookies.ACCOUNTANT);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('.csv');

      // Kiểm tra có ký tự UTF-8 BOM ở đầu file (\uFEFF)
      const text = res.text;
      expect(text.charCodeAt(0)).toBe(0xfeff);
      expect(text.length).toBeGreaterThan(10);
    });

    it('Từ chối loại báo cáo không hợp lệ -> 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/export.csv?type=invalid_type')
        .set('Cookie', cookies.ACCOUNTANT);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PHẦN 4: Kiểm tra Hiệu năng Truy vấn trên Dữ liệu Mẫu Lớn (Performance Benchmark)', () => {
    it('4.1. Hiệu năng truy vấn Doanh thu (getRevenueReportData) < 500ms', async () => {
      const t0 = Date.now();
      const res = await getRevenueReportData('2020-01-01', '2030-12-31');
      const elapsed = Date.now() - t0;

      expect(res.by_day.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(500); // Dưới 500ms
    });

    it('4.2. Hiệu năng truy vấn Đối soát (getReconciliationReportData) < 500ms', async () => {
      const t0 = Date.now();
      const res = await getReconciliationReportData('2020-01-01', '2030-12-31');
      const elapsed = Date.now() - t0;

      expect(elapsed).toBeLessThan(500);
    });

    it('4.3. Hiệu năng truy vấn Hoàn tiền & SLA (getRefundsReportData) < 500ms', async () => {
      const t0 = Date.now();
      const res = await getRefundsReportData('2020-01-01', '2030-12-31');
      const elapsed = Date.now() - t0;

      expect(res.items.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(500);
    });

    it('4.4. Hiệu năng truy vấn CSKH Ticket (getTicketsReportData) < 500ms', async () => {
      const t0 = Date.now();
      const res = await getTicketsReportData('2020-01-01', '2030-12-31');
      const elapsed = Date.now() - t0;

      expect(res.items.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(500);
    });

    it('4.5. Hiệu năng truy vấn Tỷ lệ lấp đầy ghế (getOccupancyReportData) < 500ms', async () => {
      const t0 = Date.now();
      const res = await getOccupancyReportData('2020-01-01', '2030-12-31');
      const elapsed = Date.now() - t0;

      expect(res.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(500);
    });

    it('4.6. Toàn bộ API GET /admin/reports/overview (chạy song song cả 5 báo cáo) < 1000ms', async () => {
      const t0 = Date.now();
      const res = await request(app)
        .get('/api/v1/admin/reports/overview')
        .set('Cookie', cookies.ACCOUNTANT);
      const elapsed = Date.now() - t0;

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(elapsed).toBeLessThan(1000); // Toàn bộ API phản hồi dưới 1 giây
    });
  });
});
