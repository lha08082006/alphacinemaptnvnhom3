'use strict';

const knex = require('../src/db/knex');
const clock = require('../src/lib/clock');
const { expireHolds, timeoutAwaiting, getSettings } = require('../src/jobs/scheduler');

describe('Step 7: Scheduler Jobs (expireHolds & timeoutAwaiting)', () => {
  const orderExpiring = 'BCSCHED_EXP_01';
  const orderFuture = 'BCSCHED_FUT_02';
  const orderAsisTimeout = 'BCSCHED_ASIS_03';
  const orderTobeTimeout = 'BCSCHED_TOBE_04';

  let seat1;
  let seat2;
  let seat3;
  let seat4;

  beforeAll(async () => {
    // Lấy 4 ghế có sẵn trong room 1 để gán cho các đơn test
    const seats = await knex('seats').where({ room_id: 1 }).limit(4);
    seat1 = seats[0].id;
    seat2 = seats[1].id;
    seat3 = seats[2].id;
    seat4 = seats[3].id;

    // Dọn dẹp dữ liệu test cũ
    const orderIds = [orderExpiring, orderFuture, orderAsisTimeout, orderTobeTimeout];
    await knex('showtime_seats').whereIn('order_id', orderIds).del();
    await knex('order_seats').whereIn('order_id', orderIds).del();
    await knex('order_status_history').whereIn('order_id', orderIds).del();
    await knex('orders').whereIn('order_id', orderIds).del();
  });

  afterAll(async () => {
    try {
      const orderIds = [orderExpiring, orderFuture, orderAsisTimeout, orderTobeTimeout];
      await knex('showtime_seats').whereIn('order_id', orderIds).del();
      await knex('order_seats').whereIn('order_id', orderIds).del();
      await knex('order_status_history').whereIn('order_id', orderIds).del();
      await knex('orders').whereIn('order_id', orderIds).del();
    } catch (_e) {}
    await knex.destroy();
  });

  describe('expireHolds()', () => {
    beforeEach(async () => {
      const nowMs = clock.nowMs();
      const pastHoldExp = new Date(nowMs - 60 * 1000).toISOString(); // Quá hạn 1 phút trước
      const futureHoldExp = new Date(nowMs + 10 * 60 * 1000).toISOString(); // Còn hạn 10 phút
      const nowIso = new Date(nowMs).toISOString();

      // Đơn 1: HOLDING quá hạn
      await knex('orders').insert({
        order_id: orderExpiring,
        user_id: 1,
        showtime_id: 1,
        status: 'HOLDING',
        amount_tickets: 50000,
        amount_combos: 0,
        amount_total: 50000,
        customer_name: 'Khách Hàng',
        customer_phone: '0987654321',
        customer_email: 'khachhang@gmail.com',
        hold_expires_at: pastHoldExp,
        created_at: nowIso,
        updated_at: nowIso,
      });
      await knex('order_seats').insert({
        order_id: orderExpiring,
        seat_id: seat1,
        seat_type: 'STANDARD',
        price: 50000,
      });
      await knex('showtime_seats').insert({
        showtime_id: 1,
        seat_id: seat1,
        state: 'HELD',
        order_id: orderExpiring,
        held_until: pastHoldExp,
      }).onConflict(['showtime_id', 'seat_id']).merge();

      // Đơn 2: HOLDING còn hạn
      await knex('orders').insert({
        order_id: orderFuture,
        user_id: 1,
        showtime_id: 1,
        status: 'HOLDING',
        amount_tickets: 50000,
        amount_combos: 0,
        amount_total: 50000,
        customer_name: 'Khách Hàng',
        customer_phone: '0987654321',
        customer_email: 'khachhang@gmail.com',
        hold_expires_at: futureHoldExp,
        created_at: nowIso,
        updated_at: nowIso,
      });
      await knex('order_seats').insert({
        order_id: orderFuture,
        seat_id: seat2,
        seat_type: 'STANDARD',
        price: 50000,
      });
      await knex('showtime_seats').insert({
        showtime_id: 1,
        seat_id: seat2,
        state: 'HELD',
        order_id: orderFuture,
        held_until: futureHoldExp,
      }).onConflict(['showtime_id', 'seat_id']).merge();
    });

    afterEach(async () => {
      await knex('showtime_seats').whereIn('order_id', [orderExpiring, orderFuture]).del();
      await knex('order_seats').whereIn('order_id', [orderExpiring, orderFuture]).del();
      await knex('order_status_history').whereIn('order_id', [orderExpiring, orderFuture]).del();
      await knex('orders').whereIn('order_id', [orderExpiring, orderFuture]).del();
    });

    it('should transition expired HOLDING order to EXPIRED and release seats', async () => {
      // Gọi expireHolds với đơn quá hạn
      const processedExp = await expireHolds(orderExpiring);
      expect(processedExp).toContain(orderExpiring);

      // Gọi expireHolds với đơn còn hạn -> không bị xử lý
      const processedFut = await expireHolds(orderFuture);
      expect(processedFut).not.toContain(orderFuture);

      // 1. Đơn quá hạn chuyển sang EXPIRED
      const expiredOrder = await knex('orders').where({ order_id: orderExpiring }).first();
      expect(expiredOrder.status).toBe('EXPIRED');

      // 2. Ghế HELD của đơn quá hạn bị xóa (nhả ghế)
      const seat1Record = await knex('showtime_seats')
        .where({ showtime_id: 1, seat_id: seat1 })
        .first();
      expect(seat1Record).toBeUndefined();

      // 3. Đơn còn hạn vẫn giữ nguyên HOLDING và ghế HELD vẫn còn
      const futureOrder = await knex('orders').where({ order_id: orderFuture }).first();
      expect(futureOrder.status).toBe('HOLDING');
      const seat2Record = await knex('showtime_seats')
        .where({ showtime_id: 1, seat_id: seat2 })
        .first();
      expect(seat2Record).toBeDefined();
      expect(seat2Record.state).toBe('HELD');
    });
  });

  describe('timeoutAwaiting()', () => {
    it('in ASIS mode: should transition timed-out AWAITING_PAYMENT to FAILED and release seats', async () => {
      // 1. Cấu hình mode = 'ASIS', callbackTimeoutSec = 15
      await knex('settings').insert([
        { key: 'mode', value: 'ASIS', updated_at: clock.nowIso() },
        { key: 'callbackTimeoutSec', value: '15', updated_at: clock.nowIso() },
      ]).onConflict('key').merge();

      const nowMs = clock.nowMs();
      const oldUpdatedIso = new Date(nowMs - 30 * 1000).toISOString(); // 30s trước (> 15s)
      const futureHoldExp = new Date(nowMs + 10 * 60 * 1000).toISOString();

      await knex('orders').insert({
        order_id: orderAsisTimeout,
        user_id: 1,
        showtime_id: 1,
        status: 'AWAITING_PAYMENT',
        amount_tickets: 60000,
        amount_combos: 0,
        amount_total: 60000,
        customer_name: 'Khách Hàng',
        customer_phone: '0987654321',
        customer_email: 'khachhang@gmail.com',
        hold_expires_at: futureHoldExp,
        created_at: oldUpdatedIso,
        updated_at: oldUpdatedIso,
      });
      await knex('order_seats').insert({
        order_id: orderAsisTimeout,
        seat_id: seat3,
        seat_type: 'STANDARD',
        price: 60000,
      });
      await knex('showtime_seats').insert({
        showtime_id: 1,
        seat_id: seat3,
        state: 'HELD',
        order_id: orderAsisTimeout,
        held_until: futureHoldExp,
      }).onConflict(['showtime_id', 'seat_id']).merge();

      // 2. Chạy timeoutAwaiting (cô lập cho đơn test)
      const processed = await timeoutAwaiting(orderAsisTimeout);
      expect(processed).toContain(orderAsisTimeout);

      // 3. Đơn chuyển sang FAILED
      const order = await knex('orders').where({ order_id: orderAsisTimeout }).first();
      expect(order.status).toBe('FAILED');

      // 4. Ghế HELD bị nhả
      const seatRecord = await knex('showtime_seats')
        .where({ showtime_id: 1, seat_id: seat3 })
        .first();
      expect(seatRecord).toBeUndefined();

      // Dọn dẹp
      await knex('showtime_seats').where({ order_id: orderAsisTimeout }).del();
      await knex('order_seats').where({ order_id: orderAsisTimeout }).del();
      await knex('order_status_history').where({ order_id: orderAsisTimeout }).del();
      await knex('orders').where({ order_id: orderAsisTimeout }).del();
    });

    it('in TOBE mode: should transition timed-out AWAITING_PAYMENT to PENDING_VERIFY, extend hold, and KEEP seats', async () => {
      // 1. Cấu hình mode = 'TOBE', callbackTimeoutSec = 15, pendingVerifyHoldMin = 15
      await knex('settings').insert([
        { key: 'mode', value: 'TOBE', updated_at: clock.nowIso() },
        { key: 'callbackTimeoutSec', value: '15', updated_at: clock.nowIso() },
        { key: 'pendingVerifyHoldMin', value: '15', updated_at: clock.nowIso() },
      ]).onConflict('key').merge();

      const nowMs = clock.nowMs();
      const oldUpdatedIso = new Date(nowMs - 30 * 1000).toISOString(); // 30s trước
      const initialHoldExp = new Date(nowMs + 2 * 60 * 1000).toISOString();

      await knex('orders').insert({
        order_id: orderTobeTimeout,
        user_id: 1,
        showtime_id: 1,
        status: 'AWAITING_PAYMENT',
        amount_tickets: 60000,
        amount_combos: 0,
        amount_total: 60000,
        customer_name: 'Khách Hàng',
        customer_phone: '0987654321',
        customer_email: 'khachhang@gmail.com',
        hold_expires_at: initialHoldExp,
        created_at: oldUpdatedIso,
        updated_at: oldUpdatedIso,
      });
      await knex('order_seats').insert({
        order_id: orderTobeTimeout,
        seat_id: seat4,
        seat_type: 'STANDARD',
        price: 60000,
      });
      await knex('showtime_seats').insert({
        showtime_id: 1,
        seat_id: seat4,
        state: 'HELD',
        order_id: orderTobeTimeout,
        held_until: initialHoldExp,
      }).onConflict(['showtime_id', 'seat_id']).merge();

      // 2. Chạy timeoutAwaiting (cô lập cho đơn test)
      const processed = await timeoutAwaiting(orderTobeTimeout);
      expect(processed).toContain(orderTobeTimeout);

      // 3. Đơn chuyển sang PENDING_VERIFY
      const order = await knex('orders').where({ order_id: orderTobeTimeout }).first();
      expect(order.status).toBe('PENDING_VERIFY');

      // 4. Hạn giữ ghế hold_expires_at được gia hạn (khoảng 15 phút từ now)
      const newHoldMs = new Date(order.hold_expires_at).getTime();
      expect(newHoldMs).toBeGreaterThan(nowMs + 14 * 60 * 1000);

      // 5. GIỮ ghế: Ghế HELD vẫn tồn tại trong showtime_seats với held_until mới
      const seatRecord = await knex('showtime_seats')
        .where({ showtime_id: 1, seat_id: seat4 })
        .first();
      expect(seatRecord).toBeDefined();
      expect(seatRecord.state).toBe('HELD');
      expect(new Date(seatRecord.held_until).getTime()).toBe(newHoldMs);

      // Dọn dẹp
      await knex('showtime_seats').where({ order_id: orderTobeTimeout }).del();
      await knex('order_seats').where({ order_id: orderTobeTimeout }).del();
      await knex('order_status_history').where({ order_id: orderTobeTimeout }).del();
      await knex('orders').where({ order_id: orderTobeTimeout }).del();

      // Trả lại settings về ASIS
      await knex('settings').insert([
        { key: 'mode', value: 'ASIS', updated_at: clock.nowIso() },
      ]).onConflict('key').merge();
    });
  });
});
