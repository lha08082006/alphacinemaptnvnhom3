'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');

describe('Customer Auth & Profile Extensions', () => {
  let app;
  let testUserCookie;
  const uniqueSuffix = Date.now().toString().slice(-4);
  const testEmail = `khach_${uniqueSuffix}@gmail.com`;

  beforeAll(async () => {
    app = createApp();
  });

  afterAll(async () => {
    await knex('users').where({ email: testEmail }).del();
    await knex.destroy();
  });

  it('1. Đăng ký tài khoản khách hàng mới (POST /auth/register)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        password: 'Password@123',
        full_name: 'Nguyễn Văn Test',
        phone: '0987654321',
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.email).toBe(testEmail);
    expect(res.body.data.user.role).toBe('CUSTOMER');
    expect(res.body.data.user.points).toBe(50);
    expect(res.headers['set-cookie']).toBeDefined();

    testUserCookie = res.headers['set-cookie'];
  });

  it('2. Đăng ký trùng email trả về 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        password: 'Password@123',
        full_name: 'Nguyễn Văn Trùng',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('3. Cập nhật thông tin tài khoản (PUT /auth/profile)', async () => {
    const res = await request(app)
      .put('/api/v1/auth/profile')
      .set('Cookie', testUserCookie)
      .send({
        full_name: 'Nguyễn Văn Đã Cập Nhật',
        phone: '0911223344',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.user.full_name).toBe('Nguyễn Văn Đã Cập Nhật');
    expect(res.body.data.user.phone).toBe('0911223344');
  });

  it('4. Đổi mật khẩu thành công (POST /auth/change-password)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Cookie', testUserCookie)
      .send({
        old_password: 'Password@123',
        new_password: 'NewPassword@456',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('5. Đăng nhập lại với mật khẩu mới thành công', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: 'NewPassword@456',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.user.email).toBe(testEmail);
  });
});
