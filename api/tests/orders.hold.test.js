'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');

describe('Seat Selection & Order Hold (BE-03 / orders/hold & showtimes/:id/seats)', () => {
  let app;
  let customer1Cookie;
  let customer2Cookie;
  let testShowtimeId;
  let testSeatId1;
  let testSeatId2;
  let soldSeatId;
  const createdOrderIds = [];

  async function cleanupOrders() {
    if (createdOrderIds.length > 0) {
      await knex('order_seats').whereIn('order_id', createdOrderIds).del();
      await knex('order_status_history').whereIn('order_id', createdOrderIds).del();
      await knex('showtime_seats').whereIn('order_id', createdOrderIds).del();
      await knex('orders').whereIn('order_id', createdOrderIds).del();
      createdOrderIds.length = 0;
    }
  }

  beforeAll(async () => {
    app = createApp();

    // 1. Đăng nhập Customer 1
    const resCust1 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang@gmail.com', password: 'Password@123' });
    customer1Cookie = resCust1.headers['set-cookie'];

    // 2. Đăng nhập Customer 2
    const resCust2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang2@gmail.com', password: 'Password@123' });
    customer2Cookie = resCust2.headers['set-cookie'];

    // 3. Chuẩn bị suất chiếu mẫu và ghế mẫu
    const showtime = await knex('showtimes').where({ status: 'OPEN' }).first();
    testShowtimeId = showtime.id;

    const availableSeats = await knex('seats')
      .where({ room_id: showtime.room_id })
      .whereNotIn(
        'id',
        knex('showtime_seats').where({ showtime_id: testShowtimeId }).select('seat_id')
      )
      .limit(3);

    testSeatId1 = availableSeats[0].id;
    testSeatId2 = availableSeats[1].id;
    soldSeatId = availableSeats[2].id;

    // Đánh dấu 1 ghế đã bán trước (SOLD) để kiểm tra
    await knex('showtime_seats')
      .insert({
        showtime_id: testShowtimeId,
        seat_id: soldSeatId,
        state: 'SOLD',
        held_until: null,
      })
      .onConflict(['showtime_id', 'seat_id'])
      .merge();
  });

  afterEach(async () => {
    await cleanupOrders();
  });

  afterAll(async () => {
    await cleanupOrders();
    // Dọn dẹp các ghế test và đơn hàng liên quan
    await knex('showtime_seats')
      .where({ showtime_id: testShowtimeId })
      .whereIn('seat_id', [testSeatId1, testSeatId2, soldSeatId])
      .del();

    await knex.destroy();
  });

  describe('1. GET /api/v1/showtimes/:id/seats', () => {
    it('Lấy sơ đồ ghế thực tế từ CSDL, không dùng Math.random()', async () => {
      const res = await request(app).get(`/api/v1/showtimes/${testShowtimeId}/seats`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.showtime).toBeDefined();
      expect(res.body.data.showtime.id).toBe(testShowtimeId);
      expect(Array.isArray(res.body.data.seats)).toBe(true);
      expect(res.body.data.seats.length).toBeGreaterThan(0);

      // Kiểm tra ghế đã bán có status SOLD
      const soldSeat = res.body.data.seats.find((s) => s.id === soldSeatId);
      expect(soldSeat).toBeDefined();
      expect(soldSeat.status).toBe('SOLD');

      // Kiểm tra ghế trống có status AVAILABLE
      const freeSeat = res.body.data.seats.find((s) => s.id === testSeatId1);
      expect(freeSeat).toBeDefined();
      expect(freeSeat.status).toBe('AVAILABLE');
    });

    it('Suất chiếu không tồn tại -> 404 NOT_FOUND', async () => {
      const res = await request(app).get('/api/v1/showtimes/999999/seats');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('2. POST /api/v1/orders/hold', () => {
    it('Chưa đăng nhập -> 401 AUTH_REQUIRED', async () => {
      const res = await request(app)
        .post('/api/v1/orders/hold')
        .send({
          showtimeId: testShowtimeId,
          seatIds: [testSeatId1],
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    it('Chọn quá 8 ghế -> 400 VALIDATION_ERROR (Quy tắc BR-01)', async () => {
      const res = await request(app)
        .post('/api/v1/orders/hold')
        .set('Cookie', customer1Cookie)
        .send({
          showtimeId: testShowtimeId,
          seatIds: [1, 2, 3, 4, 5, 6, 7, 8, 9], // 9 ghế
        });

      expect(res.status).toBe(400); // Zod max(8) validate
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('Tạo đơn giữ chỗ thành công -> 201 Created với trạng thái HOLDING và hold_expires_at', async () => {
      const res = await request(app)
        .post('/api/v1/orders/hold')
        .set('Cookie', customer1Cookie)
        .send({
          showtimeId: testShowtimeId,
          seatIds: [testSeatId2],
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.orderId).toBeDefined();
      expect(res.body.data.status).toBe('HOLDING');
      expect(res.body.data.holdExpiresAt).toBeDefined();
      expect(res.body.data.amountTotal).toBeGreaterThan(0);

      createdOrderIds.push(res.body.data.orderId);

      // Kiểm tra bảng showtime_seats đã được đánh dấu HELD
      const heldSeat = await knex('showtime_seats')
        .where({ showtime_id: testShowtimeId, seat_id: testSeatId2 })
        .first();

      expect(heldSeat).toBeDefined();
      expect(heldSeat.state).toBe('HELD');
      expect(heldSeat.order_id).toBe(res.body.data.orderId);
    });

    it('Chọn ghế đã bán (SOLD) -> 409 SEAT_TAKEN kèm danh sách ghế xung đột', async () => {
      const res = await request(app)
        .post('/api/v1/orders/hold')
        .set('Cookie', customer1Cookie)
        .send({
          showtimeId: testShowtimeId,
          seatIds: [soldSeatId],
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SEAT_TAKEN');
      expect(res.body.error.details).toHaveProperty('conflictedSeats');
      expect(Array.isArray(res.body.error.details.conflictedSeats)).toBe(true);
    });
  });

  describe('3. Nghiệm thu: Test đồng thời hai khách chọn cùng một ghế', () => {
    it('Chỉ duy nhất một khách giữ được ghế (201), khách còn lại nhận 409 SEAT_TAKEN', async () => {
      // Đảm bảo ghế testSeatId1 đang trống trong CSDL
      await knex('showtime_seats')
        .where({ showtime_id: testShowtimeId, seat_id: testSeatId1 })
        .del();

      // Thực thi đồng thời 2 yêu cầu giữ cùng ghế testSeatId1
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/orders/hold')
          .set('Cookie', customer1Cookie)
          .send({
            showtimeId: testShowtimeId,
            seatIds: [testSeatId1],
          }),
        request(app)
          .post('/api/v1/orders/hold')
          .set('Cookie', customer2Cookie)
          .send({
            showtimeId: testShowtimeId,
            seatIds: [testSeatId1],
          }),
      ]);

      const statuses = [res1.status, res2.status].sort();

      // Một người 201 (Thành công), một người 409 (Xung đột)
      expect(statuses).toEqual([201, 409]);

      const successRes = res1.status === 201 ? res1 : res2;
      const conflictRes = res1.status === 409 ? res1 : res2;

      expect(successRes.body.ok).toBe(true);
      expect(successRes.body.data.status).toBe('HOLDING');
      createdOrderIds.push(successRes.body.data.orderId);

      expect(conflictRes.body.ok).toBe(false);
      expect(conflictRes.body.error.code).toBe('SEAT_TAKEN');
      expect(conflictRes.body.error.details).toHaveProperty('conflictedSeats');
    });
  });

  describe('4. Tự động giải phóng ghế khi hết hạn giữ (Lazy Expire)', () => {
    it('Ghế HELD có held_until trong quá khứ được xem là AVAILABLE và có thể giữ lại', async () => {
      const pastTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      // Đặt ghế testSeatId1 ở trạng thái HELD đã hết hạn 10 phút trước
      await knex('showtime_seats')
        .insert({
          showtime_id: testShowtimeId,
          seat_id: testSeatId1,
          state: 'HELD',
          held_until: pastTime,
        })
        .onConflict(['showtime_id', 'seat_id'])
        .merge();

      // 1. Kiểm tra API GET /showtimes/:id/seats coi ghế này là AVAILABLE
      const getRes = await request(app).get(`/api/v1/showtimes/${testShowtimeId}/seats`);
      const seat = getRes.body.data.seats.find((s) => s.id === testSeatId1);
      expect(seat.status).toBe('AVAILABLE');

      // 2. Khách hàng khác có thể giữ thành công ghế đã hết hạn này
      const holdRes = await request(app)
        .post('/api/v1/orders/hold')
        .set('Cookie', customer2Cookie)
        .send({
          showtimeId: testShowtimeId,
          seatIds: [testSeatId1],
        });

      expect(holdRes.status).toBe(201);
      expect(holdRes.body.data.status).toBe('HOLDING');
      createdOrderIds.push(holdRes.body.data.orderId);
    });
  });
});
