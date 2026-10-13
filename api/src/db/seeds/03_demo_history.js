'use strict';

const path = require('path');
const crypto = require('crypto');
const clock = require('../../../lib/clock');
const ids = require('../../../lib/ids');

function createGatewayKnex() {
  const dbPath = path.join(__dirname, '../../../../../gateway-mock/data/gateway.sqlite');
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
    
    for (let i = 0; i < 40; i++) {
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
  } finally {
    gwKnex.destroy();
  }
};
