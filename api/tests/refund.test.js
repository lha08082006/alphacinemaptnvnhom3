'use strict';

const knex = require('../src/db/knex');
const clock = require('../src/lib/clock');
const { AppError } = require('../src/lib/errors');
const { evaluateAndCreate, processRefundQueue } = require('../src/services/refundService');
const { applyGatewayResult } = require('../src/services/paymentService');

describe('Step 9: Refund Service (evaluateAndCreate & processRefundQueue)', () => {
  const oSuccess = 'BC_RF_OK_01';
  const oFailA = 'BC_RF_FAIL_A';
  const oFailB = 'BC_RF_FAIL_B';
  const oFailC = 'BC_RF_FAIL_C';
  const oFailE = 'BC_RF_FAIL_E';
  const oSla = 'BC_RF_SLA';
  const oQueueReject = 'BC_RF_Q_REJ';
  const oQueueSuccess = 'BC_RF_Q_OK';
  const oLateOrder = 'BC_RF_LATE_ORDER';

  const tSuccess = 'GW_RF_OK_01';
  const tFailA = 'GW_RF_FAIL_A';
  const tFailB = 'GW_RF_FAIL_B';
  const tFailC = 'GW_RF_FAIL_C';
  const tFailE = 'GW_RF_FAIL_E';
  const tSla = 'GW_RF_SLA';
  const tQueueReject = 'GW_RF_Q_REJ';
  const tQueueSuccess = 'GW_RF_Q_OK';
  const tLateOrder = 'GW_RF_LATE_ORDER';

  const allOrderIds = [
    oSuccess,
    oFailA,
    oFailB,
    oFailC,
    oFailE,
    oSla,
    oQueueReject,
    oQueueSuccess,
    oLateOrder,
  ];

  const allTxnIds = [
    tSuccess,
    tFailA,
    tFailB,
    tFailC,
    tFailE,
    tSla,
    tQueueReject,
    tQueueSuccess,
    tLateOrder,
  ];

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
    amount = 60000,
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
    amount = 60000,
    status = 'SUCCESS',
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
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await knex.destroy();
  });

  describe('evaluateAndCreate()', () => {
    it('1. Đủ 5 điều kiện: tạo refund AUTO CHECKING, send_due_at = +24h, đơn -> REFUND_PENDING', async () => {
      const nowIso = clock.nowIso();
      await insertTestOrder({ orderId: oSuccess, status: 'FAILED', amount: 60000, nowIso });
      await insertTestAttempt({
        attemptId: 'ATT_' + oSuccess,
        orderId: oSuccess,
        gatewayTxnId: tSuccess,
        status: 'SUCCESS',
        amount: 60000,
        nowIso,
      });

      const order = await knex('orders').where({ order_id: oSuccess }).first();
      const attempt = await knex('payment_attempts').where({ gateway_txn_id: tSuccess }).first();

      const result = await knex.transaction(async (trx) => {
        return await evaluateAndCreate(trx, order, attempt);
      });

      expect(result.ok).toBe(true);
      expect(result.refundId).toMatch(/^RF/);
      expect(result.status).toBe('CHECKING');
      expect(result.checks).toEqual({ a: true, b: true, c: true, d: true, e: true });

      // Kiểm tra bản ghi refunds trong CSDL
      const refundRow = await knex('refunds').where({ refund_id: result.refundId }).first();
      expect(refundRow).toBeDefined();
      expect(refundRow.type).toBe('AUTO');
      expect(refundRow.status).toBe('CHECKING');
      expect(refundRow.amount).toBe(60000);
      expect(refundRow.sla_breached).toBe(0);

      // send_due_at xấp xỉ 24 giờ sau detected_at
      const detectedMs = new Date(refundRow.detected_at).getTime();
      const dueMs = new Date(refundRow.send_due_at).getTime();
      expect(dueMs - detectedMs).toBeCloseTo(24 * 3600 * 1000, -3);

      // Đơn hàng chuyển sang REFUND_PENDING
      const updatedOrder = await knex('orders').where({ order_id: oSuccess }).first();
      expect(updatedOrder.status).toBe('REFUND_PENDING');

      // Có lịch sử trạng thái
      const history = await knex('order_status_history')
        .where({ order_id: oSuccess, to_status: 'REFUND_PENDING' })
        .first();
      expect(history).toBeDefined();
    });

    it('2. Gọi lần 2 không tạo trùng: ném AppError DUPLICATE_REFUND', async () => {
      const order = await knex('orders').where({ order_id: oSuccess }).first();
      const attempt = await knex('payment_attempts').where({ gateway_txn_id: tSuccess }).first();

      await expect(
        knex.transaction(async (trx) => {
          return await evaluateAndCreate(trx, order, attempt);
        })
      ).rejects.toThrow(AppError);

      try {
        await knex.transaction(async (trx) => {
          return await evaluateAndCreate(trx, order, attempt);
        });
      } catch (err) {
        expect(err.code).toBe('DUPLICATE_REFUND');
      }
    });

    it('3. Thiếu điều kiện a (cổng chưa thành công): không tạo refund, tạo support_ticket SYSTEM', async () => {
      const nowIso = clock.nowIso();
      await insertTestOrder({ orderId: oFailA, status: 'FAILED', amount: 50000, nowIso });
      await insertTestAttempt({
        attemptId: 'ATT_' + oFailA,
        orderId: oFailA,
        gatewayTxnId: tFailA,
        status: 'FAILED', // Cổng thất bại
        amount: 50000,
        nowIso,
      });

      const order = await knex('orders').where({ order_id: oFailA }).first();
      const attempt = await knex('payment_attempts').where({ gateway_txn_id: tFailA }).first();

      const result = await knex.transaction(async (trx) => {
        return await evaluateAndCreate(trx, order, attempt);
      });

      expect(result.ok).toBe(false);
      expect(result.checks.a).toBe(false);

      // Không có refund được tạo
      const rf = await knex('refunds').where({ order_id: oFailA }).first();
      expect(rf).toBeUndefined();

      // Có support_ticket nguồn SYSTEM
      const ticket = await knex('support_tickets').where({ order_id: oFailA }).first();
      expect(ticket).toBeDefined();
      expect(ticket.source).toBe('SYSTEM');

      // Đơn hàng giữ nguyên FAILED
      const unchOrder = await knex('orders').where({ order_id: oFailA }).first();
      expect(unchOrder.status).toBe('FAILED');
    });

    it('4. Thiếu điều kiện b (đã có vé hợp lệ): không tạo refund, tạo support_ticket SYSTEM', async () => {
      const nowIso = clock.nowIso();
      await insertTestOrder({ orderId: oFailB, status: 'FAILED', amount: 50000, nowIso });
      await insertTestAttempt({
        attemptId: 'ATT_' + oFailB,
        orderId: oFailB,
        gatewayTxnId: tFailB,
        status: 'SUCCESS',
        amount: 50000,
        nowIso,
      });
      // Đã có vé hợp lệ trong hệ thống
      await knex('tickets').insert({
        ticket_id: 'CS_TEST_B',
        order_id: oFailB,
        qr_payload: 'qr_test_b',
        status: 'VALID',
        issued_at: nowIso,
      });

      const order = await knex('orders').where({ order_id: oFailB }).first();
      const attempt = await knex('payment_attempts').where({ gateway_txn_id: tFailB }).first();

      const result = await knex.transaction(async (trx) => {
        return await evaluateAndCreate(trx, order, attempt);
      });

      expect(result.ok).toBe(false);
      expect(result.checks.b).toBe(false);

      const rf = await knex('refunds').where({ order_id: oFailB }).first();
      expect(rf).toBeUndefined();
    });

    it('5. Thiếu điều kiện c (số tiền không khớp): không tạo refund, tạo support_ticket SYSTEM', async () => {
      const nowIso = clock.nowIso();
      await insertTestOrder({ orderId: oFailC, status: 'FAILED', amount: 50000, nowIso });
      await insertTestAttempt({
        attemptId: 'ATT_' + oFailC,
        orderId: oFailC,
        gatewayTxnId: tFailC,
        status: 'SUCCESS',
        amount: 70000, // Lệch số tiền
        nowIso,
      });

      const order = await knex('orders').where({ order_id: oFailC }).first();
      const attempt = await knex('payment_attempts').where({ gateway_txn_id: tFailC }).first();

      const result = await knex.transaction(async (trx) => {
        return await evaluateAndCreate(trx, order, attempt);
      });

      expect(result.ok).toBe(false);
      expect(result.checks.c).toBe(false);

      const rf = await knex('refunds').where({ order_id: oFailC }).first();
      expect(rf).toBeUndefined();
    });

    it('6. Thiếu điều kiện e (đã có can thiệp CSKH): không tạo refund, tạo support_ticket SYSTEM', async () => {
      const nowIso = clock.nowIso();
      await insertTestOrder({ orderId: oFailE, status: 'FAILED', amount: 50000, nowIso });
      await insertTestAttempt({
        attemptId: 'ATT_' + oFailE,
        orderId: oFailE,
        gatewayTxnId: tFailE,
        status: 'SUCCESS',
        amount: 50000,
        nowIso,
      });
      // Đã có support_ticket từ khách hàng / CSKH
      await knex('support_tickets').insert({
        ticket_id: 'ST_MANUAL_E',
        order_id: oFailE,
        contact: 'khach@test.com',
        source: 'CUSTOMER',
        status: 'OPEN',
        created_at: nowIso,
      });

      const order = await knex('orders').where({ order_id: oFailE }).first();
      const attempt = await knex('payment_attempts').where({ gateway_txn_id: tFailE }).first();

      const result = await knex.transaction(async (trx) => {
        return await evaluateAndCreate(trx, order, attempt);
      });

      expect(result.ok).toBe(false);
      expect(result.checks.e).toBe(false);

      const rf = await knex('refunds').where({ order_id: oFailE }).first();
      expect(rf).toBeUndefined();
    });
  });

  describe('processRefundQueue() & SLA', () => {
    it('7. Quá send_due_at (24h) chưa gửi: bật cờ sla_breached = true', async () => {
      const nowIso = clock.nowIso();
      const pastDue = new Date(Date.now() - 3600 * 1000).toISOString(); // 1h trước
      await insertTestOrder({ orderId: oSla, status: 'FAILED', amount: 50000, nowIso });
      await insertTestAttempt({
        attemptId: 'ATT_' + oSla,
        orderId: oSla,
        gatewayTxnId: tSla,
        status: 'SUCCESS',
        amount: 50000,
        nowIso,
      });

      const rfId = 'RF_SLA_TEST';
      await knex('refunds').insert({
        refund_id: rfId,
        order_id: oSla,
        gateway_txn_id: tSla,
        amount: 50000,
        type: 'AUTO',
        status: 'CHECKING',
        detected_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
        send_due_at: pastDue,
        checks_json: JSON.stringify({ a: true, b: true, c: true, d: true, e: true }),
        sla_breached: false,
      });

      // Chạy processRefundQueue
      await processRefundQueue({ targetRefundId: rfId });

      const updatedRf = await knex('refunds').where({ refund_id: rfId }).first();
      expect(Boolean(updatedRf.sla_breached)).toBe(true);
    });

    it('8. processRefundQueue: cổng từ chối hoàn tiền -> status = REJECTED + reject_reason', async () => {
      const nowIso = clock.nowIso();
      const oldDetected = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 60p trước (> 30p delay)
      await insertTestOrder({ orderId: oQueueReject, status: 'FAILED', amount: 50000, nowIso });
      await insertTestAttempt({
        attemptId: 'ATT_' + oQueueReject,
        orderId: oQueueReject,
        gatewayTxnId: tQueueReject,
        status: 'SUCCESS',
        amount: 50000,
        nowIso,
      });

      const rfId = 'RF_Q_REJ_TEST';
      await knex('refunds').insert({
        refund_id: rfId,
        order_id: oQueueReject,
        gateway_txn_id: tQueueReject,
        amount: 50000,
        type: 'AUTO',
        status: 'CHECKING',
        detected_at: oldDetected,
        send_due_at: new Date(Date.now() + 23 * 3600 * 1000).toISOString(),
        checks_json: JSON.stringify({ a: true, b: true, c: true, d: true, e: true }),
        sla_breached: false,
      });

      const mockAdapter = {
        refund: jest.fn().mockResolvedValue({
          vnp_ResponseCode: '95',
          vnp_Message: 'Giao dich khong hop le ben VNPay',
        }),
      };

      await processRefundQueue({
        gatewayAdapter: mockAdapter,
        targetRefundId: rfId,
      });

      const rf = await knex('refunds').where({ refund_id: rfId }).first();
      expect(rf.status).toBe('REJECTED');
      expect(rf.reject_reason).toContain('Giao dich khong hop le ben VNPay');
    });

    it('9. processRefundQueue: cổng chấp nhận -> BANK_PROCESSING -> hoàn tất -> COMPLETED + đơn REFUNDED', async () => {
      const nowIso = clock.nowIso();
      const oldDetected = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await insertTestOrder({ orderId: oQueueSuccess, status: 'REFUND_PENDING', amount: 50000, nowIso });
      await insertTestAttempt({
        attemptId: 'ATT_' + oQueueSuccess,
        orderId: oQueueSuccess,
        gatewayTxnId: tQueueSuccess,
        status: 'SUCCESS',
        amount: 50000,
        nowIso,
      });

      const rfId = 'RF_Q_OK_TEST';
      await knex('refunds').insert({
        refund_id: rfId,
        order_id: oQueueSuccess,
        gateway_txn_id: tQueueSuccess,
        amount: 50000,
        type: 'AUTO',
        status: 'CHECKING',
        detected_at: oldDetected,
        send_due_at: new Date(Date.now() + 23 * 3600 * 1000).toISOString(),
        checks_json: JSON.stringify({ a: true, b: true, c: true, d: true, e: true }),
        sla_breached: false,
      });

      const mockAdapter = {
        refund: jest.fn().mockResolvedValue({
          vnp_ResponseCode: '00',
          vnp_ResponseId: 'RF_GW_RESP_001',
          vnp_Message: 'Yeu cau hoan tien thanh cong',
        }),
      };

      // Đợt 1: Gửi sang cổng -> chuyển SENT / BANK_PROCESSING
      await processRefundQueue({
        gatewayAdapter: mockAdapter,
        targetRefundId: rfId,
      });

      let rf = await knex('refunds').where({ refund_id: rfId }).first();
      expect(rf.status).toBe('BANK_PROCESSING');
      expect(rf.sent_at).toBeDefined();
      expect(rf.gateway_refund_ref).toBe('RF_GW_RESP_001');

      // Đợt 2: Ngân hàng hoàn tất chuyển tiền -> COMPLETED và đơn chuyển REFUNDED
      await processRefundQueue({
        targetRefundId: rfId,
        advanceBankProcessing: true,
      });

      rf = await knex('refunds').where({ refund_id: rfId }).first();
      expect(rf.status).toBe('COMPLETED');
      expect(rf.completed_at).toBeDefined();

      const order = await knex('orders').where({ order_id: oQueueSuccess }).first();
      expect(order.status).toBe('REFUNDED');
    });

    it('10. Nối vào applyGatewayResult: tiền về muộn khi đơn đã FAILED -> tự động tạo refund và đơn sang REFUND_PENDING', async () => {
      const nowIso = clock.nowIso();
      await insertTestOrder({ orderId: oLateOrder, status: 'FAILED', amount: 50000, nowIso });
      await insertTestAttempt({
        attemptId: 'ATT_' + oLateOrder,
        orderId: oLateOrder,
        gatewayTxnId: tLateOrder,
        status: 'REDIRECTED',
        amount: 50000,
        nowIso,
      });

      // Nhận kết quả thành công từ VNPay cho đơn đã FAILED
      const result = await applyGatewayResult({
        txnRef: tLateOrder,
        transNo: '99887766',
        amountVnd: 50000,
        responseCode: '00',
        transactionStatus: '00',
        payDate: '20261021203000',
        bankCode: 'NCB',
      });

      expect(result.RspCode).toBe('00');

      // Đơn hàng tự động chuyển sang REFUND_PENDING
      const order = await knex('orders').where({ order_id: oLateOrder }).first();
      expect(order.status).toBe('REFUND_PENDING');

      // Bảng refunds có bản ghi CHECKING
      const rf = await knex('refunds').where({ order_id: oLateOrder }).first();
      expect(rf).toBeDefined();
      expect(rf.status).toBe('CHECKING');
      expect(rf.type).toBe('AUTO');
      expect(rf.amount).toBe(50000);
    });
  });
});
