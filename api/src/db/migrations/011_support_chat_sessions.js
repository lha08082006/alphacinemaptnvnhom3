'use strict';

/**
 * Migration 011: Bảng support_chat_sessions phục vụ lưu trữ phiên chat serverless.
 */
exports.up = async (knex) => {
  const exists = await knex.schema.hasTable('support_chat_sessions');
  if (!exists) {
    await knex.schema.createTable('support_chat_sessions', (t) => {
      t.string('session_id').primary();
      t.string('verified_order_id').nullable();
      t.string('verified_contact').nullable();
      t.integer('message_count').defaultTo(0);
      t.text('created_ticket_json').nullable();
      t.bigInteger('last_active_at').notNullable();
      t.string('created_at').notNullable();
    });
  }
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('support_chat_sessions');
};
