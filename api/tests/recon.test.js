'use strict';

const knex = require('../src/db/knex');
const clock = require('../src/lib/clock');
const { runRecon } = require('../src/services/reconService');

describe('Step 8: Recon Service & runRecon', () => {
  const oMatched = 'BC_RECON_MATCHED';
  const oLateCallback = 'BC_RECON_LATE';
  const oNoTicketAuto = 'BC_RECON_NT_AUTO';
  const oNoTicketFlag = 'BC_RECON_NT_FLAG';
  const oAmountMismatch = 'BC_RECON_MISMATCH';
  const oGwFailed = 'BC_RECON_GW_FAIL';
  const oAlreadyHandled = 'BC_RECON_HANDLED';
  const oNetErr = 'BC_RECON_NET_ERR';

  const tMatched = 'GW_RECON_MATCHED';
  const tLateCallback = 'GW_RECON_LATE';
  const tNoTicketAuto = 'GW_RECON_NT_AUTO';
  const tNoTicketFlag = 'GW_RECON_NT_FLAG';
  const tAmountMismatch = 'GW_RECON_MISMATCH';
  const tGwFailed = 'GW_RECON_GW_FAIL';
  const tAlreadyHandled = 'GW_RECON_HANDLED';
  const tNetErr = 'GW_RECON_NET_ERR';

  const allOrderIds = [
    oMatched,
    oLateCallback,
    oNoTicketAuto,
    oNoTicketFlag,
    oAmountMismatch,
    oGwFailed,
    oAlreadyHandled,
    oNetErr,
  ];

  const allTxnIds = [
    tMatched,
    tLateCallback,
    tNoTicketAuto,
    tNoTicketFlag,
    tAmountMismatch,
    tGwFailed,
    tAlreadyHandled,
    tNetErr,
  ];

  let testSeatId;

  async function cleanup() {
    await knex('recon_items').whereIn('order_id', allOrderIds).del();
    await knex('refunds').whereIn('order_id', allOrderIds).del();
    await knex('support_tickets').whereIn('order_id', allOrderIds).del();
    await knex('tickets').whereIn('order_id', allOrderIds).del();
    await knex('showtime_seats').whereIn('order_id', allOrderIds).del();
    await knex('order_seats').whereIn('order_id', allOrderIds).del();
    await knex('webhook_events').whereIn('gateway_txn_id', allTxnIds).del();
    await knex('payment_attempts').whereIn('order_id', allOrderIds).del();
    await knex('order_status_history').whereIn('order_id', allOrderIds).del();
    await knex('orders').whereIn('order_id', allOrderIds).del();
  }

  async function insertTestOrder({
    orderId,
    status = 'FAILED',
    amount = 50000,
    holdExpiresAt = null,
    nowIso = clock.nowIso(),
  }) {
    const exp = holdExpiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await knex('orders').insert({
      order_id: orderId,
      user_id: 1,
      showtime_id: 1,
      status,
      amount_tickets: amount,
      amount_combos: 0,
      amount_total: amount,
      customer_name: 'Test Khách',
      customer_phone: '0987654321',
      customer_email: 'khach@test.com',
      hold_expires_at: exp,
      created_at: nowIso,
      updated_at: nowIso,
    });
  }

  async function insertTestAttempt({
    attemptId,
    orderId,
    gatewayTxnId,
    method = 'ATM',
    amount = 50000,
    status = 'REDIRECTED',
    nowIso = clock.nowIso(),
  }) {
    await knex('payment_attempts').insert({
      attempt_id: attemptId,
      order_id: orderId,
      gateway_txn_id: gatewayTxnId,
      method,
      amount,
      status,
      idempotency_key: 'idemp_' + attemptId,
      created_at: nowIso,
    });
  }

  beforeAll(async () => {
    const seat = await knex('seats').where({ room_id: 1 }).first();
    testSeatId = seat.id;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    // Khôi phục settings về mặc định
    await knex('settings').insert([
      { key: 'mode', value: 'ASIS', updated_at: clock.nowIso() },
    ]).onConflict('key').merge();
    await knex.destroy();
  });

  it('1. MATCHED: Đơn FAILED và Gateway báo FAILED -> classification = MATCHED, action = NONE', async () => {
    const nowIso = clock.nowIso();
    await insertTestOrder({ orderId: oMatched, status: 'FAILED', amount: 50000, nowIso });
    await insertTestAttempt({
      attemptId: 'ATT_' + oMatched,
      orderId: oMatched,
      gatewayTxnId: tMatched,
      status: 'FAILED',
      amount: 50000,
      nowIso,
    });

    const mockAdapter = {
      queryTransaction: jest.fn().mockResolvedValue({
        vnp_ResponseCode: '02',
        vnp_TransactionStatus: '02',
        vnp_Amount: '5000000',
      }),
    };

    const res = await runRecon('MANUAL', {
      gatewayAdapter: mockAdapter,
      targetOrderId: oMatched,
    });

    expect(res.status).toBe('DONE');
    expect(res.scanned).toBe(1);
    expect(res.matched).toBe(1);

    const item = await knex('recon_items').where({ order_id: oMatched }).first();
    expect(item).toBeDefined();
    expect(item.classification).toBe('MATCHED');
    expect(item.action).toBe('NONE');
    expect(Boolean(item.gateway_debited)).toBe(false);
  });

  it('2. LATE_CALLBACK: Đơn PENDING_VERIFY và VNPay báo SUCCESS -> gọi applyGatewayResult, chuyển PAID, xuất vé', async () => {
    const nowIso = clock.nowIso();
    await insertTestOrder({ orderId: oLateCallback, status: 'PENDING_VERIFY', amount: 60000, nowIso });
    await knex('order_seats').insert({
      order_id: oLateCallback,
      seat_id: testSeatId,
      seat_type: 'STANDARD',
      price: 60000,
    });
    await knex('showtime_seats').insert({
      showtime_id: 1,
      seat_id: testSeatId,
      state: 'HELD',
      order_id: oLateCallback,
      held_until: nowIso,
    }).onConflict(['showtime_id', 'seat_id']).merge();

    await insertTestAttempt({
      attemptId: 'ATT_' + oLateCallback,
      orderId: oLateCallback,
      gatewayTxnId: tLateCallback,
      status: 'REDIRECTED',
      amount: 60000,
      nowIso,
    });

    const mockAdapter = {
      queryTransaction: jest.fn().mockResolvedValue({
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_Amount: '6000000', // 60,000 VND
        vnp_TransactionNo: '14890001',
        vnp_PayDate: '20261021200000',
        vnp_BankCode: 'NCB',
      }),
    };

    const res = await runRecon('MANUAL', {
      gatewayAdapter: mockAdapter,
      targetOrderId: oLateCallback,
    });

    expect(res.status).toBe('DONE');
    expect(res.mismatched).toBe(1);

    const item = await knex('recon_items').where({ order_id: oLateCallback }).first();
    expect(item).toBeDefined();
    expect(item.classification).toBe('LATE_CALLBACK');
    expect(item.action).toBe('NONE');
    expect(Boolean(item.gateway_debited)).toBe(true);

    // Kiểm tra đơn đã được chuyển sang PAID và đã xuất vé
    const updatedOrder = await knex('orders').where({ order_id: oLateCallback }).first();
    expect(updatedOrder.status).toBe('PAID');

    const ticket = await knex('tickets').where({ order_id: oLateCallback }).first();
    expect(ticket).toBeDefined();
    expect(ticket.status).toBe('VALID');
  });

  it('3. NO_TICKET_DEBITED (AUTO_REFUND): Đơn FAILED, Cổng trừ tiền, không có vé và không có khiếu nại -> action = AUTO_REFUND', async () => {
    const nowIso = clock.nowIso();
    await insertTestOrder({ orderId: oNoTicketAuto, status: 'FAILED', amount: 70000, nowIso });
    await insertTestAttempt({
      attemptId: 'ATT_' + oNoTicketAuto,
      orderId: oNoTicketAuto,
      gatewayTxnId: tNoTicketAuto,
      status: 'FAILED',
      amount: 70000,
      nowIso,
    });

    const mockAdapter = {
      queryTransaction: jest.fn().mockResolvedValue({
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_Amount: '7000000', // 70,000 VND
        vnp_TransactionNo: '14890002',
      }),
    };

    const res = await runRecon('MANUAL', {
      gatewayAdapter: mockAdapter,
      targetOrderId: oNoTicketAuto,
    });

    expect(res.status).toBe('DONE');
    expect(res.autoRefunds).toBe(1);

    const item = await knex('recon_items').where({ order_id: oNoTicketAuto }).first();
    expect(item).toBeDefined();
    expect(item.classification).toBe('NO_TICKET_DEBITED');
    expect(item.action).toBe('AUTO_REFUND');
    expect(Boolean(item.gateway_debited)).toBe(true);
  });

  it('4. NO_TICKET_DEBITED (FLAGGED): Đơn FAILED, Cổng trừ tiền, nhưng có support_ticket từ CSKH -> action = FLAGGED', async () => {
    const nowIso = clock.nowIso();
    await insertTestOrder({ orderId: oNoTicketFlag, status: 'FAILED', amount: 75000, nowIso });
    await insertTestAttempt({
      attemptId: 'ATT_' + oNoTicketFlag,
      orderId: oNoTicketFlag,
      gatewayTxnId: tNoTicketFlag,
      status: 'FAILED',
      amount: 75000,
      nowIso,
    });
    // Ghi nhận 1 support ticket từ CSKH/CUSTOMER
    await knex('support_tickets').insert({
      ticket_id: 'ST_TEST_FLAG',
      order_id: oNoTicketFlag,
      contact: 'khach@test.com',
      source: 'CUSTOMER',
      status: 'OPEN',
      created_at: nowIso,
    });

    const mockAdapter = {
      queryTransaction: jest.fn().mockResolvedValue({
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_Amount: '7500000',
        vnp_TransactionNo: '14890003',
      }),
    };

    const res = await runRecon('MANUAL', {
      gatewayAdapter: mockAdapter,
      targetOrderId: oNoTicketFlag,
    });

    expect(res.status).toBe('DONE');
    expect(res.flagged).toBe(1);

    const item = await knex('recon_items').where({ order_id: oNoTicketFlag }).first();
    expect(item).toBeDefined();
    expect(item.classification).toBe('NO_TICKET_DEBITED');
    expect(item.action).toBe('FLAGGED');
  });

  it('5. AMOUNT_MISMATCH: Cổng báo thành công nhưng số tiền không khớp -> classification = AMOUNT_MISMATCH, action = FLAGGED', async () => {
    const nowIso = clock.nowIso();
    await insertTestOrder({ orderId: oAmountMismatch, status: 'FAILED', amount: 80000, nowIso });
    await insertTestAttempt({
      attemptId: 'ATT_' + oAmountMismatch,
      orderId: oAmountMismatch,
      gatewayTxnId: tAmountMismatch,
      status: 'FAILED',
      amount: 80000,
      nowIso,
    });

    const mockAdapter = {
      queryTransaction: jest.fn().mockResolvedValue({
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_Amount: '10000000', // Cổng trừ 100,000 VND (lệch với 80,000 VND)
        vnp_TransactionNo: '14890004',
      }),
    };

    const res = await runRecon('MANUAL', {
      gatewayAdapter: mockAdapter,
      targetOrderId: oAmountMismatch,
    });

    expect(res.status).toBe('DONE');
    expect(res.mismatched).toBe(1);
    expect(res.flagged).toBe(1);

    const item = await knex('recon_items').where({ order_id: oAmountMismatch }).first();
    expect(item).toBeDefined();
    expect(item.classification).toBe('AMOUNT_MISMATCH');
    expect(item.action).toBe('FLAGGED');
    expect(item.amount_beta).toBe(80000);
    expect(item.amount_gateway).toBe(100000);
  });

  it('6. GATEWAY_FAILED: Đơn PENDING_VERIFY trên Beta nhưng Cổng báo chưa hoàn tất/thất bại -> classification = GATEWAY_FAILED, action = NONE', async () => {
    const nowIso = clock.nowIso();
    await insertTestOrder({ orderId: oGwFailed, status: 'PENDING_VERIFY', amount: 50000, nowIso });
    await insertTestAttempt({
      attemptId: 'ATT_' + oGwFailed,
      orderId: oGwFailed,
      gatewayTxnId: tGwFailed,
      status: 'REDIRECTED',
      amount: 50000,
      nowIso,
    });

    const mockAdapter = {
      queryTransaction: jest.fn().mockResolvedValue({
        vnp_ResponseCode: '02',
        vnp_TransactionStatus: '02', // Giao dịch lỗi/thất bại trên cổng
        vnp_Amount: '5000000',
      }),
    };

    const res = await runRecon('MANUAL', {
      gatewayAdapter: mockAdapter,
      targetOrderId: oGwFailed,
    });

    expect(res.status).toBe('DONE');
    expect(res.mismatched).toBe(1);

    const item = await knex('recon_items').where({ order_id: oGwFailed }).first();
    expect(item).toBeDefined();
    expect(item.classification).toBe('GATEWAY_FAILED');
    expect(item.action).toBe('NONE');
    expect(Boolean(item.gateway_debited)).toBe(false);
  });

  it('7. ALREADY_HANDLED: Đơn đã có bản ghi trong refunds -> classification = ALREADY_HANDLED, action = NONE', async () => {
    const nowIso = clock.nowIso();
    await insertTestOrder({ orderId: oAlreadyHandled, status: 'FAILED', amount: 90000, nowIso });
    await insertTestAttempt({
      attemptId: 'ATT_' + oAlreadyHandled,
      orderId: oAlreadyHandled,
      gatewayTxnId: tAlreadyHandled,
      status: 'FAILED',
      amount: 90000,
      nowIso,
    });
    // Ghi nhận lệnh hoàn tiền đã tồn tại
    await knex('refunds').insert({
      refund_id: 'RF_TEST_HANDLED',
      order_id: oAlreadyHandled,
      gateway_txn_id: tAlreadyHandled,
      amount: 90000,
      type: 'AUTO',
      status: 'CHECKING',
      detected_at: nowIso,
      send_due_at: nowIso,
      checks_json: JSON.stringify({ a: true, b: true, c: true, d: true, e: true }),
    });

    const mockAdapter = {
      queryTransaction: jest.fn(),
    };

    const res = await runRecon('MANUAL', {
      gatewayAdapter: mockAdapter,
      targetOrderId: oAlreadyHandled,
    });

    expect(res.status).toBe('DONE');
    expect(res.matched).toBe(1);
    expect(mockAdapter.queryTransaction).not.toHaveBeenCalled();

    const item = await knex('recon_items').where({ order_id: oAlreadyHandled }).first();
    expect(item).toBeDefined();
    expect(item.classification).toBe('ALREADY_HANDLED');
    expect(item.action).toBe('NONE');
  });

  it('8. Lỗi mạng ở 1 attempt không làm hỏng cả lượt chạy (resilience)', async () => {
    const nowIso = clock.nowIso();
    await insertTestOrder({ orderId: oNetErr, status: 'FAILED', amount: 50000, nowIso });
    await insertTestAttempt({
      attemptId: 'ATT_' + oNetErr,
      orderId: oNetErr,
      gatewayTxnId: tNetErr,
      status: 'FAILED',
      amount: 50000,
      nowIso,
    });

    const mockAdapter = {
      queryTransaction: jest.fn().mockRejectedValue(new Error('VNPay connection timeout')),
    };

    // runRecon không ném lỗi ra ngoài và hoàn tất với DONE
    const res = await runRecon('MANUAL', {
      gatewayAdapter: mockAdapter,
      targetOrderId: oNetErr,
    });

    expect(res.status).toBe('DONE');
    expect(res.scanned).toBe(1);

    const reconRun = await knex('recon_runs').where({ run_id: res.runId }).first();
    expect(reconRun.status).toBe('DONE');
  });

  it('9. Chỉ chạy tự động khi settings.mode = TOBE; bỏ qua khi mode = ASIS', async () => {
    // 1. Chế độ ASIS
    await knex('settings').insert([
      { key: 'mode', value: 'ASIS', updated_at: clock.nowIso() },
    ]).onConflict('key').merge();

    const asisResult = await runRecon('SCHEDULED');
    expect(asisResult).toBeNull();

    // 2. Chế độ TOBE
    await knex('settings').insert([
      { key: 'mode', value: 'TOBE', updated_at: clock.nowIso() },
    ]).onConflict('key').merge();

    const mockAdapter = {
      queryTransaction: jest.fn().mockResolvedValue({
        vnp_ResponseCode: '02',
        vnp_TransactionStatus: '02',
      }),
    };

    const tobeResult = await runRecon('SCHEDULED', {
      gatewayAdapter: mockAdapter,
      targetOrderId: oMatched,
    });
    expect(tobeResult).toBeDefined();
    expect(tobeResult.status).toBe('DONE');
    expect(tobeResult.trigger).toBe('SCHEDULED');
  });
});
