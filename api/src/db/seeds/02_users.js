'use strict';

const bcrypt = require('bcryptjs'); // Thuần JS, tương thích Windows
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

exports.seed = async function (knex) {
  await knex.raw('PRAGMA foreign_keys = OFF');
  await knex('users').del();
  
  const defaultPass = process.env.SEED_DEFAULT_PASSWORD || 'Password@123';
  
  const hash = bcrypt.hashSync(defaultPass, 10);
  const now = require('../../lib/clock').nowIso();

  const users = [
    {
      id: 1,
      email: 'khachhang@gmail.com',
      phone: '0987654321',
      full_name: 'Khách Hàng',
      password_hash: hash,
      role: 'CUSTOMER',
      points: 100,
      is_active: true,
      must_change_password: false,
      failed_login_attempts: 0,
      locked_until: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: 2,
      email: 'khachhang2@gmail.com',
      phone: '0987654322',
      full_name: 'Khách Hàng 2',
      password_hash: hash,
      role: 'CUSTOMER',
      points: 0,
      is_active: true,
      must_change_password: false,
      failed_login_attempts: 0,
      locked_until: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: 3,
      email: 'it@betacinemas.vn',
      phone: '0987654323',
      full_name: 'NV IT',
      password_hash: hash,
      role: 'IT',
      points: 0,
      is_active: true,
      must_change_password: true,
      failed_login_attempts: 0,
      locked_until: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: 4,
      email: 'ketoan@betacinemas.vn',
      phone: '0987654324',
      full_name: 'NV Kế Toán',
      password_hash: hash,
      role: 'ACCOUNTANT',
      points: 0,
      is_active: true,
      must_change_password: true,
      failed_login_attempts: 0,
      locked_until: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: 5,
      email: 'cskh@betacinemas.vn',
      phone: '0987654325',
      full_name: 'NV CSKH',
      password_hash: hash,
      role: 'CSKH',
      points: 0,
      is_active: true,
      must_change_password: true,
      failed_login_attempts: 0,
      locked_until: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: 6,
      email: 'manager@betacinemas.vn',
      phone: '0987654326',
      full_name: 'Quản Lý',
      password_hash: hash,
      role: 'MANAGER',
      points: 0,
      is_active: true,
      must_change_password: true,
      failed_login_attempts: 0,
      locked_until: null,
      created_at: now,
      updated_at: now,
    },
  ];

  await knex('users').insert(users);
  await knex.raw('PRAGMA foreign_keys = ON');
};
