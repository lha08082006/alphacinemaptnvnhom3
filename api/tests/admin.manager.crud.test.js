'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');

describe('Step 14: Manager CRUD & Operations Verification', () => {
  let app;
  let managerCookie;
  let cskhCookie;
  let itCookie;

  let testMovieId;
  let testBannerId;
  let testPromoId;
  let testComboId;
  let testCinemaId;
  let testRoomId;
  let testShowtimeId;
  let testPriceId;

  const uniqueSuffix = Date.now();

  beforeAll(async () => {
    app = createApp();

    // 1. Đăng nhập các role
    const resMgr = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'manager@betacinemas.vn', password: 'Password@123' });
    managerCookie = resMgr.headers['set-cookie'];

    const resCskh = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'cskh@betacinemas.vn', password: 'Password@123' });
    cskhCookie = resCskh.headers['set-cookie'];

    const resIt = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'it@betacinemas.vn', password: 'Password@123' });
    itCookie = resIt.headers['set-cookie'];
  });

  afterAll(async () => {
    // Dọn dẹp dữ liệu test
    try {
      if (testShowtimeId) {
        const testOrders = await knex('orders').where({ showtime_id: testShowtimeId }).select('order_id');
        const orderIds = testOrders.map((o) => o.order_id);
        if (orderIds.length > 0) {
          await knex('notifications').whereIn('order_id', orderIds).del();
          await knex('order_status_history').whereIn('order_id', orderIds).del();
          await knex('refunds').whereIn('order_id', orderIds).del();
          await knex('tickets').whereIn('order_id', orderIds).del();
          await knex('order_seats').whereIn('order_id', orderIds).del();
          await knex('order_combos').whereIn('order_id', orderIds).del();
          await knex('payment_attempts').whereIn('order_id', orderIds).del();
          await knex('orders').whereIn('order_id', orderIds).del();
        }
        await knex('showtime_seats').where({ showtime_id: testShowtimeId }).del();
        await knex('showtimes').where({ id: testShowtimeId }).del();
      }
      if (testRoomId) {
        await knex('seats').where({ room_id: testRoomId }).del();
        await knex('rooms').where({ id: testRoomId }).del();
      }
      if (testCinemaId) {
        await knex('cinemas').where({ id: testCinemaId }).del();
      }
      if (testMovieId) {
        await knex('movies').where({ id: testMovieId }).del();
      }
      if (testBannerId) {
        await knex('banners').where({ id: testBannerId }).del();
      }
      if (testPromoId) {
        await knex('promotions').where({ id: testPromoId }).del();
      }
      if (testComboId) {
        await knex('combos').where({ id: testComboId }).del();
      }
      if (testPriceId) {
        await knex('ticket_prices').where({ id: testPriceId }).del();
      }
    } finally {
      await knex.destroy();
    }
  });

  describe('PHẦN 1: Phân quyền & CRUD Phim, Banner, Tin tức, Combo', () => {
    it('1.1. Phân quyền: CSKH và IT không có quyền tạo phim (403), MANAGER được phép (201)', async () => {
      const resCskh = await request(app)
        .post('/api/v1/admin/movies')
        .set('Cookie', cskhCookie)
        .send({
          title: 'Phim Test Phân Quyền',
          duration_min: 120,
        });
      expect(resCskh.status).toBe(403);

      const resIt = await request(app)
        .post('/api/v1/admin/movies')
        .set('Cookie', itCookie)
        .send({
          title: 'Phim Test Phân Quyền',
          duration_min: 120,
        });
      expect(resIt.status).toBe(403);
    });

    it('1.2. MANAGER tạo phim mới (POST /admin/movies) với đầy đủ thông tin, trạng thái, poster, trailer', async () => {
      const res = await request(app)
        .post('/api/v1/admin/movies')
        .set('Cookie', managerCookie)
        .send({
          title: `Siêu Phẩm Điện Ảnh Test ${uniqueSuffix}`,
          duration_min: 115,
          age_rating: 'T16',
          status: 'NOW_SHOWING',
          synopsis: 'Cuộc phiêu lưu giải cứu hành tinh đầy gay cấn.',
          director: 'Đạo diễn Christopher Test',
          genres: ['Hành Động', 'Khoa Học Viễn Tưởng'],
          cast: ['Diễn viên A', 'Diễn viên B'],
          poster_url: 'https://files.betacorp.vn/media/images/test-poster.jpg',
          trailer_url: 'https://youtube.com/watch?v=sample-trailer',
          is_hot: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.title).toContain('Siêu Phẩm Điện Ảnh Test');
      expect(res.body.data.status).toBe('NOW_SHOWING');
      expect(res.body.data.age_rating).toBe('T16');

      testMovieId = res.body.data.id;

      // Kiểm tra trong CSDL
      const inDb = await knex('movies').where({ id: testMovieId }).first();
      expect(inDb).toBeDefined();
      expect(JSON.parse(inDb.genres_json)).toContain('Khoa Học Viễn Tưởng');
      expect(JSON.parse(inDb.poster_style_json).url).toBe('https://files.betacorp.vn/media/images/test-poster.jpg');
      expect(JSON.parse(inDb.trailer_json).url).toBe('https://youtube.com/watch?v=sample-trailer');
    });

    it('1.3. MANAGER cập nhật phim (PUT /admin/movies/:id): đổi trạng thái sang COMING_SOON', async () => {
      const res = await request(app)
        .put(`/api/v1/admin/movies/${testMovieId}`)
        .set('Cookie', managerCookie)
        .send({
          title: `Siêu Phẩm Điện Ảnh Đã Cập Nhật ${uniqueSuffix}`,
          duration_min: 130,
          age_rating: 'T18',
          status: 'COMING_SOON',
          poster_url: 'https://files.betacorp.vn/media/images/test-poster-v2.jpg',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMING_SOON');
      expect(res.body.data.age_rating).toBe('T18');
      expect(res.body.data.duration_min).toBe(130);
    });

    it('1.4. CRUD Banner (POST, GET, PUT, DELETE)', async () => {
      // POST
      const resCreate = await request(app)
        .post('/api/v1/admin/banners')
        .set('Cookie', managerCookie)
        .send({
          title: `Banner Khuyến Mãi Hè ${uniqueSuffix}`,
          image_url: 'https://files.betacorp.vn/media/banner-test.jpg',
          link_url: '#summer-promo',
          sort_order: 1,
          is_active: true,
        });
      expect(resCreate.status).toBe(201);
      testBannerId = resCreate.body.data.id;

      // GET
      const resGet = await request(app)
        .get('/api/v1/admin/banners')
        .set('Cookie', managerCookie);
      expect(resGet.status).toBe(200);
      expect(resGet.body.data.banners.some((b) => b.id === testBannerId)).toBe(true);

      // PUT
      const resUpdate = await request(app)
        .put(`/api/v1/admin/banners/${testBannerId}`)
        .set('Cookie', managerCookie)
        .send({
          title: `Banner Khuyến Mãi Hè Cập Nhật ${uniqueSuffix}`,
          image_url: 'https://files.betacorp.vn/media/banner-updated.jpg',
          sort_order: 2,
          is_active: false,
        });
      expect(resUpdate.status).toBe(200);
      expect(Boolean(resUpdate.body.data.is_active)).toBe(false);

      // DELETE
      const resDel = await request(app)
        .delete(`/api/v1/admin/banners/${testBannerId}`)
        .set('Cookie', managerCookie);
      expect(resDel.status).toBe(200);
      testBannerId = null;
    });

    it('1.5. CRUD Tin và Ưu đãi (POST, GET, PUT, DELETE)', async () => {
      // POST
      const resCreate = await request(app)
        .post('/api/v1/admin/promotions')
        .set('Cookie', managerCookie)
        .send({
          title: `Ưu đãi Thứ 5 Vui Nhộn ${uniqueSuffix}`,
          summary: 'Giảm 50% vé xem phim vào thứ 5 hàng tuần',
          content: 'Nội dung chi tiết chương trình ưu đãi...',
          type: 'PROMOTION',
          is_active: true,
        });
      expect(resCreate.status).toBe(201);
      testPromoId = resCreate.body.data.id;

      // GET
      const resGet = await request(app)
        .get('/api/v1/admin/promotions')
        .set('Cookie', managerCookie);
      expect(resGet.status).toBe(200);
      expect(resGet.body.data.promotions.some((p) => p.id === testPromoId)).toBe(true);

      // PUT
      const resUpdate = await request(app)
        .put(`/api/v1/admin/promotions/${testPromoId}`)
        .set('Cookie', managerCookie)
        .send({
          title: `Ưu đãi Thứ 5 Cập Nhật ${uniqueSuffix}`,
          type: 'NEWS',
        });
      expect(resUpdate.status).toBe(200);
      expect(resUpdate.body.data.type).toBe('NEWS');

      // DELETE
      const resDel = await request(app)
        .delete(`/api/v1/admin/promotions/${testPromoId}`)
        .set('Cookie', managerCookie);
      expect(resDel.status).toBe(200);
      testPromoId = null;
    });

    it('1.6. CRUD Combo bắp nước (POST, GET, PUT, DELETE)', async () => {
      // POST
      const resCreate = await request(app)
        .post('/api/v1/admin/combos')
        .set('Cookie', managerCookie)
        .send({
          name: `Combo Mega VIP ${uniqueSuffix}`,
          description: '1 Bắp caramel lớn + 2 Nước ngọt siêu to',
          price: 99000,
          is_active: true,
        });
      expect(resCreate.status).toBe(201);
      testComboId = resCreate.body.data.id;

      // PUT
      const resUpdate = await request(app)
        .put(`/api/v1/admin/combos/${testComboId}`)
        .set('Cookie', managerCookie)
        .send({
          name: `Combo Mega VIP Cập Nhật ${uniqueSuffix}`,
          description: 'Thêm snack khoai tây',
          price: 110000,
          is_active: true,
        });
      expect(resUpdate.status).toBe(200);
      expect(resUpdate.body.data.price).toBe(110000);

      // DELETE
      const resDel = await request(app)
        .delete(`/api/v1/admin/combos/${testComboId}`)
        .set('Cookie', managerCookie);
      expect(resDel.status).toBe(200);
      testComboId = null;
    });
  });

  describe('PHẦN 2: CRUD Rạp, Phòng, Sơ đồ ghế & Giá vé', () => {
    it('2.1. MANAGER tạo Cụm rạp mới (POST /admin/cinemas)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/cinemas')
        .set('Cookie', managerCookie)
        .send({
          code: `CR_${uniqueSuffix.toString().slice(-4)}`,
          name: `Beta Cinemas Cầu Giấy ${uniqueSuffix}`,
          city: 'Hà Nội',
          address: '123 Cầu Giấy, Quan Hoa',
          hotline: '0988889999',
        });

      expect(res.status).toBe(201);
      testCinemaId = res.body.data.id;
    });

    it('2.2. MANAGER tạo Phòng chiếu mới (POST /admin/rooms)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Cookie', managerCookie)
        .send({
          cinema_id: testCinemaId,
          name: 'Phòng Chiếu 1 (Standard 2D)',
          room_type: '2D',
        });

      expect(res.status).toBe(201);
      testRoomId = res.body.data.id;
    });

    it('2.3. Sinh ma trận sơ đồ ghế tự động cho phòng (POST /admin/rooms/:id/seats/generate)', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/rooms/${testRoomId}/seats/generate`)
        .set('Cookie', managerCookie)
        .send({
          rows: 4, // A, B, C, D
          cols: 6, // 1 to 6
          vipRows: ['B', 'C'],
          doubleRows: ['D'],
          aisles: [3], // Lối đi ở cột 3
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      // 4 rows * (6 - 1) = 20 seats
      expect(res.body.data.total_seats).toBe(20);

      // Kiểm tra loại ghế được gán chính xác
      const seats = await knex('seats').where({ room_id: testRoomId });
      expect(seats.length).toBe(20);

      const seatA1 = seats.find((s) => s.row_label === 'A' && s.col_number === 1);
      expect(seatA1.seat_type).toBe('STANDARD');

      const seatB2 = seats.find((s) => s.row_label === 'B' && s.col_number === 2);
      expect(seatB2.seat_type).toBe('VIP');

      const seatD1 = seats.find((s) => s.row_label === 'D' && s.col_number === 1);
      expect(seatD1.seat_type).toBe('COUPLE');
    });

    it('2.4. Sửa loại ghế đơn lẻ (PUT /admin/seats/:id)', async () => {
      const seats = await knex('seats').where({ room_id: testRoomId });
      const targetSeat = seats[0];

      const res = await request(app)
        .put(`/api/v1/admin/seats/${targetSeat.id}`)
        .set('Cookie', managerCookie)
        .send({ seat_type: 'VIP' });

      expect(res.status).toBe(200);
      expect(res.body.data.seat_type).toBe('VIP');
    });

    it('2.5. CRUD Bảng giá vé (POST, GET, PUT, DELETE)', async () => {
      const resCreate = await request(app)
        .post('/api/v1/admin/ticket-prices')
        .set('Cookie', managerCookie)
        .send({
          name: `Vé VIP Cuối Tuần ${uniqueSuffix}`,
          format: '2D',
          seat_type: 'VIP',
          price: 75000,
          description: 'Áp dụng thứ 7 & chủ nhật',
        });

      expect(resCreate.status).toBe(201);
      testPriceId = resCreate.body.data.id;

      const resUpdate = await request(app)
        .put(`/api/v1/admin/ticket-prices/${testPriceId}`)
        .set('Cookie', managerCookie)
        .send({
          name: `Vé VIP Cuối Tuần Cập Nhật`,
          format: '2D',
          seat_type: 'VIP',
          price: 80000,
        });

      expect(resUpdate.status).toBe(200);
      expect(resUpdate.body.data.price).toBe(80000);

      const resDel = await request(app)
        .delete(`/api/v1/admin/ticket-prices/${testPriceId}`)
        .set('Cookie', managerCookie);

      expect(resDel.status).toBe(200);
      testPriceId = null;
    });
  });

  describe('PHẦN 3: Suất chiếu - Chặn trùng giờ, Tự sinh showtime_seats, Chặn xóa khi có đơn & Hủy kèm hoàn tiền', () => {
    const startTime1 = '2026-11-20T14:00:00.000Z';
    const endTime1 = '2026-11-20T16:00:00.000Z';

    it('3.1. Tạo suất chiếu mới -> TỰ SINH showtime_seats trạng thái AVAILABLE cho mọi ghế trong phòng', async () => {
      const res = await request(app)
        .post('/api/v1/admin/showtimes')
        .set('Cookie', managerCookie)
        .send({
          movie_id: testMovieId,
          room_id: testRoomId,
          starts_at: startTime1,
          ends_at: endTime1,
          format: '2D',
          price_standard: 55000,
          price_vip: 65000,
          price_couple: 130000,
          status: 'OPEN',
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.auto_generated_seats).toBe(20);

      testShowtimeId = res.body.data.id;

      // Kiểm tra trong bảng showtime_seats: đủ 20 ghế trạng thái AVAILABLE
      const generatedSeats = await knex('showtime_seats').where({ showtime_id: testShowtimeId });
      expect(generatedSeats.length).toBe(20);
      expect(generatedSeats.every((s) => s.state === 'AVAILABLE')).toBe(true);
    });

    it('3.2. CHẶN TRÙNG GIỜ TRONG CÙNG PHÒNG: Suất chiếu mới bị trùng khoảng giờ -> 409', async () => {
      // Khoảng giờ giao nhau: 15:00 - 17:00 (giao với 14:00 - 16:00)
      const resOverlap = await request(app)
        .post('/api/v1/admin/showtimes')
        .set('Cookie', managerCookie)
        .send({
          movie_id: testMovieId,
          room_id: testRoomId, // Cùng phòng testRoomId
          starts_at: '2026-11-20T15:00:00.000Z',
          ends_at: '2026-11-20T17:00:00.000Z',
          format: '2D',
          price_standard: 55000,
          price_vip: 65000,
          price_couple: 130000,
        });

      expect(resOverlap.status).toBe(409);
      expect(resOverlap.body.error.message).toContain('trùng giờ');
    });

    it('3.3. CHẶN XÓA SUẤT CHIẾU ĐÃ CÓ ĐƠN HÀNG: Tạo đơn hàng cho suất chiếu -> Gọi DELETE trả về 409', async () => {
      // Giả lập 1 đơn hàng PAID cho suất chiếu testShowtimeId
      const testOrderId = 'BC_TEST_ST_' + uniqueSuffix.toString().slice(-4);
      const nowIso = new Date().toISOString();

      await knex('orders').insert({
        order_id: testOrderId,
        user_id: 1,
        showtime_id: testShowtimeId,
        status: 'PAID',
        amount_tickets: 55000,
        amount_combos: 0,
        amount_total: 55000,
        customer_name: 'Khách Test Hủy Suất',
        customer_phone: '0912345678',
        customer_email: 'khach_test_st@gmail.com',
        hold_expires_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
        paid_at: nowIso,
      });

      // Tạo vé cho đơn này
      await knex('tickets').insert({
        ticket_id: 'CS_TEST_' + uniqueSuffix.toString().slice(-3),
        order_id: testOrderId,
        qr_payload: 'QR_TEST',
        status: 'VALID',
        issued_at: nowIso,
      });

      // Cố tình gọi DELETE suất chiếu
      const resDelete = await request(app)
        .delete(`/api/v1/admin/showtimes/${testShowtimeId}`)
        .set('Cookie', managerCookie);

      expect(resDelete.status).toBe(409);
      expect(resDelete.body.error.message).toContain('đã có đơn hàng, không thể xóa');

      // Đảm bảo suất chiếu vẫn tồn tại
      const stInDb = await knex('showtimes').where({ id: testShowtimeId }).first();
      expect(stInDb).toBeDefined();
    });

    it('3.4. HỦY SUẤT CHIẾU KÈM QUY TRÌNH HOÀN TIỀN (POST /admin/showtimes/:id/cancel)', async () => {
      const resCancel = await request(app)
        .post(`/api/v1/admin/showtimes/${testShowtimeId}/cancel`)
        .set('Cookie', managerCookie);

      expect(resCancel.status).toBe(200);
      expect(resCancel.body.ok).toBe(true);
      expect(resCancel.body.data.status).toBe('CANCELLED');
      expect(resCancel.body.data.refunded_orders).toBeGreaterThanOrEqual(1);

      // Kiểm tra trạng thái suất chiếu trong DB đã thành CANCELLED
      const stInDb = await knex('showtimes').where({ id: testShowtimeId }).first();
      expect(stInDb.status).toBe('CANCELLED');

      // Kiểm tra đơn hàng được chuyển sang REFUND_PENDING
      const ordersInDb = await knex('orders').where({ showtime_id: testShowtimeId });
      const paidOrder = ordersInDb.find((o) => o.order_id.startsWith('BC_TEST_ST_'));
      expect(paidOrder.status).toBe('REFUND_PENDING');

      // Kiểm tra bảng refunds đã được tạo lệnh hoàn
      const refundRow = await knex('refunds').where({ order_id: paidOrder.order_id }).first();
      expect(refundRow).toBeDefined();
      expect(refundRow.status).toBe('CHECKING');
      expect(refundRow.amount).toBe(55000);

      // Kiểm tra vé tickets đã bị VOID
      const ticketRow = await knex('tickets').where({ order_id: paidOrder.order_id }).first();
      expect(ticketRow.status).toBe('VOID');

      // Kiểm tra đã gửi thông báo notifications cho khách hàng
      const notifRow = await knex('notifications').where({ order_id: paidOrder.order_id }).first();
      expect(notifRow).toBeDefined();
      expect(notifRow.title).toContain('Suất chiếu bị hủy');

      // Dọn dẹp đơn test
      await knex('notifications').where({ order_id: paidOrder.order_id }).del();
      await knex('order_status_history').where({ order_id: paidOrder.order_id }).del();
      await knex('refunds').where({ order_id: paidOrder.order_id }).del();
      await knex('tickets').where({ order_id: paidOrder.order_id }).del();
      await knex('orders').where({ order_id: paidOrder.order_id }).del();
    });
  });
});
