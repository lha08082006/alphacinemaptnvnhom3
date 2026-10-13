'use strict';

/**
 * MIGRATION 005 - Vận hành và Hỗ trợ (Ops)
 */
exports.up = async (knex) => {
  // support_tickets
  await knex.schema.createTable('support_tickets', (t) => {
    t.string('ticket_id').primary();
    t.string('order_id').nullable().references('order_id').inTable('orders').onDelete('RESTRICT');
    t.integer('user_id').nullable().references('id').inTable('users').onDelete('RESTRICT');
    t.string('contact').notNullable();
    t.string('source').notNullable(); // CHECK IN (CUSTOMER,SYSTEM)
    t.string('status').notNullable(); // CHECK IN (NEW,IN_REVIEW,WAITING_REFUND,RESOLVED,REJECTED)
    t.integer('assigned_to').nullable().references('id').inTable('users').onDelete('RESTRICT');
    t.string('sla_due_at').nullable();
    t.string('created_at').notNullable();
    t.string('resolved_at').nullable();
    t.text('resolution').nullable();
  });
  await knex.raw(`ALTER TABLE support_tickets ADD CONSTRAINT check_st_source CHECK (source IN ('CUSTOMER','SYSTEM'))`);
  await knex.raw(`ALTER TABLE support_tickets ADD CONSTRAINT check_st_status CHECK (status IN ('NEW','IN_REVIEW','WAITING_REFUND','RESOLVED','REJECTED'))`);

  // support_ticket_notes
  await knex.schema.createTable('support_ticket_notes', (t) => {
    t.increments('id').primary();
    t.string('ticket_id').notNullable().references('ticket_id').inTable('support_tickets').onDelete('CASCADE');
    t.integer('author_id').nullable().references('id').inTable('users').onDelete('RESTRICT');
    t.text('note').notNullable();
    t.string('created_at').notNullable();
  });

  // notifications
  await knex.schema.createTable('notifications', (t) => {
    t.increments('id').primary();
    t.string('order_id').nullable().references('order_id').inTable('orders').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('channel').notNullable(); // CHECK IN (WEB,EMAIL,SMS)
    t.string('title').notNullable();
    t.text('body').notNullable();
    t.string('status').notNullable(); // CHECK IN (PENDING,SENT,FAILED)
    t.string('scheduled_at').notNullable();
    t.string('sent_at').nullable();
    t.string('read_at').nullable();
    
    t.index(['user_id', 'read_at']);
    t.index(['status', 'scheduled_at']);
  });
  await knex.raw(`ALTER TABLE notifications ADD CONSTRAINT check_notif_channel CHECK (channel IN ('WEB','EMAIL','SMS'))`);
  await knex.raw(`ALTER TABLE notifications ADD CONSTRAINT check_notif_status CHECK (status IN ('PENDING','SENT','FAILED'))`);

  // audit_log
  await knex.schema.createTable('audit_log', (t) => {
    t.increments('id').primary();
    t.string('at').notNullable();
    t.string('actor_type').notNullable();
    t.string('actor_id').notNullable();
    t.string('action').notNullable();
    t.string('entity').notNullable();
    t.string('entity_id').notNullable();
    t.json('before_json').nullable();
    t.json('after_json').nullable();

    t.index(['entity', 'entity_id']);
  });

  // settings
  await knex.schema.createTable('settings', (t) => {
    t.string('key').primary();
    t.string('value').notNullable();
    t.string('updated_at').notNullable();
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('settings');
  await knex.schema.dropTableIfExists('audit_log');
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('support_ticket_notes');
  await knex.schema.dropTableIfExists('support_tickets');
};
