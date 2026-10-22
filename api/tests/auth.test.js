'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');
const authRouter = require('../src/routes/auth');

describe('Step 2: Authentication & Authorization (/auth, requireAuth, requireRole)', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  afterAll(async () => {
    await knex.destroy();
  });

  beforeEach(() => {
    // Reset rate limiter trước mỗi bài test để không ảnh hưởng lẫn nhau
    authRouter._resetRateLimits();
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login successfully with valid customer credentials and set cookie', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'khachhang@gmail.com', password: 'Password@123' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('khachhang@gmail.com');
      expect(res.body.data.user.role).toBe('CUSTOMER');
      expect(res.body.data.user.password_hash).toBeUndefined();

      // Kiểm tra Set-Cookie header chứa beta_token
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expect(setCookie.some((c) => c.startsWith('beta_token='))).toBe(true);
      expect(setCookie.some((c) => c.includes('HttpOnly'))).toBe(true);
    });

    it('should fail with wrong password without leaking account existence', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'khachhang@gmail.com', password: 'IncorrectPassword' });

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
      expect(res.body.error.message).toBe('Email hoặc mật khẩu không chính xác.');
    });

    it('should fail with non-existent email using the exact same error message', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent@betacinemas.vn', password: 'Password@123' });

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
      expect(res.body.error.message).toBe('Email hoặc mật khẩu không chính xác.');
    });

    it('should return 400 VALIDATION_ERROR on invalid input format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: '' });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should trigger rate limit (429 RATE_LIMITED) after 5 failed login attempts', async () => {
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send({ email: 'khachhang@gmail.com', password: 'Wrong' });
        expect(res.status).toBe(401);
      }

      // Lần thứ 5 sai -> ném RATE_LIMITED 429
      const fifthRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'khachhang@gmail.com', password: 'Wrong' });

      expect(fifthRes.status).toBe(429);
      expect(fifthRes.body.ok).toBe(false);
      expect(fifthRes.body.error.code).toBe('RATE_LIMITED');

      // Lần thứ 6 dù mật khẩu đúng vẫn bị chặn do IP đang bị khóa
      const sixthRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'khachhang@gmail.com', password: 'Password@123' });

      expect(sixthRes.status).toBe(429);
      expect(sixthRes.body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return 401 AUTH_REQUIRED when accessing /me without cookie', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    it('should return user info when valid cookie is provided', async () => {
      // 1. Đăng nhập để lấy cookie
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'khachhang@gmail.com', password: 'Password@123' });

      const cookie = loginRes.headers['set-cookie'];

      // 2. Gọi /auth/me với cookie
      const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);

      expect(meRes.status).toBe(200);
      expect(meRes.body.ok).toBe(true);
      expect(meRes.body.data.user.email).toBe('khachhang@gmail.com');
      expect(meRes.body.data.user.role).toBe('CUSTOMER');
      expect(meRes.body.data.user.password_hash).toBeUndefined();
    });

    it('should return 401 AUTH_REQUIRED when cookie is tampered or invalid', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', ['beta_token=invalid_jwt_token_here; Path=/; HttpOnly']);

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout and clear authentication cookie', async () => {
      const res = await request(app).post('/api/v1/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.message).toBe('Đăng xuất thành công.');

      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      // Cookie được xóa (expires trong quá khứ hoặc max-age=0)
      expect(setCookie.some((c) => c.includes('beta_token=;') || c.includes('Max-Age=0') || c.includes('expires='))).toBe(true);
    });
  });

  describe('Authorization: requireRole', () => {
    it('should reject unauthenticated user accessing manager route with 401 AUTH_REQUIRED', async () => {
      const res = await request(app).get('/api/v1/demo/manager-only');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    it('should block CUSTOMER from accessing MANAGER route with 403 FORBIDDEN', async () => {
      // 1. Đăng nhập tài khoản CUSTOMER
      const customerLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'khachhang@gmail.com', password: 'Password@123' });

      const customerCookie = customerLogin.headers['set-cookie'];

      // 2. Thử truy cập route của MANAGER
      const res = await request(app)
        .get('/api/v1/demo/manager-only')
        .set('Cookie', customerCookie);

      expect(res.status).toBe(403);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject staff members from logging in via customer portal (/auth/login)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'manager@betacinemas.vn', password: 'Password@123' });

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
      expect(res.body.error.message).toBe('Email hoặc mật khẩu không chính xác.');
    });

    it('should allow MANAGER to access MANAGER route with 200 OK', async () => {
      // 1. Đăng nhập tài khoản MANAGER qua cổng admin
      const managerLogin = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: 'manager@betacinemas.vn', password: 'Password@123' });

      const managerCookie = managerLogin.headers['set-cookie'];

      // 2. Truy cập route của MANAGER
      const res = await request(app)
        .get('/api/v1/demo/manager-only')
        .set('Cookie', managerCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.role).toBe('MANAGER');
    });
  });
});
