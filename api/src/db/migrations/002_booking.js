'use strict';

/**
 * MIGRATION 002 - Đặt vé (Booking)
 */
exports.up = async (knex) => {
  // orders
  await knex.schema.createTable('orders', (t) => {
    t.string('order_id').primary(); // BC...
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.integer('showtime_id').notNullable().references('id').inTable('showtimes').onDelete('RESTRICT');
    t.string('status').notNullable(); // CHECK IN (HOLDING,AWAITING_PAYMENT,PAID,FAILED,CANCELLED,EXPIRED,PENDING_VERIFY,REFUND_PENDING,REFUNDED)
    t.integer('amount_tickets').notNullable();
    t.integer('amount_combos').notNullable();
    t.integer('amount_total').notNullable(); // CHECK = tickets + combos
    t.string('customer_name').notNullable();
    t.string('customer_phone').notNullable();
    t.string('customer_email').notNullable();
    t.string('payment_method').nullable(); // CHECK IN (WALLET,ATM,INTL_CARD,POINTS)
    t.string('hold_expires_at').notNullable();
    t.string('current_attempt_id').nullable();
    t.string('created_at').notNullable();
    t.string('updated_at').notNullable();
    t.string('paid_at').nullable();
    t.string('callback_at').nullable();
    t.check('amount_total = amount_tickets + amount_combos', [], 'check_orders_amounts');

    t.index(['status', 'hold_expires_at']);
    t.index(['user_id', 'created_at']);
  });

  // order_seats
  await knex.schema.createTable('order_seats', (t) => {
    t.string('order_id').notNullable().references('order_id').inTable('orders').onDelete('CASCADE');
    t.integer('seat_id').notNullable().references('id').inTable('seats').onDelete('RESTRICT');
    t.string('seat_type').notNullable();
    t.integer('price').notNullable();
    t.primary(['order_id', 'seat_id']);
  });

  // Trigger BR-01: max 8 seats
  await knex.raw(`
    CREATE TRIGGER trg_max_seats_exceeded
    BEFORE INSERT ON order_seats
    FOR EACH ROW
    WHEN (SELECT COUNT(*) FROM order_seats WHERE order_id = NEW.order_id) >= 8
    BEGIN
      SELECT RAISE(ABORT, 'MAX_SEATS_EXCEEDED');
    END;
  `);

  // order_combos
  await knex.schema.createTable('order_combos', (t) => {
    t.string('order_id').notNullable().references('order_id').inTable('orders').onDelete('CASCADE');
    t.integer('combo_id').notNullable().references('id').inTable('combos').onDelete('RESTRICT');
    t.integer('qty').notNullable(); // CHECK 1..10
    t.integer('unit_price').notNullable();
    t.primary(['order_id', 'combo_id']);
  });

  // showtime_seats
  await knex.schema.createTable('showtime_seats', (t) => {
    t.integer('showtime_id').notNullable().references('id').inTable('showtimes').onDelete('RESTRICT');
    t.integer('seat_id').notNullable().references('id').inTable('seats').onDelete('RESTRICT');
    t.string('state').notNullable(); // CHECK IN (HELD,SOLD)
    t.string('order_id').nullable().references('order_id').inTable('orders').onDelete('RESTRICT');
    t.string('held_until').nullable();
    t.primary(['showtime_id', 'seat_id']);
  });

  // order_status_history
  await knex.schema.createTable('order_status_history', (t) => {
    t.increments('id').primary();
    t.string('order_id').notNullable().references('order_id').inTable('orders').onDelete('CASCADE');
    t.string('from_status').nullable();
    t.string('to_status').notNullable();
    t.string('reason').nullable();
    t.string('actor_type').notNullable(); // CHECK IN (USER,SYSTEM,GATEWAY,STAFF)
    t.integer('actor_id').nullable();
    t.string('at').notNullable(); // ISO-8601
    t.index(['order_id', 'at']);
  });

  // tickets
  await knex.schema.createTable('tickets', (t) => {
    t.string('ticket_id').primary(); // CS...
    t.string('order_id').notNullable().unique().references('order_id').inTable('orders').onDelete('RESTRICT');
    t.string('qr_payload').notNullable();
    t.string('status').notNullable(); // CHECK IN (VALID,USED,VOID)
    t.string('issued_at').notNullable();
  });
  
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('tickets');
  await knex.schema.dropTableIfExists('order_status_history');
  await knex.schema.dropTableIfExists('showtime_seats');
  await knex.schema.dropTableIfExists('order_combos');
  await knex.schema.dropTableIfExists('order_seats');
  await knex.schema.dropTableIfExists('orders');
};
