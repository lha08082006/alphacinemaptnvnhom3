'use strict';

/**
 * MIGRATION 006 - Cổng thanh toán VNPay
 */
exports.up = async (knex) => {
  // Thêm các cột cho VNPay vào payment_attempts
  await knex.schema.alterTable('payment_attempts', (t) => {
    t.string('gateway_trans_no').nullable();
    t.string('gateway_pay_date').nullable();
    t.string('gateway_response_code').nullable();
    t.string('bank_code').nullable();
  });

  // Unique index một phần trên gateway_trans_no WHERE NOT NULL
  await knex.raw(
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_pa_gateway_trans_no ON payment_attempts(gateway_trans_no) WHERE gateway_trans_no IS NOT NULL'
  );

  // Thêm gateway_request_id vào refunds
  await knex.schema.alterTable('refunds', (t) => {
    t.string('gateway_request_id').nullable();
  });
};

exports.down = async (knex) => {
  // Xóa partial unique index
  await knex.raw('DROP INDEX IF EXISTS uq_pa_gateway_trans_no');

  // Xóa cột trong refunds
  await knex.schema.alterTable('refunds', (t) => {
    t.dropColumn('gateway_request_id');
  });

  // Xóa cột trong payment_attempts
  await knex.schema.alterTable('payment_attempts', (t) => {
    t.dropColumn('bank_code');
    t.dropColumn('gateway_response_code');
    t.dropColumn('gateway_pay_date');
    t.dropColumn('gateway_trans_no');
  });
};
