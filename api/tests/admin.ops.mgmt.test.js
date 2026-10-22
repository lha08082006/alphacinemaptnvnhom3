'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');
const bcrypt = require('bcryptjs');

describe('Step 13: System Settings, User Management & Audit Log Verification', () => {
  let app;
  const cookies = {
    CUSTOMER: null,
    IT: null,
    ACCOUNTANT: null,
    CSKH: null,
    MANAGER: null,
  };

  let managerUserId = null;
  let testCreatedUserId = null;
  const testStaffEmail = 'test_staff_ops_mgmt@betacinemas.vn';

  beforeAll(async () => {
    app = createApp();

    // 1. Đăng nhập các vai trò
    const resCust = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang@gmail.com', password: 'Password@123' });
    cookies.CUSTOMER = resCust.headers['set-cookie'];

    const resIt = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'it@betacinemas.vn', password: 'Password@123' });
    cookies.IT = resIt.headers['set-cookie'];

    const resAcct = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'ketoan@betacinemas.vn', password: 'Password@123' });
    cookies.ACCOUNTANT = resAcct.headers['set-cookie'];

    const resCskh = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'cskh@betacinemas.vn', password: 'Password@123' });
    cookies.CSKH = resCskh.headers['set-cookie'];

    const resMgr = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'manager@betacinemas.vn', password: 'Password@123' });
    cookies.MANAGER = resMgr.headers['set-cookie'];

    // Lấy ID của manager
    const mgrUser = await knex('users').where({ email: 'manager@betacinemas.vn' }).first();
    managerUserId = mgrUser?.id;

    // Dọn dẹp tài khoản test cũ nếu có
    await knex('audit_log').where('action', 'like', '%USER%').where('after_json', 'like', `%${testStaffEmail}%`).del();
    await knex('users').where({ email: testStaffEmail }).del();
  });

  afterAll(async () => {
    // Khôi phục settings mặc định để không ảnh hưởng đến các test suite khác
    await knex('settings').where({ key: 'holdMinutes' }).update({ value: '5' });
    await knex('settings').where({ key: 'mode' }).update({ value: 'ASIS' });
    await knex('settings').where({ key: 'callbackTimeoutSec' }).update({ value: '15' });
    await knex('settings').where({ key: 'reconcileIntervalMin' }).update({ value: '15' });
    await knex('settings').where({ key: 'pendingVerifyHoldMin' }).update({ value: '15' });

    // Dọn dẹp tài khoản test
    if (testCreatedUserId) {
      await knex('audit_log').where({ entity: 'USER', entity_id: String(testCreatedUserId) }).del();
      await knex('users').where({ id: testCreatedUserId }).del();
    }
    await knex('users').where({ email: testStaffEmail }).del();
    await knex.destroy();
  });

  describe('PHẦN 1: Cấu hình Hệ thống (IT, MANAGER)', () => {
    it('1.1. Phân quyền: IT và MANAGER được phép (200), Kế toán, CSKH và Khách hàng bị chặn (403)', async () => {
      const resCust = await request(app)
        .get('/api/v1/admin/settings')
        .set('Cookie', cookies.CUSTOMER);
      expect(resCust.status).toBe(403);

      const resAcct = await request(app)
        .get('/api/v1/admin/settings')
        .set('Cookie', cookies.ACCOUNTANT);
      expect(resAcct.status).toBe(403);

      const resCskh = await request(app)
        .get('/api/v1/admin/settings')
        .set('Cookie', cookies.CSKH);
      expect(resCskh.status).toBe(403);

      const resIt = await request(app)
        .get('/api/v1/admin/settings')
        .set('Cookie', cookies.IT);
      expect(resIt.status).toBe(200);

      const resMgr = await request(app)
        .get('/api/v1/admin/settings')
        .set('Cookie', cookies.MANAGER);
      expect(resMgr.status).toBe(200);
    });

    it('1.2. Cập nhật cấu hình (chế độ ASIS/TOBE, timeout, HOLD_MINUTES, chu kỳ đối soát) và ghi audit_log', async () => {
      const payload = {
        mode: 'TOBE',
        holdMinutes: 8,
        callbackTimeoutSec: 45,
        reconcileIntervalMin: 15,
        pendingVerifyHoldMin: 20,
      };

      const res = await request(app)
        .patch('/api/v1/admin/settings')
        .set('Cookie', cookies.IT)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.mode).toBe('TOBE');
      expect(res.body.data.holdMinutes).toBe('8');
      expect(res.body.data.callbackTimeoutSec).toBe('45');
      expect(res.body.data.reconcileIntervalMin).toBe('15');

      // Kiểm tra CSDL bảng settings
      const rowMode = await knex('settings').where({ key: 'mode' }).first();
      expect(rowMode.value).toBe('TOBE');

      // Kiểm tra audit_log ghi nhận có đầy đủ before_json và after_json
      const log = await knex('audit_log')
        .where({
          action: 'UPDATE_SETTINGS',
          entity: 'SETTINGS',
          entity_id: 'SYSTEM',
        })
        .orderBy('id', 'desc')
        .first();

      expect(log).toBeDefined();
      expect(['USER', 'STAFF']).toContain(log.actor_type);
      expect(log.before_json).toBeDefined();
      expect(log.after_json).toBeDefined();

      const afterObj = JSON.parse(log.after_json);
      expect(afterObj.mode).toBe('TOBE');
      expect(afterObj.holdMinutes).toBe('8');
      expect(afterObj.callbackTimeoutSec).toBe('45');
      expect(afterObj.reconcileIntervalMin).toBe('15');
    });
  });

  describe('PHẦN 2: Quản trị Tài khoản (Chỉ dành cho MANAGER)', () => {
    it('2.1. Phân quyền: IT, Kế toán, CSKH và Khách hàng không có quyền tạo tài khoản (403)', async () => {
      const resIt = await request(app)
        .post('/api/v1/admin/users')
        .set('Cookie', cookies.IT)
        .send({
          email: 'unauth_user@betacinemas.vn',
          password: 'Password@123',
          full_name: 'Test IT Create',
          role: 'CSKH',
        });
      expect(resIt.status).toBe(403);
    });

    it('2.2. MANAGER tạo tài khoản nhân viên mới: băm mật khẩu, đặt must_change_password = true, ghi audit_log', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Cookie', cookies.MANAGER)
        .send({
          email: testStaffEmail,
          password: 'Password@123',
          full_name: 'Nhân viên Thử nghiệm',
          phone: '0912345678',
          role: 'CSKH',
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.email).toBe(testStaffEmail);
      expect(res.body.data.role).toBe('CSKH');
      expect(Boolean(res.body.data.must_change_password)).toBe(true);

      testCreatedUserId = res.body.data.id;

      // Kiểm tra mật khẩu trong DB được băm an toàn
      const userInDb = await knex('users').where({ id: testCreatedUserId }).first();
      expect(userInDb).toBeDefined();
      expect(userInDb.password_hash).not.toBe('Password@123');
      expect(bcrypt.compareSync('Password@123', userInDb.password_hash)).toBe(true);

      // Kiểm tra audit_log
      const log = await knex('audit_log')
        .where({
          action: 'CREATE_USER',
          entity: 'USER',
          entity_id: String(testCreatedUserId),
        })
        .first();

      expect(log).toBeDefined();
      expect(log.actor_type).toBe('STAFF');
      const afterObj = JSON.parse(log.after_json);
      expect(afterObj.email).toBe(testStaffEmail);
      expect(afterObj.role).toBe('CSKH');
    });

    it('2.3. Chặn tạo trùng email -> 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Cookie', cookies.MANAGER)
        .send({
          email: testStaffEmail,
          password: 'Password@123',
          full_name: 'Nhân viên Trùng Email',
          role: 'ACCOUNTANT',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('2.4. Gán vai trò mới cho nhân viên khác -> thành công & ghi audit_log', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${testCreatedUserId}/role`)
        .set('Cookie', cookies.MANAGER)
        .send({ role: 'ACCOUNTANT' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('ACCOUNTANT');

      const userInDb = await knex('users').where({ id: testCreatedUserId }).first();
      expect(userInDb.role).toBe('ACCOUNTANT');

      // Kiểm tra audit_log
      const log = await knex('audit_log')
        .where({
          action: 'CHANGE_USER_ROLE',
          entity: 'USER',
          entity_id: String(testCreatedUserId),
        })
        .first();

      expect(log).toBeDefined();
      expect(JSON.parse(log.before_json).role).toBe('CSKH');
      expect(JSON.parse(log.after_json).role).toBe('ACCOUNTANT');
    });

    it('2.5. Chặn tự hạ quyền quản lý của chính mình -> 403 FORBIDDEN', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${managerUserId}/role`)
        .set('Cookie', cookies.MANAGER)
        .send({ role: 'CSKH' }); // Cố tình tự hạ xuống CSKH

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('không thể tự hạ quyền');

      // Đảm bảo vai trò trong DB vẫn là MANAGER
      const mgrInDb = await knex('users').where({ id: managerUserId }).first();
      expect(mgrInDb.role).toBe('MANAGER');
    });

    it('2.6. Khóa tài khoản nhân viên khác -> thành công & ghi audit_log', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${testCreatedUserId}/status`)
        .set('Cookie', cookies.MANAGER)
        .send({ is_active: false });

      expect(res.status).toBe(200);
      expect(res.body.data.is_active).toBe(false);

      const userInDb = await knex('users').where({ id: testCreatedUserId }).first();
      expect(Boolean(userInDb.is_active)).toBe(false);

      // Kiểm tra audit_log
      const log = await knex('audit_log')
        .where({
          action: 'TOGGLE_USER_STATUS',
          entity: 'USER',
          entity_id: String(testCreatedUserId),
        })
        .first();

      expect(log).toBeDefined();
      expect(JSON.parse(log.after_json).is_active).toBe(false);
    });

    it('2.7. Chặn tự khóa chính mình -> 403 FORBIDDEN', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${managerUserId}/status`)
        .set('Cookie', cookies.MANAGER)
        .send({ is_active: false }); // Cố tình tự khóa

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('không thể tự khóa tài khoản của chính mình');

      // Đảm bảo tài khoản trong DB vẫn active
      const mgrInDb = await knex('users').where({ id: managerUserId }).first();
      expect(Boolean(mgrInDb.is_active)).toBe(true);
    });

    it('2.8. Mở khóa lại tài khoản: reset failed_login_attempts và locked_until', async () => {
      // Đặt giả lập failed_login_attempts
      await knex('users').where({ id: testCreatedUserId }).update({
        failed_login_attempts: 5,
        locked_until: new Date(Date.now() + 3600 * 1000).toISOString(),
      });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${testCreatedUserId}/status`)
        .set('Cookie', cookies.MANAGER)
        .send({ is_active: true });

      expect(res.status).toBe(200);
      expect(res.body.data.is_active).toBe(true);

      const userInDb = await knex('users').where({ id: testCreatedUserId }).first();
      expect(Boolean(userInDb.is_active)).toBe(true);
      expect(userInDb.failed_login_attempts).toBe(0);
      expect(userInDb.locked_until).toBeNull();
    });

    it('2.9. Đặt lại mật khẩu nhân viên: băm mật khẩu mới, bắt buộc đổi mật khẩu lần sau & ghi audit_log', async () => {
      const newTempPass = 'NewSecurePass@2026';
      const res = await request(app)
        .post(`/api/v1/admin/users/${testCreatedUserId}/reset-password`)
        .set('Cookie', cookies.MANAGER)
        .send({ newPassword: newTempPass });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const userInDb = await knex('users').where({ id: testCreatedUserId }).first();
      expect(bcrypt.compareSync(newTempPass, userInDb.password_hash)).toBe(true);
      expect(Boolean(userInDb.must_change_password)).toBe(true);

      // Kiểm tra audit_log
      const log = await knex('audit_log')
        .where({
          action: 'RESET_USER_PASSWORD',
          entity: 'USER',
          entity_id: String(testCreatedUserId),
        })
        .first();

      expect(log).toBeDefined();
    });
  });

  describe('PHẦN 3: Xem & Lọc Nhật ký Kiểm toán (IT, MANAGER)', () => {
    it('3.1. Phân quyền: IT và MANAGER được phép (200), Kế toán, CSKH và Khách hàng bị chặn (403)', async () => {
      const resCust = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Cookie', cookies.CUSTOMER);
      expect(resCust.status).toBe(403);

      const resAcct = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Cookie', cookies.ACCOUNTANT);
      expect(resAcct.status).toBe(403);

      const resIt = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Cookie', cookies.IT);
      expect(resIt.status).toBe(200);

      const resMgr = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Cookie', cookies.MANAGER);
      expect(resMgr.status).toBe(200);
    });

    it('3.2. Lọc nhật ký theo Người thực hiện (actorId)', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/audit-logs?actorId=${managerUserId}&page=1&limit=10`)
        .set('Cookie', cookies.MANAGER);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.items.every((l) => String(l.actor_id) === String(managerUserId))).toBe(true);
      // Có thông tin người thực hiện
      expect(res.body.data.items[0].actor_name).toBeDefined();
      expect(res.body.data.items[0].actor_email).toBe('manager@betacinemas.vn');
    });

    it('3.3. Lọc nhật ký theo Hành động (action: UPDATE_SETTINGS)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs?action=UPDATE_SETTINGS&page=1&limit=10')
        .set('Cookie', cookies.IT);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.items.every((l) => l.action === 'UPDATE_SETTINGS')).toBe(true);
    });

    it('3.4. Lọc nhật ký theo Thời gian (from & to)', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await request(app)
        .get(`/api/v1/admin/audit-logs?from=${today}&to=${today}&page=1&limit=10`)
        .set('Cookie', cookies.IT);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.items.every((l) => l.at.startsWith(today))).toBe(true);
    });
  });
});
