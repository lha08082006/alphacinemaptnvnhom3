'use strict';

const crypto = require('crypto');
const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');
const { env } = require('../src/config/env');

function signVnpayParams(params) {
  const sortedKeys = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort();

  const signData = sortedKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k])).replace(/%20/g, '+')}`)
    .join('&');

  const hash = crypto
    .createHmac('sha512', env.VNPAY_HASH_SECRET)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  return { ...params, vnp_SecureHash: hash };
}

describe('Step 5: VNPay IPN & Return Callback (applyGatewayResult)', () => {
  let app;

  const orderSuccess = 'BCIPN_ORD_01';
  const orderMismatch = 'BCIPN_ORD_02';
  const orderPendingVerify = 'BCIPN_ORD_03';
  const orderFailed = 'BCIPN_ORD_04';

  const txnSuccess = 'GW_IPN_TXN_01';
  const txnMismatch = 'GW_IPN_TXN_02';
  const txnPendingVerify = 'GW_IPN_TXN_03';
  const txnFailed = 'GW_IPN_TXN_04';
  const txnNonExistent = 'GW_NON_EXISTENT_TXN';

  beforeAll(async () => {
    app = createApp();

    const nowIso = new Date().toISOString();
    const futureExp = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Dọn dẹp dữ liệu cũ nếu có
    const orderIds = [orderSuccess, orderMismatch, orderPendingVerify, orderFailed];
    const txnIds = [txnSuccess, txnMismatch, txnPendingVerify, txnFailed, txnNonExistent];

    await knex('tickets').whereIn('order_id', orderIds).del();
    await knex('showtime_seats').whereIn('order_id', orderIds).del();
    await knex('support_tickets').whereIn('order_id', orderIds).del();
    await knex('webhook_events').whereIn('gateway_txn_id', txnIds).del();
    await knex('payment_attempts').whereIn('order_id', orderIds).del();
    await knex('order_status_history').whereIn('order_id', orderIds).del();
    await knex('orders').whereIn('order_id', orderIds).del();

    // 1. Tạo đơn 1: AWAITING_PAYMENT, 80,000 VND
    await knex('orders').insert({
      order_id: orderSuccess,
      user_id: 1,
      showtime_id: 1,
      status: 'AWAITING_PAYMENT',
      amount_tickets: 80000,
      amount_combos: 0,
      amount_total: 80000,
      customer_name: 'Khách Hàng',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: futureExp,
      current_attempt_id: 'ATT_IPN_01',
      created_at: nowIso,
      updated_at: nowIso,
    });
    await knex('payment_attempts').insert({
      attempt_id: 'ATT_IPN_01',
      order_id: orderSuccess,
      gateway_txn_id: txnSuccess,
      method: 'ATM',
      amount: 80000,
      status: 'REDIRECTED',
      idempotency_key: 'idemp_ipn_01',
      created_at: nowIso,
    });

    // 2. Tạo đơn 2: AWAITING_PAYMENT, 100,000 VND (dùng để test sai số tiền)
    await knex('orders').insert({
      order_id: orderMismatch,
      user_id: 1,
      showtime_id: 1,
      status: 'AWAITING_PAYMENT',
      amount_tickets: 100000,
      amount_combos: 0,
      amount_total: 100000,
      customer_name: 'Khách Hàng',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: futureExp,
      current_attempt_id: 'ATT_IPN_02',
      created_at: nowIso,
      updated_at: nowIso,
    });
    await knex('payment_attempts').insert({
      attempt_id: 'ATT_IPN_02',
      order_id: orderMismatch,
      gateway_txn_id: txnMismatch,
      method: 'ATM',
      amount: 100000,
      status: 'REDIRECTED',
      idempotency_key: 'idemp_ipn_02',
      created_at: nowIso,
    });

    // 3. Tạo đơn 3: PENDING_VERIFY, 120,000 VND (dùng để test callback muộn BR-10)
    await knex('orders').insert({
      order_id: orderPendingVerify,
      user_id: 1,
      showtime_id: 1,
      status: 'PENDING_VERIFY',
      amount_tickets: 120000,
      amount_combos: 0,
      amount_total: 120000,
      customer_name: 'Khách Hàng',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: futureExp,
      current_attempt_id: 'ATT_IPN_03',
      created_at: nowIso,
      updated_at: nowIso,
    });
    await knex('payment_attempts').insert({
      attempt_id: 'ATT_IPN_03',
      order_id: orderPendingVerify,
      gateway_txn_id: txnPendingVerify,
      method: 'ATM',
      amount: 120000,
      status: 'REDIRECTED',
      idempotency_key: 'idemp_ipn_03',
      created_at: nowIso,
    });

    // 4. Tạo đơn 4: AWAITING_PAYMENT, 50,000 VND (dùng để test cổng báo thất bại)
    await knex('orders').insert({
      order_id: orderFailed,
      user_id: 1,
      showtime_id: 1,
      status: 'AWAITING_PAYMENT',
      amount_tickets: 50000,
      amount_combos: 0,
      amount_total: 50000,
      customer_name: 'Khách Hàng',
      customer_phone: '0987654321',
      customer_email: 'khachhang@gmail.com',
      hold_expires_at: futureExp,
      current_attempt_id: 'ATT_IPN_04',
      created_at: nowIso,
      updated_at: nowIso,
    });
    await knex('payment_attempts').insert({
      attempt_id: 'ATT_IPN_04',
      order_id: orderFailed,
      gateway_txn_id: txnFailed,
      method: 'ATM',
      amount: 50000,
      status: 'REDIRECTED',
      idempotency_key: 'idemp_ipn_04',
      created_at: nowIso,
    });
  });

  afterAll(async () => {
    try {
      const orderIds = [orderSuccess, orderMismatch, orderPendingVerify, orderFailed];
      const txnIds = [txnSuccess, txnMismatch, txnPendingVerify, txnFailed, txnNonExistent];

      await knex('tickets').whereIn('order_id', orderIds).del();
      await knex('showtime_seats').whereIn('order_id', orderIds).del();
      await knex('support_tickets').whereIn('order_id', orderIds).del();
      await knex('webhook_events').whereIn('gateway_txn_id', txnIds).del();
      await knex('payment_attempts').whereIn('order_id', orderIds).del();
      await knex('order_status_history').whereIn('order_id', orderIds).del();
      await knex('orders').whereIn('order_id', orderIds).del();
    } catch (_e) {}
    await knex.destroy();
  });

  it('should return RspCode 97 when signature is invalid', async () => {
    const params = {
      vnp_TxnRef: txnSuccess,
      vnp_Amount: '8000000',
      vnp_ResponseCode: '00',
      vnp_SecureHash: 'invalid_checksum_hash_here',
    };

    const res = await request(app).get('/api/v1/payments/vnpay/ipn').query(params);

    expect(res.status).toBe(200);
    expect(res.body.RspCode).toBe('97');
    expect(res.body.Message).toBe('Checksum failed');
  });

  it('should return RspCode 01 when payment attempt is not found', async () => {
    const rawParams = {
      vnp_TxnRef: 'GW_NON_EXISTENT_TXN',
      vnp_Amount: '8000000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: '14111222',
      vnp_PayDate: '20261021200000',
      vnp_BankCode: 'NCB',
    };
    const signed = signVnpayParams(rawParams);

    const res = await request(app).get('/api/v1/payments/vnpay/ipn').query(signed);

    expect(res.status).toBe(200);
    expect(res.body.RspCode).toBe('01');
    expect(res.body.Message).toBe('Order not found');

    // Kiểm tra webhook_events được ghi nhận là REJECTED
    const event = await knex('webhook_events').where({ gateway_txn_id: 'GW_NON_EXISTENT_TXN' }).first();
    expect(event).toBeDefined();
    expect(event.result).toBe('REJECTED');
  });

  it('should return RspCode 04, create support_ticket and NOT change order when amount is mismatched', async () => {
    // Đơn hàng orderMismatch yêu cầu 100,000 VND nhưng cổng gửi về 70,000 VND (7,000,000)
    const rawParams = {
      vnp_TxnRef: txnMismatch,
      vnp_Amount: '7000000', // Lệch số tiền
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: '14222333',
      vnp_PayDate: '20261021200000',
      vnp_BankCode: 'NCB',
    };
    const signed = signVnpayParams(rawParams);

    const res = await request(app).get('/api/v1/payments/vnpay/ipn').query(signed);

    expect(res.status).toBe(200);
    expect(res.body.RspCode).toBe('04');
    expect(res.body.Message).toBe('Invalid amount');

    // 1. Kiểm tra đơn hàng KHÔNG bị đổi trạng thái (vẫn AWAITING_PAYMENT)
    const order = await knex('orders').where({ order_id: orderMismatch }).first();
    expect(order.status).toBe('AWAITING_PAYMENT');

    // 2. Kiểm tra webhook_events được ghi là REJECTED
    const event = await knex('webhook_events').where({ gateway_txn_id: txnMismatch }).first();
    expect(event).toBeDefined();
    expect(event.result).toBe('REJECTED');

    // 3. Kiểm tra support_tickets được tạo với source 'SYSTEM'
    const ticket = await knex('support_tickets').where({ order_id: orderMismatch }).first();
    expect(ticket).toBeDefined();
    expect(ticket.source).toBe('SYSTEM');
    expect(ticket.status).toBe('NEW');
    expect(ticket.resolution).toContain('Lệch số tiền thanh toán VNPay');
  });

  it('should process successful IPN: transition to PAID, attempt to SUCCESS, issue ticket, and return RspCode 00', async () => {
    const rawParams = {
      vnp_TxnRef: txnSuccess,
      vnp_Amount: '8000000', // 80,000 VND
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: '14333444',
      vnp_PayDate: '20261021200000',
      vnp_BankCode: 'NCB',
    };
    const signed = signVnpayParams(rawParams);

    const res = await request(app).get('/api/v1/payments/vnpay/ipn').query(signed);

    expect(res.status).toBe(200);
    expect(res.body.RspCode).toBe('00');
    expect(res.body.Message).toBe('Confirm Success');

    // 1. Kiểm tra đơn hàng đã sang PAID
    const order = await knex('orders').where({ order_id: orderSuccess }).first();
    expect(order.status).toBe('PAID');
    expect(order.paid_at).toBeDefined();

    // 2. Kiểm tra payment_attempts chuyển sang SUCCESS và lưu thông tin cổng
    const attempt = await knex('payment_attempts').where({ gateway_txn_id: txnSuccess }).first();
    expect(attempt.status).toBe('SUCCESS');
    expect(attempt.gateway_trans_no).toBe('14333444');
    expect(attempt.gateway_response_code).toBe('00');
    expect(attempt.bank_code).toBe('NCB');

    // 3. Kiểm tra webhook_events ghi nhận 'APPLIED'
    const event = await knex('webhook_events').where({ gateway_txn_id: txnSuccess }).first();
    expect(event.result).toBe('APPLIED');

    // 4. Kiểm tra vé được xuất trong bảng tickets
    const ticket = await knex('tickets').where({ order_id: orderSuccess }).first();
    expect(ticket).toBeDefined();
    expect(ticket.status).toBe('VALID');
  });

  it('should return RspCode 02 and not change anything when IPN is called a second time (idempotency)', async () => {
    const rawParams = {
      vnp_TxnRef: txnSuccess,
      vnp_Amount: '8000000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: '14333444',
      vnp_PayDate: '20261021200000',
      vnp_BankCode: 'NCB',
    };
    const signed = signVnpayParams(rawParams);

    const res = await request(app).get('/api/v1/payments/vnpay/ipn').query(signed);

    expect(res.status).toBe(200);
    expect(res.body.RspCode).toBe('02');
    expect(res.body.Message).toBe('Order already confirmed');

    // Kiểm tra đơn vẫn là PAID
    const order = await knex('orders').where({ order_id: orderSuccess }).first();
    expect(order.status).toBe('PAID');
  });

  it('should handle callback when order is PENDING_VERIFY -> transitions to PAID with result LATE_APPLIED (BR-10)', async () => {
    const rawParams = {
      vnp_TxnRef: txnPendingVerify,
      vnp_Amount: '12000000', // 120,000 VND
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: '14444555',
      vnp_PayDate: '20261021200000',
      vnp_BankCode: 'NCB',
    };
    const signed = signVnpayParams(rawParams);

    const res = await request(app).get('/api/v1/payments/vnpay/ipn').query(signed);

    expect(res.status).toBe(200);
    expect(res.body.RspCode).toBe('00');

    // 1. Kiểm tra đơn hàng PENDING_VERIFY đã sang PAID
    const order = await knex('orders').where({ order_id: orderPendingVerify }).first();
    expect(order.status).toBe('PAID');

    // 2. Kiểm tra webhook_events ghi nhận 'LATE_APPLIED'
    const event = await knex('webhook_events').where({ gateway_txn_id: txnPendingVerify }).first();
    expect(event.result).toBe('LATE_APPLIED');

    // 3. Kiểm tra vé được xuất
    const ticket = await knex('tickets').where({ order_id: orderPendingVerify }).first();
    expect(ticket).toBeDefined();
    expect(ticket.status).toBe('VALID');
  });

  it('should handle failed gateway transaction: transition order to FAILED', async () => {
    const rawParams = {
      vnp_TxnRef: txnFailed,
      vnp_Amount: '5000000',
      vnp_ResponseCode: '24', // Khách hàng hủy giao dịch
      vnp_TransactionStatus: '02',
      vnp_TransactionNo: '14555666',
      vnp_PayDate: '20261021200000',
      vnp_BankCode: 'NCB',
    };
    const signed = signVnpayParams(rawParams);

    const res = await request(app).get('/api/v1/payments/vnpay/ipn').query(signed);

    expect(res.status).toBe(200);
    expect(res.body.RspCode).toBe('00');

    // 1. Kiểm tra đơn hàng AWAITING_PAYMENT đã sang FAILED
    const order = await knex('orders').where({ order_id: orderFailed }).first();
    expect(order.status).toBe('FAILED');

    // 2. Kiểm tra attempt đã sang FAILED
    const attempt = await knex('payment_attempts').where({ gateway_txn_id: txnFailed }).first();
    expect(attempt.status).toBe('FAILED');
    expect(attempt.gateway_response_code).toBe('24');
  });

  it('GET /payments/vnpay/return should redirect to result.html with orderId and responseCode', async () => {
    const rawParams = {
      vnp_TxnRef: txnSuccess,
      vnp_Amount: '8000000',
      vnp_ResponseCode: '00',
      vnp_TransactionNo: '14333444',
      vnp_BankCode: 'NCB',
    };
    const signed = signVnpayParams(rawParams);

    const res = await request(app).get('/api/v1/payments/vnpay/return').query(signed);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/result.html');
    expect(res.headers.location).toContain(`orderId=${orderSuccess}`);
    expect(res.headers.location).toContain('responseCode=00');
  });
});
