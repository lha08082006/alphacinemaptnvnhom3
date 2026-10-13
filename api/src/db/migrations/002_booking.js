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

    t.index(['status', 'hold_expires_at']);
    t.index(['user_id', 'created_at']);
  });
  await knex.raw(`ALTER TABLE orders ADD CONSTRAINT check_orders_status CHECK (status IN ('HOLDING','AWAITING_PAYMENT','PAID','FAILED','CANCELLED','EXPIRED','PENDING_VERIFY','REFUND_PENDING','REFUNDED'))`);
  await knex.raw(`ALTER TABLE orders ADD CONSTRAINT check_orders_method CHECK (payment_method IS NULL OR payment_method IN ('WALLET','ATM','INTL_CARD','POINTS'))`);
  await knex.raw(`ALTER TABLE orders ADD CONSTRAINT check_orders_amounts CHECK (amount_total = amount_tickets + amount_combos AND amount_tickets >= 0 AND amount_combos >= 0)`);

  // order_seats
  await knex.schema.createTable('order_seats', (t) => {
    t.string('order_id').notNullable().references('order_id').inTable('orders').onDelete('CASCADE');
    t.integer('seat_id').notNullable().references('id').inTable('seats').onDelete('RESTRICT');
    t.string('seat_type').notNullable();
    t.integer('price').notNullable();
    t.primary(['order_id', 'seat_id']);
  });
  await knex.raw(`ALTER TABLE order_seats ADD CONSTRAINT check_order_seats_price CHECK (price >= 0)`);
  
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
  await knex.raw(`ALTER TABLE order_combos ADD CONSTRAINT check_order_combos_qty CHECK (qty BETWEEN 1 AND 10)`);
  await knex.raw(`ALTER TABLE order_combos ADD CONSTRAINT check_order_combos_price CHECK (unit_price >= 0)`);

  // showtime_seats
  await knex.schema.createTable('showtime_seats', (t) => {
    t.integer('showtime_id').notNullable().references('id').inTable('showtimes').onDelete('RESTRICT');
    t.integer('seat_id').notNullable().references('id').inTable('seats').onDelete('RESTRICT');
    t.string('state').notNullable(); // CHECK IN (HELD,SOLD)
    t.string('order_id').nullable().references('order_id').inTable('orders').onDelete('RESTRICT');
    t.string('held_until').nullable();
    t.primary(['showtime_id', 'seat_id']);
  });
  await knex.raw(`ALTER TABLE showtime_seats ADD CONSTRAINT check_showtime_seats_state CHECK (state IN ('HELD','SOLD'))`);
  await knex.raw(`ALTER TABLE showtime_seats ADD CONSTRAINT check_showtime_seats_held CHECK ((state = 'HELD') = (held_until IS NOT NULL))`);

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
  await knex.raw(`ALTER TABLE order_status_history ADD CONSTRAINT check_osh_actor_type CHECK (actor_type IN ('USER','SYSTEM','GATEWAY','STAFF'))`);

  // tickets
  await knex.schema.createTable('tickets', (t) => {
    t.string('ticket_id').primary(); // CS...
    t.string('order_id').notNullable().unique().references('order_id').inTable('orders').onDelete('RESTRICT');
    t.string('qr_payload').notNullable();
    t.string('status').notNullable(); // CHECK IN (VALID,USED,VOID)
    t.string('issued_at').notNullable();
  });
  await knex.raw(`ALTER TABLE tickets ADD CONSTRAINT check_tickets_status CHECK (status IN ('VALID','USED','VOID'))`);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('tickets');
  await knex.schema.dropTableIfExists('order_status_history');
  await knex.schema.dropTableIfExists('showtime_seats');
  await knex.schema.dropTableIfExists('order_combos');
  await knex.schema.dropTableIfExists('order_seats');
  await knex.schema.dropTableIfExists('orders');
};
