'use strict';

/**
 * MIGRATION 001 - Gateway
 */
exports.up = async (knex) => {
  // merchants
  await knex.schema.createTable('merchants', (t) => {
    t.increments('id').primary();
    t.string('code').notNullable().unique();
    t.string('name').notNullable();
    t.string('api_key').notNullable();
    t.string('webhook_url').notNullable();
    t.string('webhook_secret').notNullable();
  });

  // txns
  await knex.schema.createTable('txns', (t) => {
    t.string('txn_id').primary();
    t.integer('merchant_id').notNullable().references('id').inTable('merchants').onDelete('RESTRICT');
    t.string('merchant_order_ref').notNullable();
    t.string('method').notNullable();
    t.integer('amount').notNullable();
    t.string('status').notNullable(); // CHECK IN (PENDING,SUCCESS,FAILED,CANCELLED,EXPIRED)
    t.boolean('debited').notNullable().defaultTo(false); // 0 or 1
    t.string('scenario').nullable(); // CHECK IN (S1,S2,S3,S4,S5)
    t.string('created_at').notNullable();
    t.string('paid_at').nullable();
    t.string('expires_at').notNullable();
    t.string('return_url').notNullable();
    
    t.index(['merchant_order_ref']);
  });
  await knex.raw(`ALTER TABLE txns ADD CONSTRAINT check_txns_status CHECK (status IN ('PENDING','SUCCESS','FAILED','CANCELLED','EXPIRED'))`);
  await knex.raw(`ALTER TABLE txns ADD CONSTRAINT check_txns_scenario CHECK (scenario IS NULL OR scenario IN ('S1','S2','S3','S4','S5'))`);
  await knex.raw(`ALTER TABLE txns ADD CONSTRAINT check_txns_amount CHECK (amount >= 0)`);

  // webhook_deliveries
  await knex.schema.createTable('webhook_deliveries', (t) => {
    t.increments('id').primary();
    t.string('txn_id').notNullable().references('txn_id').inTable('txns').onDelete('CASCADE');
    t.string('event_id').notNullable().unique();
    t.string('mode').notNullable(); // CHECK IN (OK,LOST,DELAYED)
    t.string('scheduled_at').notNullable();
    t.string('delivered_at').nullable();
    t.integer('attempts').notNullable().defaultTo(0);
    t.integer('last_http_status').nullable();
    t.string('status').notNullable(); // CHECK IN (PENDING,DELIVERED,DROPPED,FAILED)
  });
  await knex.raw(`ALTER TABLE webhook_deliveries ADD CONSTRAINT check_wd_mode CHECK (mode IN ('OK','LOST','DELAYED'))`);
  await knex.raw(`ALTER TABLE webhook_deliveries ADD CONSTRAINT check_wd_status CHECK (status IN ('PENDING','DELIVERED','DROPPED','FAILED'))`);

  // refunds
  await knex.schema.createTable('refunds', (t) => {
    t.string('refund_ref').primary(); // merchant's refund_id
    t.string('txn_id').notNullable().references('txn_id').inTable('txns').onDelete('RESTRICT');
    t.integer('amount').notNullable();
    t.string('status').notNullable(); // CHECK IN (ACCEPTED,BANK_PROCESSING,COMPLETED,REJECTED)
    t.string('idempotency_key').notNullable().unique();
    t.string('created_at').notNullable();
    t.string('complete_at').nullable();
    t.string('reject_reason').nullable();
  });
  await knex.raw(`ALTER TABLE refunds ADD CONSTRAINT check_refunds_status CHECK (status IN ('ACCEPTED','BANK_PROCESSING','COMPLETED','REJECTED'))`);
  await knex.raw(`ALTER TABLE refunds ADD CONSTRAINT check_refunds_amount CHECK (amount > 0)`);
  // UNIQUE partial index on txn_id WHERE status <> 'REJECTED'
  await knex.raw(`CREATE UNIQUE INDEX idx_gw_refunds_unique_txn ON refunds (txn_id) WHERE status <> 'REJECTED'`);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('refunds');
  await knex.schema.dropTableIfExists('webhook_deliveries');
  await knex.schema.dropTableIfExists('txns');
  await knex.schema.dropTableIfExists('merchants');
};
