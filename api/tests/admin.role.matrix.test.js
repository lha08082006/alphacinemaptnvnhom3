'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');

describe('Step 10: Admin Role Matrix & Dashboard KPI Verification', () => {
  let app;
  const cookies = {
    UNAUTH: null,
    CUSTOMER: null,
    IT: null,
    ACCOUNTANT: null,
    CSKH: null,
    MANAGER: null,
  };

  beforeAll(async () => {
    app = createApp();

    // Đăng nhập tài khoản khách hàng
    const resCust = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khachhang@gmail.com', password: 'Password@123' });
    cookies.CUSTOMER = resCust.headers['set-cookie'];

    // Đăng nhập 4 vai trò nhân viên
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
  });

  afterAll(async () => {
    await knex.destroy();
  });

  describe('1. Dashboard KPI API: GET /api/v1/admin/dashboard/kpi', () => {
    it('Chặn khách hàng và người chưa đăng nhập', async () => {
      const resUnauth = await request(app).get('/api/v1/admin/dashboard/kpi');
      expect(resUnauth.status).toBe(401);

      const resCust = await request(app)
        .get('/api/v1/admin/dashboard/kpi')
        .set('Cookie', cookies.CUSTOMER);
      expect(resCust.status).toBe(403);
    });

    it('Cho phép cả 4 vai trò nhân viên truy cập và trả về đủ 4 chỉ số KPI', async () => {
      for (const role of ['IT', 'ACCOUNTANT', 'CSKH', 'MANAGER']) {
        const res = await request(app)
          .get('/api/v1/admin/dashboard/kpi')
          .set('Cookie', cookies[role]);

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.data).toHaveProperty('revenue');
        expect(res.body.data).toHaveProperty('pendingTxns');
        expect(res.body.data).toHaveProperty('openTickets');
        expect(res.body.data).toHaveProperty('pendingRefunds');
        expect(typeof res.body.data.revenue).toBe('number');
        expect(typeof res.body.data.pendingTxns).toBe('number');
        expect(typeof res.body.data.openTickets).toBe('number');
        expect(typeof res.body.data.pendingRefunds).toBe('number');
      }
    });
  });

  describe('2. Bảng ma trận phân quyền: Role x Route Matrix', () => {
    const matrixRoutes = [
      {
        name: '1. Tổng quan (KPI)',
        method: 'GET',
        path: '/api/v1/admin/dashboard/kpi',
        allowed: ['IT', 'ACCOUNTANT', 'CSKH', 'MANAGER'],
      },
      {
        name: '2. Nội dung',
        method: 'GET',
        path: '/api/v1/admin/content',
        allowed: ['MANAGER'],
      },
      {
        name: '3. Vận hành rạp',
        method: 'GET',
        path: '/api/v1/admin/operations',
        allowed: ['MANAGER'],
      },
      {
        name: '4. Quản trị',
        method: 'GET',
        path: '/api/v1/admin/management',
        allowed: ['MANAGER'],
      },
      {
        name: '5. Đơn hàng',
        method: 'GET',
        path: '/api/v1/admin/orders',
        allowed: ['IT', 'ACCOUNTANT', 'CSKH', 'MANAGER'],
      },
      {
        name: '6. Thanh toán/Đối soát (runs)',
        method: 'GET',
        path: '/api/v1/admin/recon/runs',
        allowed: ['IT', 'ACCOUNTANT', 'MANAGER'],
      },
      {
        name: '6. Thanh toán/Đối soát (run manual)',
        method: 'POST',
        path: '/api/v1/admin/recon/run',
        allowed: ['IT', 'ACCOUNTANT', 'MANAGER'],
      },
      {
        name: '7. Hoàn tiền',
        method: 'GET',
        path: '/api/v1/admin/refunds',
        allowed: ['ACCOUNTANT', 'CSKH', 'MANAGER'],
      },
      {
        name: '8. CSKH',
        method: 'GET',
        path: '/api/v1/admin/tickets',
        allowed: ['CSKH', 'MANAGER'],
      },
      {
        name: '9. Báo cáo đối soát',
        method: 'GET',
        path: '/api/v1/admin/reports/reconciliation',
        allowed: ['ACCOUNTANT', 'MANAGER'],
      },
      {
        name: '10. Cấu hình hệ thống',
        method: 'GET',
        path: '/api/v1/admin/settings',
        allowed: ['IT', 'MANAGER'],
      },
      {
        name: '11. Nhật ký hoạt động',
        method: 'GET',
        path: '/api/v1/admin/audit-logs',
        allowed: ['IT', 'MANAGER'],
      },
    ];

    const allRoles = ['IT', 'ACCOUNTANT', 'CSKH', 'MANAGER'];

    matrixRoutes.forEach((route) => {
      describe(`${route.name} (${route.method} ${route.path})`, () => {
        // Test Khách hàng luôn bị 403
        it('CUSTOMER bị chặn 403', async () => {
          const req = route.method === 'POST' ? request(app).post(route.path) : request(app).get(route.path);
          const res = await req.set('Cookie', cookies.CUSTOMER);
          expect(res.status).toBe(403);
        });

        // Test từng vai trò nhân viên
        allRoles.forEach((role) => {
          const isAllowed = route.allowed.includes(role);
          it(`Role ${role} -> ${isAllowed ? '200 OK' : '403 FORBIDDEN'}`, async () => {
            // Mock recon queryTransaction if needed for recon/run
            if (route.path === '/api/v1/admin/recon/run' && isAllowed) {
              const reconService = require('../src/services/reconService');
              reconService.setGatewayAdapter({
                queryTransaction: jest.fn().mockResolvedValue({
                  vnp_ResponseCode: '02',
                  vnp_TransactionStatus: '02',
                }),
              });
            }

            const req = route.method === 'POST' ? request(app).post(route.path) : request(app).get(route.path);
            const res = await req.set('Cookie', cookies[role]);

            if (isAllowed) {
              expect(res.status).toBe(200);
              expect(res.body.ok).toBe(true);
            } else {
              expect(res.status).toBe(403);
              expect(res.body.error.code).toBe('FORBIDDEN');
            }
          });
        });
      });
    });
  });
});
