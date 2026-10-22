'use strict';

const request = require('supertest');
const crypto = require('crypto');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');
const { getSepayClient, createOneTimePaymentCheckout, verifyWebhookSignature } = require('../src/lib/sepay');
const { env } = require('../src/config/env');

describe('SePay Gateway Integration (SDK, Payment Session & IPN)', () => {
  let app;
  let user1Cookie;
  let user2Cookie;

  const orderSepaySuccess = 'BCSEPAY001';
  const orderSepayMismatch = 'BCSEPAY002';
  const orderSepayLate = 'BCSEPAY003';
  const orderSepayExpired = 'BCSEPAY004';
  const orderSepayFail = 'BCSEPAY005';
  const orderSepayMainRoute = 'BCSEPAY006';
  const orderSepayRefundBR07 = 'BCSEPAY007';

  beforeAll(async () => {
    app = createApp();

    // 1. Đăng nhập user 1 (khachhang@gmail.com, id: 1)
    const login1 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang@gmail.com', password: 'Password@123' });
    user1Cookie = login1.headers['set-cookie'];

    // 2. Đăng nhập user 2 (khachhang2@gmail.com, id: 2)
    const login2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang2@gmail.com', password: 'Password@123' });
    user2Cookie = login2.headers['set-cookie'];

    const testOrders = [
      orderSepaySuccess,
      orderSepayMismatch,
      orderSepayLate,
      orderSepayExpired,
      orderSepayFail,
      orderSepayMainRoute,
      orderSepayRefundBR07,
    ];

    // Dọn dẹp CSDL test
    await knex('refunds').whereIn('order_id', testOrders).del();
    await knex('support_tickets').whereIn('order_id', testOrders).del();
    await knex('webhook_events').whereIn('gateway_txn_id', [...testOrders, 'NON_EXISTENT_ORDER']).orWhere('event_id', 'like', '%NON_EXISTENT_ORDER%').orWhere('event_id', 'like', '%BCSEPAY%').del();
    await knex('tickets').whereIn('order_id', testOrders).del();
    await knex('showtime_seats').whereIn('order_id', testOrders).orWhereIn('seat_id', [1050, 1051, 1052]).del();
    await knex('payment_attempts').whereIn('order_id', testOrders).del();
    await knex('order_status_history').whereIn('order_id', testOrders).del();
    await knex('order_seats').whereIn('order_id', testOrders).del();
    await knex('orders').whereIn('order_id', testOrders).del();

    const futureExp = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const pastExp = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    // Chuẩn bị đơn hàng 1: HOLDING, user 1, 90.000 VND
    await knex('orders').insert({
      order_id: orderSepaySuccess,
      user_id: 1,
      showtime_id: 1,
      status: 'HOLDING',
      amount_tickets: 90000,
      amount_combos: 0,
      amount_total: 90000,
      customer_name: 'Khách Hàng',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: futureExp,
      created_at: nowIso,
      updated_at: nowIso,
    });
    await knex('order_seats').insert({
      order_id: orderSepaySuccess,
      seat_id: 1050,
      seat_type: 'STANDARD',
      price: 90000,
    });
    await knex('showtime_seats').insert({
      showtime_id: 1,
      seat_id: 1050,
      state: 'HELD',
      order_id: orderSepaySuccess,
      held_until: futureExp,
    });

    // Chuẩn bị đơn hàng 2: HOLDING, user 1, 120.000 VND (dùng test lệch tiền)
    await knex('orders').insert({
      order_id: orderSepayMismatch,
      user_id: 1,
      showtime_id: 1,
      status: 'HOLDING',
      amount_tickets: 120000,
      amount_combos: 0,
      amount_total: 120000,
      customer_name: 'Khách Hàng',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: futureExp,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // Chuẩn bị đơn hàng 3: PENDING_VERIFY, user 1, 80.000 VND (dùng test callback muộn BR-10)
    await knex('orders').insert({
      order_id: orderSepayLate,
      user_id: 1,
      showtime_id: 1,
      status: 'PENDING_VERIFY',
      amount_tickets: 80000,
      amount_combos: 0,
      amount_total: 80000,
      customer_name: 'Khách Hàng',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: futureExp,
      created_at: nowIso,
      updated_at: nowIso,
    });
    await knex('payment_attempts').insert({
      attempt_id: 'ATT_SEPAY_LATE_01',
      order_id: orderSepayLate,
      gateway_txn_id: orderSepayLate,
      method: 'BANK_TRANSFER',
      amount: 80000,
      status: 'REDIRECTED',
      idempotency_key: 'IDEMP_SEPAY_LATE_01',
      created_at: nowIso,
    });
    await knex('order_seats').insert({
      order_id: orderSepayLate,
      seat_id: 1051,
      seat_type: 'STANDARD',
      price: 80000,
    });
    await knex('showtime_seats').insert({
      showtime_id: 1,
      seat_id: 1051,
      state: 'HELD',
      order_id: orderSepayLate,
      held_until: futureExp,
    });

    // Chuẩn bị đơn hàng 4: Quá hạn giữ chỗ
    await knex('orders').insert({
      order_id: orderSepayExpired,
      user_id: 1,
      showtime_id: 1,
      status: 'HOLDING',
      amount_tickets: 70000,
      amount_combos: 0,
      amount_total: 70000,
      customer_name: 'Khách Hàng',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: pastExp,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // Chuẩn bị đơn hàng 5: Test gateway báo thất bại
    await knex('orders').insert({
      order_id: orderSepayFail,
      user_id: 1,
      showtime_id: 1,
      status: 'HOLDING',
      amount_tickets: 95000,
      amount_combos: 0,
      amount_total: 95000,
      customer_name: 'Khách Hàng',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: futureExp,
      created_at: nowIso,
      updated_at: nowIso,
    });
    await knex('order_seats').insert({
      order_id: orderSepayFail,
      seat_id: 1052,
      seat_type: 'STANDARD',
      price: 95000,
    });
    await knex('showtime_seats').insert({
      showtime_id: 1,
      seat_id: 1052,
      state: 'HELD',
      order_id: orderSepayFail,
      held_until: futureExp,
    });

    // Chuẩn bị đơn hàng 6: Test qua route chính POST /payments
    await knex('orders').insert({
      order_id: orderSepayMainRoute,
      user_id: 1,
      showtime_id: 1,
      status: 'HOLDING',
      amount_tickets: 110000,
      amount_combos: 0,
      amount_total: 110000,
      customer_name: 'Khách Hàng',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: futureExp,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // Chuẩn bị đơn hàng 7: Đơn hàng EXPIRED có payment attempt để test BR-07 hoàn tiền tự động khi callback muộn
    await knex('orders').insert({
      order_id: orderSepayRefundBR07,
      user_id: 1,
      showtime_id: 1,
      status: 'EXPIRED',
      amount_tickets: 60000,
      amount_combos: 0,
      amount_total: 60000,
      customer_name: 'Khách Hàng',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: pastExp,
      created_at: nowIso,
      updated_at: nowIso,
    });
    await knex('payment_attempts').insert({
      attempt_id: 'ATT_SEPAY_EXP_01',
      order_id: orderSepayRefundBR07,
      gateway_txn_id: orderSepayRefundBR07,
      method: 'BANK_TRANSFER',
      amount: 60000,
      status: 'REDIRECTED',
      idempotency_key: 'IDEMP_SEPAY_EXP_01',
      created_at: nowIso,
    });
  });

  afterAll(async () => {
    try {
      const testOrders = [
        orderSepaySuccess,
        orderSepayMismatch,
        orderSepayLate,
        orderSepayExpired,
        orderSepayFail,
        orderSepayMainRoute,
        orderSepayRefundBR07,
      ];
      await knex('refunds').whereIn('order_id', testOrders).del();
      await knex('support_tickets').whereIn('order_id', testOrders).del();
      await knex('webhook_events').whereIn('gateway_txn_id', testOrders).del();
      await knex('tickets').whereIn('order_id', testOrders).del();
      await knex('showtime_seats').whereIn('order_id', testOrders).orWhereIn('seat_id', [1050, 1051, 1052]).del();
      await knex('payment_attempts').whereIn('order_id', testOrders).del();
      await knex('order_status_history').whereIn('order_id', testOrders).del();
      await knex('order_seats').whereIn('order_id', testOrders).del();
      await knex('orders').whereIn('order_id', testOrders).del();
    } catch (_e) {}
    await knex.destroy();
  });

  describe('R1. SePay SDK & Configuration', () => {
    it('should initialize SePay client with sandbox credentials', () => {
      const client = getSepayClient();
      expect(client).toBeDefined();
      expect(client.config.merchant_id).toBe('SP-TEST-LH272A54');
      expect(client.config.secret_key).toBe('spsk_test_QmTCuBKcB4kdQvMX6mNAT3jZ2BWESmML');
      expect(client.config.env).toBe('sandbox');
      expect(client.checkout).toBeDefined();
      expect(typeof client.checkout.initCheckoutUrl).toBe('function');
      expect(typeof client.checkout.initOneTimePaymentFields).toBe('function');
    });

    it('should generate valid sandbox checkout URL and signed fields', () => {
      const checkout = createOneTimePaymentCheckout({
        orderInvoiceNumber: 'INV_TEST_999',
        orderAmount: 90000,
        orderDescription: 'Test payment',
      });

      expect(checkout.checkoutUrl).toContain('pay-sandbox.sepay.vn');
      expect(checkout.fields).toBeDefined();
      expect(checkout.fields.merchant).toBe('SP-TEST-LH272A54');
      expect(checkout.fields.operation).toBe('PURCHASE');
      expect(checkout.fields.payment_method).toBe('BANK_TRANSFER');
      expect(checkout.fields.order_amount).toBe(90000);
      expect(checkout.fields.currency).toBe('VND');
      expect(checkout.fields.order_invoice_number).toBe('INV_TEST_999');
      expect(checkout.fields.signature).toBeDefined();
      expect(typeof checkout.fields.signature).toBe('string');
    });
  });

  describe('R2. API Tạo Phiên Thanh Toán SePay', () => {
    it('should require authentication (401 AUTH_REQUIRED)', async () => {
      const res = await request(app)
        .post('/api/v1/payments/sepay')
        .send({ orderId: orderSepaySuccess });

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    it('should reject when order does not belong to user (404 NOT_FOUND)', async () => {
      const res = await request(app)
        .post('/api/v1/payments/sepay')
        .set('Cookie', user2Cookie) // User 2 không sở hữu orderSepaySuccess
        .send({ orderId: orderSepaySuccess });

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should reject when order hold time has expired (410 HOLD_EXPIRED)', async () => {
      const res = await request(app)
        .post('/api/v1/payments/sepay')
        .set('Cookie', user1Cookie)
        .send({ orderId: orderSepayExpired });

      expect(res.status).toBe(410);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('HOLD_EXPIRED');
    });

    it('should create SePay payment session successfully and transition order to AWAITING_PAYMENT', async () => {
      const idempotencyKey = 'IDEMP_SEPAY_SUCCESS_01';

      const res = await request(app)
        .post('/api/v1/payments/sepay')
        .set('Cookie', user1Cookie)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          orderId: orderSepaySuccess,
          paymentMethod: 'BANK_TRANSFER',
          termsAccepted: true,
          termsVersion: 'v1.0',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toBeDefined();

      const { attemptId, orderId, checkoutUrl, fields, paymentUrl } = res.body.data;
      expect(attemptId).toBeDefined();
      expect(attemptId.startsWith('ATT_')).toBe(true);
      expect(orderId).toBe(orderSepaySuccess);
      expect(checkoutUrl).toContain('pay-sandbox.sepay.vn');
      expect(paymentUrl).toBe(checkoutUrl);

      // Kiểm tra các trường signed
      expect(fields.merchant).toBe('SP-TEST-LH272A54');
      expect(fields.operation).toBe('PURCHASE');
      expect(fields.payment_method).toBe('BANK_TRANSFER');
      expect(fields.order_invoice_number).toBe(orderSepaySuccess);
      expect(fields.order_amount).toBe(90000);
      expect(fields.currency).toBe('VND');
      expect(fields.signature).toBeDefined();

      // Kiểm tra CSDL: payment_attempts
      const attempt = await knex('payment_attempts').where({ attempt_id: attemptId }).first();
      expect(attempt).toBeDefined();
      expect(attempt.order_id).toBe(orderSepaySuccess);
      expect(attempt.gateway_txn_id).toBe(orderSepaySuccess);
      expect(attempt.method).toBe('BANK_TRANSFER');
      expect(attempt.amount).toBe(90000); // Integer VND
      expect(attempt.status).toBe('REDIRECTED');

      // Kiểm tra CSDL: orders chuyển sang AWAITING_PAYMENT
      const updatedOrder = await knex('orders').where({ order_id: orderSepaySuccess }).first();
      expect(updatedOrder.status).toBe('AWAITING_PAYMENT');
      expect(updatedOrder.current_attempt_id).toBe(attemptId);
      expect(updatedOrder.payment_method).toBe('BANK_TRANSFER');

      // Kiểm tra CSDL: order_status_history
      const history = await knex('order_status_history')
        .where({ order_id: orderSepaySuccess, to_status: 'AWAITING_PAYMENT' })
        .first();
      expect(history).toBeDefined();
      expect(history.from_status).toBe('HOLDING');
      expect(history.actor_type).toBe('USER');
    });

    it('should return existing payment session when same Idempotency-Key is reused for same order', async () => {
      const idempotencyKey = 'IDEMP_SEPAY_SUCCESS_01';

      const res = await request(app)
        .post('/api/v1/payments/sepay')
        .set('Cookie', user1Cookie)
        .set('Idempotency-Key', idempotencyKey)
        .send({ orderId: orderSepaySuccess });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.orderId).toBe(orderSepaySuccess);
      expect(res.body.data.checkoutUrl).toBeDefined();
    });

    it('should support creating SePay payment through main POST /payments with method=BANK_TRANSFER', async () => {
      const idempotencyKey = 'IDEMP_SEPAY_MAIN_ROUTE_01';

      const res = await request(app)
        .post('/api/v1/payments')
        .set('Cookie', user1Cookie)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          orderId: orderSepayMainRoute,
          method: 'BANK_TRANSFER',
          termsAccepted: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.orderId).toBe(orderSepayMainRoute);
      expect(res.body.data.checkoutUrl).toContain('pay-sandbox.sepay.vn');
      expect(res.body.data.fields.payment_method).toBe('BANK_TRANSFER');
      expect(res.body.data.fields.order_amount).toBe(110000);

      const order = await knex('orders').where({ order_id: orderSepayMainRoute }).first();
      expect(order.status).toBe('AWAITING_PAYMENT');
    });
  });

  describe('R3. Webhook / IPN Listener SePay', () => {
    it('should reject IPN with invalid signature header (401)', async () => {
      const payload = {
        order_invoice_number: orderSepaySuccess,
        order_amount: 90000,
        transaction_status: 'SUCCESS',
        sepay_transaction_id: 'SP_TXN_001',
      };

      const res = await request(app)
        .post('/api/v1/payments/sepay/ipn')
        .set('X-SePay-Signature', 'sha256=invalid_hash_1234567890abcdef')
        .set('X-SePay-Timestamp', '1757058220')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid signature');

      // Kiểm tra webhook_events ghi nhận REJECTED
      const event = await knex('webhook_events')
        .where({ gateway_txn_id: orderSepaySuccess, signature_valid: false })
        .first();
      expect(event).toBeDefined();
      expect(event.result).toBe('REJECTED');
    });

    it('should reject IPN when order is not found (Order not found)', async () => {
      await knex('webhook_events').where({ gateway_txn_id: 'NON_EXISTENT_ORDER' }).del();
      const payload = {
        order_invoice_number: 'NON_EXISTENT_ORDER',
        order_amount: 90000,
        transaction_status: 'SUCCESS',
        sepay_transaction_id: 'SP_TXN_NOT_FOUND',
      };

      const res = await request(app)
        .post('/api/v1/payments/sepay/ipn')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Order not found');

      const event = await knex('webhook_events')
        .where({ gateway_txn_id: 'NON_EXISTENT_ORDER' })
        .first();
      expect(event).toBeDefined();
      expect(event.result).toBe('REJECTED');
      expect(event.reject_reason).toBe('Order not found');
    });

    it('should reject IPN and create support_ticket when payment amount mismatches', async () => {
      // Khởi tạo attempt cho orderSepayMismatch (yêu cầu 120,000 VND)
      await request(app)
        .post('/api/v1/payments/sepay')
        .set('Cookie', user1Cookie)
        .set('Idempotency-Key', 'IDEMP_SEPAY_MISMATCH_01')
        .send({ orderId: orderSepayMismatch });

      // Cổng gửi IPN số tiền 80,000 VND (lệch tiền)
      const payload = {
        order_invoice_number: orderSepayMismatch,
        order_amount: 80000,
        transaction_status: 'SUCCESS',
        sepay_transaction_id: 'SP_TXN_MISMATCH_01',
      };

      const res = await request(app)
        .post('/api/v1/payments/sepay/ipn')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid amount');

      // Đơn hàng KHÔNG được chuyển trạng thái sang PAID
      const order = await knex('orders').where({ order_id: orderSepayMismatch }).first();
      expect(order.status).toBe('AWAITING_PAYMENT');

      // Đã tự động tạo support_tickets nguồn SYSTEM
      const ticket = await knex('support_tickets')
        .where({ order_id: orderSepayMismatch, source: 'SYSTEM' })
        .first();
      expect(ticket).toBeDefined();
      expect(ticket.status).toBe('NEW');
      expect(ticket.resolution).toContain('Lệch số tiền thanh toán SePay');

      // Webhook_events ghi nhận REJECTED
      const event = await knex('webhook_events')
        .where({ gateway_txn_id: orderSepayMismatch, result: 'REJECTED' })
        .first();
      expect(event).toBeDefined();
      expect(event.reject_reason).toContain('Số tiền thanh toán lệch');
    });

    it('should process successful SePay IPN (nested payload): transition to PAID, issue ticket, update seats to SOLD', async () => {
      const transNo = 'SEPAY_TRANS_998811';
      const rawPayload = {
        timestamp: 1757058220,
        notification_type: 'ORDER_PAID',
        order: {
          id: 'sp_order_uuid_123',
          order_id: 'SP_EXT_01',
          order_status: 'CAPTURED',
          order_currency: 'VND',
          order_amount: 90000,
          order_invoice_number: orderSepaySuccess,
        },
        transaction: {
          id: transNo,
          payment_method: 'BANK_TRANSFER',
          transaction_amount: 90000,
          transaction_currency: 'VND',
          transaction_status: 'APPROVED',
          transaction_date: '2026-10-22 17:00:00',
        },
      };

      // Sinh chữ ký hợp lệ để kiểm thử xác thực chữ ký
      const rawBodyStr = JSON.stringify(rawPayload);
      const timestamp = '1757058220';
      const hmacHash = crypto
        .createHmac('sha256', env.SEPAY_SECRET_KEY)
        .update(`${timestamp}.${rawBodyStr}`)
        .digest('hex');

      const res = await request(app)
        .post('/api/v1/payments/sepay/ipn')
        .set('X-SePay-Signature', `sha256=${hmacHash}`)
        .set('X-SePay-Timestamp', timestamp)
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.result).toBe('APPLIED');

      // 1. Kiểm tra đơn hàng đã sang PAID và cập nhật paid_at
      const order = await knex('orders').where({ order_id: orderSepaySuccess }).first();
      expect(order.status).toBe('PAID');
      expect(order.paid_at).toBeDefined();
      expect(order.payment_method).toBe('BANK_TRANSFER');

      // 2. Kiểm tra order_status_history
      const history = await knex('order_status_history')
        .where({ order_id: orderSepaySuccess, to_status: 'PAID' })
        .first();
      expect(history).toBeDefined();
      expect(history.actor_type).toBe('GATEWAY');
      expect(history.reason).toContain('SePay');

      // 3. Kiểm tra payment_attempts cập nhật thành SUCCESS
      const attempt = await knex('payment_attempts').where({ order_id: orderSepaySuccess }).first();
      expect(attempt.status).toBe('SUCCESS');
      expect(attempt.gateway_trans_no).toBe(transNo);
      expect(attempt.bank_code).toBe('BANK_TRANSFER');

      // 4. Kiểm tra vé đã được xuất (CS...)
      const ticket = await knex('tickets').where({ order_id: orderSepaySuccess }).first();
      expect(ticket).toBeDefined();
      expect(ticket.ticket_id.startsWith('CS')).toBe(true);
      expect(ticket.status).toBe('VALID');

      // 5. Kiểm tra ghế đã chuyển sang SOLD
      const seat = await knex('showtime_seats')
        .where({ order_id: orderSepaySuccess, seat_id: 1050 })
        .first();
      expect(seat).toBeDefined();
      expect(seat.state).toBe('SOLD');
      expect(seat.held_until).toBeNull();
    });

    it('should return duplicate status and not re-process when IPN is delivered a second time (idempotency)', async () => {
      const rawPayload = {
        notification_type: 'ORDER_PAID',
        order: {
          order_invoice_number: orderSepaySuccess,
          order_amount: 90000,
          order_status: 'CAPTURED',
        },
        transaction: {
          id: 'SEPAY_TRANS_998811',
          transaction_amount: 90000,
          transaction_status: 'APPROVED',
        },
      };

      const res = await request(app)
        .post('/api/v1/payments/sepay/ipn')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.duplicate).toBe(true);
      expect(res.body.message).toBe('Order already confirmed');

      // Không xuất hiện thêm bản ghi vé nào
      const tickets = await knex('tickets').where({ order_id: orderSepaySuccess });
      expect(tickets.length).toBe(1);
    });

    it('should handle callback when order is PENDING_VERIFY -> transitions to PAID with LATE_APPLIED (BR-10)', async () => {
      const transNo = 'SEPAY_LATE_TXN_5544';
      const payload = {
        order_invoice_number: orderSepayLate,
        order_amount: 80000,
        transaction_status: 'SUCCESS',
        sepay_transaction_id: transNo,
      };

      const res = await request(app)
        .post('/api/v1/payments/sepay/ipn')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.result).toBe('LATE_APPLIED');

      // Đơn hàng chuyển sang PAID
      const order = await knex('orders').where({ order_id: orderSepayLate }).first();
      expect(order.status).toBe('PAID');

      // Đã xuất vé
      const ticket = await knex('tickets').where({ order_id: orderSepayLate }).first();
      expect(ticket).toBeDefined();

      // Ghế chuyển sang SOLD
      const seat = await knex('showtime_seats')
        .where({ order_id: orderSepayLate, seat_id: 1051 })
        .first();
      expect(seat).toBeDefined();
      expect(seat.state).toBe('SOLD');
    });

    it('should handle failed gateway transaction: transition order to FAILED and release seats', async () => {
      // Khởi tạo attempt cho orderSepayFail
      await request(app)
        .post('/api/v1/payments/sepay')
        .set('Cookie', user1Cookie)
        .set('Idempotency-Key', 'IDEMP_SEPAY_FAIL_01')
        .send({ orderId: orderSepayFail });

      const payload = {
        order_invoice_number: orderSepayFail,
        order_amount: 95000,
        transaction_status: 'FAILED',
        sepay_transaction_id: 'SEPAY_FAIL_TXN_01',
      };

      const res = await request(app)
        .post('/api/v1/payments/sepay/ipn')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Đơn hàng chuyển sang FAILED
      const order = await knex('orders').where({ order_id: orderSepayFail }).first();
      expect(order.status).toBe('FAILED');

      // Ghế HELD đã được nhả
      const heldSeat = await knex('showtime_seats')
        .where({ order_id: orderSepayFail, state: 'HELD' })
        .first();
      expect(heldSeat).toBeUndefined();

      // Payment attempt chuyển sang FAILED
      const attempt = await knex('payment_attempts').where({ order_id: orderSepayFail }).first();
      expect(attempt.status).toBe('FAILED');
    });

    it('GET /payments/sepay/return should redirect to result.html with orderId and status', async () => {
      const res = await request(app)
        .get('/api/v1/payments/sepay/return')
        .query({ order_invoice_number: orderSepaySuccess, status: 'success' });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/result.html');
      expect(res.headers.location).toContain(`orderId=${orderSepaySuccess}`);
      expect(res.headers.location).toContain('gateway=sepay');
      expect(res.headers.location).toContain('status=success');
    });

    it('should handle repeated rejected IPN gracefully without crashing on unique event_id constraint', async () => {
      // Gửi IPN lệch tiền lần 1
      const payload = {
        order_invoice_number: orderSepayMismatch,
        order_amount: 50000,
        transaction_status: 'SUCCESS',
        sepay_transaction_id: 'SP_TXN_RETRY_REJECT_01',
      };

      const res1 = await request(app)
        .post('/api/v1/payments/sepay/ipn')
        .send(payload);

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(false);
      expect(res1.body.message).toBe('Invalid amount');

      // Gửi lại IPN cùng payload lần 2 (SePay retry khi mạng gián đoạn)
      const res2 = await request(app)
        .post('/api/v1/payments/sepay/ipn')
        .send(payload);

      // Phải trả về kết quả lỗi hợp lệ, KHÔNG văng 500 do SQLite UNIQUE constraint
      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(false);
      expect(res2.body.message).toBe('Invalid amount');
    });

    it('should accept uppercase hex signature in X-SePay-Signature (case-insensitive)', async () => {
      const payload = {
        order_invoice_number: orderSepayLate,
        order_amount: 80000,
        transaction_status: 'SUCCESS',
        sepay_transaction_id: 'SP_UPPER_HEX_TXN',
      };
      const timestamp = '1757058220';
      const rawBodyStr = JSON.stringify(payload);
      const hmacHash = crypto
        .createHmac('sha256', env.SEPAY_SECRET_KEY)
        .update(`${timestamp}.${rawBodyStr}`)
        .digest('hex')
        .toUpperCase(); // Chữ ký in hoa

      const res = await request(app)
        .post('/api/v1/payments/sepay/ipn')
        .set('X-SePay-Signature', `sha256=${hmacHash}`)
        .set('X-SePay-Timestamp', timestamp)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should parse real SePay gateway payload with transfer_amount string and gateway name', async () => {
      const transNo = 'SEPAY_REAL_GATEWAY_TXN_01';
      const realPayload = {
        notification_type: 'ORDER_PAID',
        order: {
          order_invoice_number: orderSepayMainRoute,
          order_amount: '110000.00', // Định dạng chuỗi thập phân thực tế từ SePay
          order_status: 'CAPTURED',
        },
        transaction: {
          id: transNo,
          gateway: 'Vietcombank', // Tên ngân hàng thực tế
          transfer_amount: '110000.00',
          transfer_type: 'in',
          transaction_date: '2026-10-22 17:15:00',
        },
      };

      const res = await request(app)
        .post('/api/v1/payments/sepay/ipn')
        .send(realPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const attempt = await knex('payment_attempts').where({ order_id: orderSepayMainRoute }).first();
      expect(attempt.status).toBe('SUCCESS');
      expect(attempt.bank_code).toBe('Vietcombank');
      expect(attempt.gateway_trans_no).toBe(transNo);
    });

    it('should evaluate and create auto refund (BR-07) when receiving late payment for an EXPIRED order', async () => {
      const transNo = 'SEPAY_LATE_EXP_TXN_01';
      const payload = {
        notification_type: 'ORDER_PAID',
        order: {
          order_invoice_number: orderSepayRefundBR07,
          order_amount: 60000,
          order_status: 'CAPTURED',
        },
        transaction: {
          id: transNo,
          transfer_amount: 60000,
          transaction_status: 'APPROVED',
        },
      };

      const res = await request(app)
        .post('/api/v1/payments/sepay/ipn')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.result).toBe('LATE_APPLIED');

      // Kiểm tra bảng refunds: đã kích hoạt quy tắc BR-07 tự động tạo lệnh hoàn tiền
      const refund = await knex('refunds').where({ order_id: orderSepayRefundBR07 }).first();
      expect(refund).toBeDefined();
      expect(refund.type).toBe('AUTO');
      expect(refund.amount).toBe(60000);

      // Đơn hàng chuyển sang REFUND_PENDING
      const order = await knex('orders').where({ order_id: orderSepayRefundBR07 }).first();
      expect(order.status).toBe('REFUND_PENDING');
    });

    it('should verify signature against raw body bytes when rawBody is present', async () => {
      const payload = {
        order_invoice_number: orderSepaySuccess,
        order_amount: 90000,
        transaction_status: 'SUCCESS',
        sepay_transaction_id: 'SP_TXN_RAW_TEST_01',
      };
      const timestamp = '1757058220';
      const rawBody = JSON.stringify(payload);
      const hmacHash = crypto
        .createHmac('sha256', env.SEPAY_SECRET_KEY)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

      const res = await request(app)
        .post('/api/v1/payments/sepay/ipn')
        .set('Content-Type', 'application/json')
        .set('X-SePay-Signature', `sha256=${hmacHash}`)
        .set('X-SePay-Timestamp', timestamp)
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
