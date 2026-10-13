'use strict';

/**
 * MIGRATION 003 - Thanh toán (Payment)
 */
exports.up = async (knex) => {
  // payment_attempts
  await knex.schema.createTable('payment_attempts', (t) => {
    t.string('attempt_id').primary(); // ID nội bộ của Beta
    t.string('order_id').notNullable().references('order_id').inTable('orders').onDelete('CASCADE');
    t.string('gateway_txn_id').unique().notNullable(); // ID của giao dịch trên cổng (logic, không FK)
    t.string('method').notNullable();
    t.integer('amount').notNullable();
    t.string('status').notNullable(); // CHECK IN (CREATED,REDIRECTED,SUCCESS,FAILED,CANCELLED,TIMEOUT)
    t.string('idempotency_key').unique().notNullable();
    t.string('created_at').notNullable();
    t.string('callback_at').nullable();
  });
  await knex.raw(`ALTER TABLE payment_attempts ADD CONSTRAINT check_pa_status CHECK (status IN ('CREATED','REDIRECTED','SUCCESS','FAILED','CANCELLED','TIMEOUT'))`);
  await knex.raw(`ALTER TABLE payment_attempts ADD CONSTRAINT check_pa_amount CHECK (amount >= 0)`);

  // webhook_events
  await knex.schema.createTable('webhook_events', (t) => {
    t.string('event_id').primary(); // Do cổng cấp, chống trùng
    t.string('gateway_txn_id').notNullable();
    t.json('payload_json').notNullable();
    t.boolean('signature_valid').notNullable();
    t.string('received_at').notNullable();
    t.string('processed_at').nullable();
    t.string('result').nullable(); // CHECK IN (APPLIED,DUPLICATE,REJECTED,LATE_APPLIED)
    t.string('reject_reason').nullable();
  });
  await knex.raw(`ALTER TABLE webhook_events ADD CONSTRAINT check_webhook_result CHECK (result IS NULL OR result IN ('APPLIED','DUPLICATE','REJECTED','LATE_APPLIED'))`);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('webhook_events');
  await knex.schema.dropTableIfExists('payment_attempts');
};
