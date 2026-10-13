'use strict';

/**
 * MIGRATION 004 - Đối soát và hoàn tiền (Reconciliation & Refund)
 */
exports.up = async (knex) => {
  // recon_runs
  await knex.schema.createTable('recon_runs', (t) => {
    t.increments('run_id').primary();
    t.string('trigger').notNullable(); // CHECK IN (SCHEDULED,MANUAL)
    t.string('started_at').notNullable();
    t.string('finished_at').nullable();
    t.integer('scanned').notNullable().defaultTo(0);
    t.integer('matched').notNullable().defaultTo(0);
    t.integer('mismatched').notNullable().defaultTo(0);
    t.integer('auto_refunds').notNullable().defaultTo(0);
    t.integer('flagged').notNullable().defaultTo(0);
    t.string('status').notNullable(); // CHECK IN (RUNNING,DONE,FAILED)
  });
  await knex.raw(`ALTER TABLE recon_runs ADD CONSTRAINT check_rr_trigger CHECK (trigger IN ('SCHEDULED','MANUAL'))`);
  await knex.raw(`ALTER TABLE recon_runs ADD CONSTRAINT check_rr_status CHECK (status IN ('RUNNING','DONE','FAILED'))`);

  // recon_items
  await knex.schema.createTable('recon_items', (t) => {
    t.increments('id').primary();
    t.integer('run_id').notNullable().references('run_id').inTable('recon_runs').onDelete('CASCADE');
    t.string('order_id').notNullable();
    t.string('gateway_txn_id').notNullable();
    t.string('beta_status').notNullable();
    t.string('gateway_status').notNullable();
    t.boolean('gateway_debited').notNullable();
    t.integer('amount_beta').notNullable();
    t.integer('amount_gateway').notNullable();
    t.string('classification').notNullable(); // MATCHED,NO_TICKET_DEBITED,LATE_CALLBACK,DUPLICATE_PAYMENT,AMOUNT_MISMATCH,GATEWAY_FAILED,ALREADY_HANDLED
    t.string('action').notNullable(); // NONE,AUTO_REFUND,FLAGGED
  });
  await knex.raw(`ALTER TABLE recon_items ADD CONSTRAINT check_ri_classification CHECK (classification IN ('MATCHED','NO_TICKET_DEBITED','LATE_CALLBACK','DUPLICATE_PAYMENT','AMOUNT_MISMATCH','GATEWAY_FAILED','ALREADY_HANDLED'))`);
  await knex.raw(`ALTER TABLE recon_items ADD CONSTRAINT check_ri_action CHECK (action IN ('NONE','AUTO_REFUND','FLAGGED'))`);

  // refunds
  await knex.schema.createTable('refunds', (t) => {
    t.string('refund_id').primary(); // RF...
    t.string('order_id').notNullable().references('order_id').inTable('orders').onDelete('RESTRICT');
    t.string('gateway_txn_id').notNullable();
    t.integer('amount').notNullable();
    t.string('type').notNullable(); // CHECK IN (AUTO,MANUAL)
    t.string('status').notNullable(); // CHECK IN (CHECKING,SENT,BANK_PROCESSING,COMPLETED,REJECTED)
    t.string('detected_at').notNullable();
    t.string('send_due_at').notNullable(); // detected_at + 24 hours
    t.string('sent_at').nullable();
    t.string('bank_eta_at').nullable();
    t.string('completed_at').nullable();
    t.json('checks_json').notNullable(); // 5 golden rules checks
    t.boolean('sla_breached').notNullable().defaultTo(false);
    t.string('gateway_refund_ref').nullable();
    t.integer('created_by').nullable().references('id').inTable('users').onDelete('RESTRICT'); // NULL = SYSTEM
    t.string('reject_reason').nullable();
  });
  await knex.raw(`ALTER TABLE refunds ADD CONSTRAINT check_refunds_type CHECK (type IN ('AUTO','MANUAL'))`);
  await knex.raw(`ALTER TABLE refunds ADD CONSTRAINT check_refunds_status CHECK (status IN ('CHECKING','SENT','BANK_PROCESSING','COMPLETED','REJECTED'))`);
  await knex.raw(`ALTER TABLE refunds ADD CONSTRAINT check_refunds_amount CHECK (amount > 0)`);
  // UNIQUE partial index on gateway_txn_id WHERE status <> 'REJECTED' to prevent duplicate refunds for the same txn
  await knex.raw(`CREATE UNIQUE INDEX idx_refunds_unique_txn ON refunds (gateway_txn_id) WHERE status <> 'REJECTED'`);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('refunds');
  await knex.schema.dropTableIfExists('recon_items');
  await knex.schema.dropTableIfExists('recon_runs');
};
