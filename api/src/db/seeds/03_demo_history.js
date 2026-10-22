'use strict';

const path = require('path');
const crypto = require('crypto');
const clock = require('../../lib/clock');
const ids = require('../../lib/ids');

function createGatewayKnex() {
  const dbPath = path.join(__dirname, '../../../../gateway-mock/data/gateway.sqlite');
  return require('knex')({
    client: 'better-sqlite3',
    connection: { filename: dbPath },
    useNullAsDefault: true,
  });
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

exports.seed = async function (knex) {
  // Reset các bảng giao dịch
  await knex('audit_log').del();
  await knex('notifications').del();
  await knex('support_ticket_notes').del();
  await knex('support_tickets').del();
  await knex('refunds').del();
  await knex('recon_items').del();
  await knex('recon_runs').del();
  await knex('webhook_events').del();
  await knex('payment_attempts').del();
  await knex('tickets').del();
  await knex('order_status_history').del();
  await knex('order_combos').del();
  await knex('order_seats').del();
  await knex('orders').del();
  
  // Không xoá catalog và settings
  await knex('settings').insert([
    { key: 'clock_offset_ms', value: '0', updated_at: clock.nowIso() }
  ]).onConflict('key').merge();

  const gwKnex = createGatewayKnex();
  
  try {
    // Reset gateway txns
    await gwKnex('refunds').del();
    await gwKnex('webhook_deliveries').del();
    await gwKnex('txns').del();

    const users = await knex('users').where({ role: 'CUSTOMER' });
    const showtimes = await knex('showtimes');
    const seats = await knex('seats');
    const combos = await knex('combos');
    
    if (showtimes.length === 0) return;

    // Fix random seed by re-using a deterministic sequence? 
    // For simplicity, just generate a mix of cases.
    
    for (let i = 0; i < 36; i++) {
      const user = users[i % users.length];
      const showtime = showtimes[i % showtimes.length];
      const roomSeats = seats.filter(s => s.room_id === showtime.room_id);
      
      const numSeats = randInt(1, 4);
      const selectedSeats = roomSeats.slice(i, i + numSeats); // Đơn giản hóa, không kiểm tra trùng lặp gắt gao vì mỗi đơn ở một suất chiếu khác nhau
      const selectedCombos = [combos[0]];
      
      const orderId = ids.generateOrderId();
      let amountTotal = selectedSeats.reduce((acc, s) => acc + (s.seat_type === 'VIP' ? showtime.price_vip : showtime.price_standard), 0);
      amountTotal += selectedCombos[0].price;
      
      const isPaid = i < 20;
      const isHanging = i >= 20 && i < 25; // 5 đơn treo (trừ tiền nhưng không có vé)
      const isFailed = i >= 25 && i < 30; // 5 đơn lỗi
      
      const now = new Date(clock.now().getTime() - randInt(1000, 86400000));
      const holdExp = new Date(now.getTime() + 10 * 60000);
      
      const status = isPaid ? 'PAID' : (isHanging ? 'AWAITING_PAYMENT' : (isFailed ? 'FAILED' : 'HOLDING'));
      
      const attemptId = 'ATT-' + orderId;
      const gatewayTxnId = ids.generateTxnId();
      
      // BETA: Tạo Order
      await knex('orders').insert({
        order_id: orderId,
        user_id: user.id,
        showtime_id: showtime.id,
        status: status,
        amount_tickets: amountTotal - selectedCombos[0].price,
        amount_combos: selectedCombos[0].price,
        amount_total: amountTotal,
        customer_name: user.full_name,
        customer_phone: user.phone,
        customer_email: user.email,
        payment_method: status !== 'HOLDING' ? 'ATM' : null,
        hold_expires_at: holdExp.toISOString(),
        current_attempt_id: attemptId,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        paid_at: isPaid ? now.toISOString() : null,
        callback_at: isPaid ? now.toISOString() : null,
      });

      // BETA: Order Seats
      for (const seat of selectedSeats) {
        await knex('order_seats').insert({
          order_id: orderId,
          seat_id: seat.id,
          seat_type: seat.seat_type,
          price: seat.seat_type === 'VIP' ? showtime.price_vip : showtime.price_standard,
        });
        
        if (isPaid) {
          await knex('showtime_seats').insert({
            showtime_id: showtime.id,
            seat_id: seat.id,
            state: 'SOLD',
            order_id: orderId,
            held_until: null,
          }).onConflict(['showtime_id', 'seat_id']).ignore();
        }
      }
      
      // BETA: Order Combos
      await knex('order_combos').insert({
        order_id: orderId,
        combo_id: selectedCombos[0].id,
        qty: 1,
        unit_price: selectedCombos[0].price,
      });
      
      if (isPaid || isHanging || isFailed) {
        // BETA: Payment Attempt
        await knex('payment_attempts').insert({
          attempt_id: attemptId,
          order_id: orderId,
          gateway_txn_id: gatewayTxnId,
          method: 'ATM',
          amount: amountTotal,
          status: isPaid ? 'SUCCESS' : (isFailed ? 'FAILED' : 'REDIRECTED'),
          idempotency_key: 'idemp_' + orderId,
          created_at: now.toISOString(),
          callback_at: isPaid || isFailed ? now.toISOString() : null,
        });
        
        // GATEWAY: Txn
        await gwKnex('txns').insert({
          txn_id: gatewayTxnId,
          merchant_id: 1,
          merchant_order_ref: attemptId,
          method: 'ATM',
          amount: amountTotal,
          status: (isPaid || isHanging) ? 'SUCCESS' : 'FAILED', // Hanging = SUCCESS trên cổng, AWAITING_PAYMENT trên Beta
          debited: (isPaid || isHanging),
          scenario: 'S1',
          created_at: now.toISOString(),
          paid_at: (isPaid || isHanging) ? now.toISOString() : null,
          expires_at: holdExp.toISOString(),
          return_url: 'http://localhost:4000/api/v1/demo/return',
        });
      }
      
      if (isPaid) {
        await knex('tickets').insert({
          ticket_id: ids.generateTicketId(),
          order_id: orderId,
          qr_payload: crypto.randomBytes(16).toString('hex'),
          status: 'VALID',
          issued_at: now.toISOString(),
        });
      }
    }

    // ==============================================================
    // 4 ĐƠN HÀNG MẪU CỐ ĐỊNH PHỤC VỤ TEST & DEMO CHATBOT CSKH
    // ==============================================================
    const demoUser = users[0] || { id: 1, full_name: 'Khách Hàng Demo', email: 'khach@demo.vn', phone: '0912345678' };
    const demoShowtime = showtimes[0];
    const demoSeats = seats.filter(s => s.room_id === demoShowtime.room_id).slice(0, 2);
    const demoCombo = combos[0];
    const demoAmount = (demoSeats.length * demoShowtime.price_standard) + (demoCombo ? demoCombo.price : 0);

    const nowCurrent = clock.now();
    const min15Ago = new Date(nowCurrent.getTime() - 15 * 60000).toISOString();
    const min5Ago = new Date(nowCurrent.getTime() - 5 * 60000).toISOString();
    const day1Ago = new Date(nowCurrent.getTime() - 24 * 3600000).toISOString();

    const sampleOrders = [
      {
        order_id: 'BC-DEMO-PAID-01',
        status: 'PAID',
        method: 'ATM',
        created_at: day1Ago,
        paid_at: day1Ago,
        hasTicket: true,
        hasRefund: false,
      },
      {
        order_id: 'BC-DEMO-VERIFY-02',
        status: 'PENDING_VERIFY',
        method: 'VNPAY',
        created_at: min5Ago,
        paid_at: null,
        hasTicket: false,
        hasRefund: false,
      },
      {
        order_id: 'BC-DEMO-HANGING-03', // Bị trừ tiền nhưng chưa có vé (trong hạn 60 phút)
        status: 'AWAITING_PAYMENT',
        method: 'ATM',
        created_at: min15Ago,
        paid_at: null,
        hasTicket: false,
        hasRefund: false,
        gatewayDebited: true, // đã trừ tiền trên cổng
      },
      {
        order_id: 'BC-DEMO-REFUNDED-04',
        status: 'REFUNDED',
        method: 'ATM',
        created_at: day1Ago,
        paid_at: day1Ago,
        hasTicket: false,
        hasRefund: true,
      },
    ];

    for (const sample of sampleOrders) {
      await knex('orders').insert({
        order_id: sample.order_id,
        user_id: demoUser.id,
        showtime_id: demoShowtime.id,
        status: sample.status,
        amount_tickets: demoSeats.length * demoShowtime.price_standard,
        amount_combos: demoCombo ? demoCombo.price : 0,
        amount_total: demoAmount,
        customer_name: demoUser.full_name,
        customer_phone: '0912345678',
        customer_email: 'khach@demo.vn',
        payment_method: sample.method,
        hold_expires_at: new Date(nowCurrent.getTime() + 600000).toISOString(),
        current_attempt_id: 'ATT-' + sample.order_id,
        created_at: sample.created_at,
        updated_at: sample.created_at,
        paid_at: sample.paid_at,
        callback_at: sample.paid_at,
      }).onConflict('order_id').merge();

      const txnId = 'GW-' + sample.order_id;
      await knex('payment_attempts').insert({
        attempt_id: 'ATT-' + sample.order_id,
        order_id: sample.order_id,
        gateway_txn_id: txnId,
        method: sample.method,
        amount: demoAmount,
        status: sample.status === 'PAID' ? 'SUCCESS' : (sample.status === 'FAILED' ? 'FAILED' : 'REDIRECTED'),
        idempotency_key: 'idemp_' + sample.order_id,
        created_at: sample.created_at,
        callback_at: sample.paid_at,
      }).onConflict('attempt_id').merge();

      await gwKnex('txns').insert({
        txn_id: txnId,
        merchant_id: 1,
        merchant_order_ref: 'ATT-' + sample.order_id,
        method: sample.method,
        amount: demoAmount,
        status: (sample.status === 'PAID' || sample.gatewayDebited) ? 'SUCCESS' : 'PENDING',
        debited: (sample.status === 'PAID' || sample.gatewayDebited) ? 1 : 0,
        scenario: 'S1',
        created_at: sample.created_at,
        paid_at: (sample.status === 'PAID' || sample.gatewayDebited) ? sample.created_at : null,
        expires_at: new Date(nowCurrent.getTime() + 600000).toISOString(),
        return_url: 'http://localhost:4000/api/v1/demo/return',
      }).onConflict('txn_id').merge();

      if (sample.hasTicket) {
        await knex('tickets').insert({
          ticket_id: 'TK-' + sample.order_id,
          order_id: sample.order_id,
          qr_payload: crypto.randomBytes(16).toString('hex'),
          status: 'VALID',
          issued_at: sample.paid_at,
        }).onConflict('ticket_id').merge();
      }

      if (sample.hasRefund) {
        await knex('refunds').insert({
          refund_id: 'RF-' + sample.order_id,
          order_id: sample.order_id,
          gateway_txn_id: txnId,
          amount: demoAmount,
          type: 'AUTO',
          status: 'COMPLETED',
          detected_at: sample.created_at,
          send_due_at: sample.created_at,
          sent_at: sample.created_at,
          completed_at: sample.created_at,
          checks_json: JSON.stringify({ reason: 'Hoàn tiền tự động qua đối soát' }),
          sla_breached: false,
        }).onConflict('refund_id').merge();
      }
    }
  } finally {
    gwKnex.destroy();
  }
};
