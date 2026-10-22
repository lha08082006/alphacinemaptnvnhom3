'use strict';

/**
 * MIGRATION 007 - Tách biệt xác thực nhân viên và khách hàng
 * Thêm các cột quản lý mật khẩu mặc định và khóa tài khoản cho users
 */
exports.up = async (knex) => {
  await knex.schema.alterTable('users', (t) => {
    t.boolean('must_change_password').notNullable().defaultTo(false);
    t.integer('failed_login_attempts').notNullable().defaultTo(0);
    t.string('locked_until').nullable();
  });

  // Thiết lập must_change_password = true cho các tài khoản nhân viên mặc định
  await knex('users')
    .whereIn('role', ['IT', 'ACCOUNTANT', 'CSKH', 'MANAGER'])
    .update({ must_change_password: true });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('locked_until');
    t.dropColumn('failed_login_attempts');
    t.dropColumn('must_change_password');
  });
};
