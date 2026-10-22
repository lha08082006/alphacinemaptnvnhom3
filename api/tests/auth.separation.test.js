'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');
const clock = require('../src/lib/clock');
const authRouter = require('../src/routes/auth');

describe('Customer & Staff Authentication Separation (BE Auth Separation)', () => {
  let app;

  beforeAll(async () => {
    app = createApp();
  });

  afterAll(async () => {
    await knex.destroy();
  });

  beforeEach(async () => {
    // Reset rate limiter của auth router khách hàng
    authRouter._resetRateLimits();

    // Reset trạng thái khóa tài khoản trong DB cho các user test
    await knex('users')
      .whereIn('email', [
        'khachhang@gmail.com',
        'it@betacinemas.vn',
        'ketoan@betacinemas.vn',
        'cskh@betacinemas.vn',
        'manager@betacinemas.vn',
      ])
      .update({
        failed_login_attempts: 0,
        locked_until: null,
      });
  });

  describe('1. Cổng đăng nhập Khách hàng: POST /api/v1/auth/login', () => {
    it('Chỉ cho phép tài khoản CUSTOMER đăng nhập và set cookie beta_token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'khachhang@gmail.com', password: 'Password@123' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.user.role).toBe('CUSTOMER');

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c) => c.startsWith('beta_token='))).toBe(true);
      expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);
    });

    it('Từ chối tài khoản nhân viên (IT, ACCOUNTANT, CSKH, MANAGER) với cùng thông báo 401', async () => {
      const staffEmails = [
        'it@betacinemas.vn',
        'ketoan@betacinemas.vn',
        'cskh@betacinemas.vn',
        'manager@betacinemas.vn',
      ];

      for (const email of staffEmails) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send({ email, password: 'Password@123' });

        expect(res.status).toBe(401);
        expect(res.body.ok).toBe(false);
        expect(res.body.error.code).toBe('AUTH_REQUIRED');
        expect(res.body.error.message).toBe('Email hoặc mật khẩu không chính xác.');
      }
    });

    it('Email không tồn tại hoặc sai mật khẩu đều trả cùng thông báo 401', async () => {
      const resWrongPass = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'khachhang@gmail.com', password: 'WrongPassword' });

      expect(resWrongPass.status).toBe(401);
      expect(resWrongPass.body.error.code).toBe('AUTH_REQUIRED');
      expect(resWrongPass.body.error.message).toBe('Email hoặc mật khẩu không chính xác.');

      const resNonExistent = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'notfound@gmail.com', password: 'Password@123' });

      expect(resNonExistent.status).toBe(401);
      expect(resNonExistent.body.error.code).toBe('AUTH_REQUIRED');
      expect(resNonExistent.body.error.message).toBe('Email hoặc mật khẩu không chính xác.');
    });
  });

  describe('2. Cổng đăng nhập Nhân viên: POST /api/v1/admin/auth/login', () => {
    it('Chấp nhận các vai trò IT, ACCOUNTANT, CSKH, MANAGER và set cookie beta_admin_token', async () => {
      const staffAccounts = [
        { email: 'it@betacinemas.vn', role: 'IT' },
        { email: 'ketoan@betacinemas.vn', role: 'ACCOUNTANT' },
        { email: 'cskh@betacinemas.vn', role: 'CSKH' },
        { email: 'manager@betacinemas.vn', role: 'MANAGER' },
      ];

      for (const acc of staffAccounts) {
        const res = await request(app)
          .post('/api/v1/admin/auth/login')
          .send({ email: acc.email, password: 'Password@123' });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.data.user.email).toBe(acc.email);
        expect(res.body.data.user.role).toBe(acc.role);
        expect(res.body.data.user).toHaveProperty('must_change_password');

        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        expect(cookies.some((c) => c.startsWith('beta_admin_token='))).toBe(true);
        expect(cookies.some((c) => c.includes('Path=/api/v1/admin'))).toBe(true);
        expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);
      }
    });

    it('Từ chối vai trò CUSTOMER với cùng mã lỗi 401 và thông báo giống sai mật khẩu', async () => {
      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: 'khachhang@gmail.com', password: 'Password@123' });

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
      expect(res.body.error.message).toBe('Email hoặc mật khẩu không chính xác.');
    });

    it('Sai mật khẩu hoặc tài khoản không tồn tại đều trả cùng mã lỗi 401', async () => {
      const resWrongPass = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: 'it@betacinemas.vn', password: 'WrongPassword' });

      expect(resWrongPass.status).toBe(401);
      expect(resWrongPass.body.error.code).toBe('AUTH_REQUIRED');
      expect(resWrongPass.body.error.message).toBe('Email hoặc mật khẩu không chính xác.');

      const resNotFound = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: 'ghost_staff@betacinemas.vn', password: 'Password@123' });

      expect(resNotFound.status).toBe(401);
      expect(resNotFound.body.error.code).toBe('AUTH_REQUIRED');
      expect(resNotFound.body.error.message).toBe('Email hoặc mật khẩu không chính xác.');
    });
  });

  describe('3. Khóa tài khoản nhân viên & ghi nhận Audit Log', () => {
    it('Khóa tài khoản admin sau 5 lần nhập sai liên tiếp và ghi nhận audit_log', async () => {
      const targetEmail = 'it@betacinemas.vn';

      // 4 lần đầu nhập sai -> 401, ghi STAFF_LOGIN_FAILED
      for (let i = 1; i <= 4; i++) {
        const res = await request(app)
          .post('/api/v1/admin/auth/login')
          .send({ email: targetEmail, password: 'Wrong' });

        expect(res.status).toBe(401);
        expect(res.body.error.message).toBe('Email hoặc mật khẩu không chính xác.');
      }

      // Lần thứ 5 sai -> 401, kích hoạt khóa tài khoản
      const fifthRes = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: targetEmail, password: 'Wrong' });

      expect(fifthRes.status).toBe(401);

      // Kiểm tra CSDL xem tài khoản đã bị set locked_until chưa
      const staffUser = await knex('users').where({ email: targetEmail }).first();
      expect(staffUser.failed_login_attempts).toBe(5);
      expect(staffUser.locked_until).not.toBeNull();

      // Kiểm tra audit_log có bản ghi STAFF_ACCOUNT_LOCKED
      const lockLog = await knex('audit_log')
        .where({
          entity: 'USER',
          entity_id: String(staffUser.id),
          action: 'STAFF_ACCOUNT_LOCKED',
        })
        .first();
      expect(lockLog).toBeDefined();

      // Lần thứ 6 (kể cả dùng mật khẩu đúng) -> bị từ chối 429 RATE_LIMITED
      const sixthRes = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: targetEmail, password: 'Password@123' });

      expect(sixthRes.status).toBe(429);
      expect(sixthRes.body.error.code).toBe('RATE_LIMITED');
      expect(sixthRes.body.error.message).toContain('tạm khóa');
    });

    it('Đăng nhập thành công ghi nhận STAFF_LOGIN_SUCCESS và reset failed_attempts', async () => {
      const targetEmail = 'ketoan@betacinemas.vn';

      // Tạo 2 lần thử sai trước
      await request(app).post('/api/v1/admin/auth/login').send({ email: targetEmail, password: 'Bad' });
      await request(app).post('/api/v1/admin/auth/login').send({ email: targetEmail, password: 'Bad' });

      let user = await knex('users').where({ email: targetEmail }).first();
      expect(user.failed_login_attempts).toBe(2);

      // Đăng nhập đúng
      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: targetEmail, password: 'Password@123' });

      expect(res.status).toBe(200);

      user = await knex('users').where({ email: targetEmail }).first();
      expect(user.failed_login_attempts).toBe(0);
      expect(user.locked_until).toBeNull();

      const successLog = await knex('audit_log')
        .where({
          entity: 'USER',
          entity_id: String(user.id),
          action: 'STAFF_LOGIN_SUCCESS',
        })
        .orderBy('id', 'desc')
        .first();
      expect(successLog).toBeDefined();
    });
  });

  describe('4. Thông tin phiên, Đăng xuất & Đổi mật khẩu nhân viên', () => {
    let staffCookie;
    const staffEmail = 'cskh@betacinemas.vn';

    beforeEach(async () => {
      const loginRes = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: staffEmail, password: 'Password@123' });
      staffCookie = loginRes.headers['set-cookie'];
    });

    it('GET /api/v1/admin/auth/me trả thông tin tài khoản nhân viên', async () => {
      const res = await request(app)
        .get('/api/v1/admin/auth/me')
        .set('Cookie', staffCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.user.email).toBe(staffEmail);
      expect(res.body.data.user.role).toBe('CSKH');
      expect(res.body.data.user).toHaveProperty('must_change_password');
    });

    it('POST /api/v1/admin/auth/logout xóa cookie beta_admin_token', async () => {
      const res = await request(app)
        .post('/api/v1/admin/auth/logout')
        .set('Cookie', staffCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const setCookies = res.headers['set-cookie'];
      expect(setCookies).toBeDefined();
      expect(setCookies.some((c) => c.includes('beta_admin_token=;') || c.includes('Max-Age=0'))).toBe(true);
    });

    it('Đổi mật khẩu: sai mật khẩu cũ -> 400; đúng mật khẩu -> thành công và cập nhật must_change_password = false', async () => {
      // 1. Nhập sai mật khẩu cũ -> 400
      const badOld = await request(app)
        .post('/api/v1/admin/auth/change-password')
        .set('Cookie', staffCookie)
        .send({
          oldPassword: 'SaiMatKhauCu',
          newPassword: 'NewPassword@999',
        });

      expect(badOld.status).toBe(400);
      expect(badOld.body.error.code).toBe('VALIDATION_ERROR');

      // 2. Nhập đúng mật khẩu cũ -> 200
      const goodRes = await request(app)
        .post('/api/v1/admin/auth/change-password')
        .set('Cookie', staffCookie)
        .send({
          oldPassword: 'Password@123',
          newPassword: 'NewPassword@999',
        });

      expect(goodRes.status).toBe(200);
      expect(goodRes.body.ok).toBe(true);
      expect(goodRes.body.data.must_change_password).toBe(false);

      // Kiểm tra trong CSDL
      const updatedUser = await knex('users').where({ email: staffEmail }).first();
      expect(updatedUser.must_change_password).toBe(0); // false in sqlite

      // Đăng nhập lại bằng mật khẩu mới thành công
      const reLogin = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: staffEmail, password: 'NewPassword@999' });
      expect(reLogin.status).toBe(200);

      // Đổi lại mật khẩu cũ để không ảnh hưởng bài test khác
      await request(app)
        .post('/api/v1/admin/auth/change-password')
        .set('Cookie', reLogin.headers['set-cookie'])
        .send({
          oldPassword: 'NewPassword@999',
          newPassword: 'Password@123',
        });
    });
  });

  describe('5. Ràng buộc bảo mật chéo (Cross-Portal Security Constraints)', () => {
    let customerCookie;
    let staffCookie;

    beforeAll(async () => {
      const custLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'khachhang@gmail.com', password: 'Password@123' });
      customerCookie = custLogin.headers['set-cookie'];

      const staffLogin = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: 'manager@betacinemas.vn', password: 'Password@123' });
      staffCookie = staffLogin.headers['set-cookie'];
    });

    it('Khách hàng không có token gọi API admin bị 401 AUTH_REQUIRED', async () => {
      const res = await request(app).get('/api/v1/admin/reports/reconciliation');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    it('Khách hàng gửi cookie beta_token gọi API admin bị 403 FORBIDDEN', async () => {
      const resRecon = await request(app)
        .get('/api/v1/admin/reports/reconciliation')
        .set('Cookie', customerCookie);
      expect(resRecon.status).toBe(403);
      expect(resRecon.body.error.code).toBe('FORBIDDEN');

      const resTickets = await request(app)
        .get('/api/v1/admin/tickets')
        .set('Cookie', customerCookie);
      expect(resTickets.status).toBe(403);
      expect(resTickets.body.error.code).toBe('FORBIDDEN');
    });

    it('Token nhân viên (beta_admin_token) không dùng được ở các endpoint khách hàng -> 401 AUTH_REQUIRED', async () => {
      // Gọi endpoint /orders/status
      const resOrder = await request(app)
        .get('/api/v1/orders/BC_TEST_ORDER/status')
        .set('Cookie', staffCookie);
      expect(resOrder.status).toBe(401);
      expect(resOrder.body.error.code).toBe('AUTH_REQUIRED');

      // Gọi endpoint /notifications
      const resNotif = await request(app)
        .get('/api/v1/notifications')
        .set('Cookie', staffCookie);
      expect(resNotif.status).toBe(401);
      expect(resNotif.body.error.code).toBe('AUTH_REQUIRED');

      // Gọi endpoint /auth/me của khách hàng
      const resCustMe = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', staffCookie);
      expect(resCustMe.status).toBe(401);
      expect(resCustMe.body.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('6. Frontend UI Routes & Zero-Trust LocalStorage Acceptance', () => {
    it('Route /dang-nhap trả về giao diện đăng nhập khách hàng (200 OK)', async () => {
      const res = await request(app).get('/dang-nhap');
      expect(res.status).toBe(200);
      expect(res.text).toContain('BETA CINEMAS');
      expect(res.text).toContain('/auth/login');
      // Không chứa bất kỳ link nào trỏ tới cổng admin
      expect(res.text).not.toContain('/admin');
      expect(res.text).not.toContain('admin/login.html');
    });

    it('Route /admin/login trả về giao diện nội bộ riêng (200 OK)', async () => {
      const res = await request(app).get('/admin/login');
      expect(res.status).toBe(200);
      expect(res.text).toContain('CỔNG NỘI BỘ VẬN HÀNH');
      expect(res.text).toContain('/admin/auth/login');
    });

    it('Nghiệm thu: Không có link nào từ web khách (dang-nhap.html, layout.js) trỏ tới admin', () => {
      const fs = require('fs');
      const path = require('path');
      const dangNhapHtml = fs.readFileSync(path.join(__dirname, '../../dang-nhap.html'), 'utf8');
      const layoutJs = fs.readFileSync(path.join(__dirname, '../../js/layout.js'), 'utf8');

      expect(dangNhapHtml).not.toContain('admin/login.html');
      expect(dangNhapHtml).not.toContain('admin/index.html');
      expect(layoutJs).not.toContain('admin/login.html');
      expect(layoutJs).not.toContain('admin/index.html');
    });

    it('Nghiệm thu: Không tin tưởng localStorage, sửa localStorage thủ công vẫn không vào được API dữ liệu admin', async () => {
      // Giả lập hacker sửa localStorage với role MANAGER nhưng không có cookie beta_admin_token
      const resRecon = await request(app).get('/api/v1/admin/reports/reconciliation');
      expect(resRecon.status).toBe(401);
      expect(resRecon.body.error.code).toBe('AUTH_REQUIRED');

      const resRefunds = await request(app).get('/api/v1/admin/refunds');
      expect(resRefunds.status).toBe(401);
      expect(resRefunds.body.error.code).toBe('AUTH_REQUIRED');

      const resTickets = await request(app).get('/api/v1/admin/tickets');
      expect(resTickets.status).toBe(401);
      expect(resTickets.body.error.code).toBe('AUTH_REQUIRED');

      const resMe = await request(app).get('/api/v1/admin/auth/me');
      expect(resMe.status).toBe(401);
      expect(resMe.body.error.code).toBe('AUTH_REQUIRED');
    });
  });
});
