'use strict';

/**
 * MIGRATION 008 - Lưu thông tin đồng ý điều khoản thanh toán vào orders
 */
exports.up = async (knex) => {
  const hasTermsAccepted = await knex.schema.hasColumn('orders', 'terms_accepted_at');
  if (!hasTermsAccepted) {
    await knex.schema.alterTable('orders', (t) => {
      t.string('terms_accepted_at').nullable();
      t.string('terms_version').nullable();
    });
  }
};

exports.down = async (knex) => {
  await knex.schema.alterTable('orders', (t) => {
    t.dropColumn('terms_accepted_at');
    t.dropColumn('terms_version');
  });
};
