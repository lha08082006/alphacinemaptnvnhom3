'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const knex = require('../db/knex');
const clock = require('../lib/clock');
const { env } = require('../config/env');
const { AUTH, AUTH_ADMIN } = require('../config/constants');
const { requireStaff } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, sendOk } = require('../lib/http');
const { AppError } = require('../lib/errors');
const ids = require('../lib/ids');
const { assertTransition } = require('../services/orderStateMachine');

const router = express.Router();

async function updateOrderStatus(trx, order, toStatus, opts = {}) {
  const { reason = null, actorType = 'STAFF', actorId = null } = opts;
  assertTransition(order.status, toStatus);
  const nowIso = clock.nowIso();
  await trx('orders')
    .where({ order_id: order.order_id })
    .update({ status: toStatus, updated_at: nowIso });
  await trx('order_status_history').insert({
    order_id: order.order_id,
    from_status: order.status,
    to_status: toStatus,
    reason,
    actor_type: actorType,
    actor_id: actorId,
    at: nowIso,
  });
  order.status = toStatus;
}

function getClientIp(req) {
  return req.ip || req.connection?.remoteAddress || '127.0.0.1';
}

const loginSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
  password: z.string().min(1, 'Mật khẩu không được để trống'),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Mật khẩu cũ không được để trống'),
  newPassword: z.string().min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự'),
});

const updateTicketSchema = z.object({
  status: z.enum(['NEW', 'IN_REVIEW', 'WAITING_REFUND', 'RESOLVED', 'REJECTED']).optional(),
  assigned_to: z.number().int().optional(),
  resolution: z.string().optional(),
  note: z.string().optional(),
});

const updateSettingsSchema = z.object({
  mode: z.enum(['ASIS', 'TOBE']).optional(),
  reconcileIntervalMin: z.number().int().min(1).optional(),
  callbackTimeoutSec: z.number().int().min(1).optional(),
  timeout: z.number().int().min(1).optional(),
  holdMinutes: z.number().int().min(1).max(60).optional(),
  pendingVerifyHoldMin: z.number().int().min(1).optional(),
  refundSendDelayMin: z.number().int().min(0).optional(),
  clock_offset_ms: z.number().int().optional(),
});

const createUserSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
  password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
  full_name: z.string().min(1, 'Họ tên không được để trống'),
  phone: z.string().optional(),
  role: z.enum(['IT', 'ACCOUNTANT', 'CSKH', 'MANAGER']),
});

const updateUserRoleSchema = z.object({
  role: z.enum(['IT', 'ACCOUNTANT', 'CSKH', 'MANAGER', 'CUSTOMER']),
});

const updateUserStatusSchema = z.object({
  is_active: z.boolean(),
});

const resetUserPasswordSchema = z.object({
  newPassword: z.string().min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự'),
});

const movieSchema = z.object({
  title: z.string().min(1, 'Tên phim không được để trống'),
  slug: z.string().optional(),
  genres: z.union([z.array(z.string()), z.string()]).optional(),
  duration_min: z.coerce.number().int().min(1, 'Thời lượng phải lớn hơn 0'),
  age_rating: z.enum(['P', 'T13', 'T16', 'T18']).default('P'),
  status: z.enum(['NOW_SHOWING', 'COMING_SOON', 'SPECIAL', 'ENDED']).default('NOW_SHOWING'),
  synopsis: z.string().optional().default(''),
  director: z.string().optional().default('Đang cập nhật'),
  cast: z.union([z.array(z.string()), z.string()]).optional(),
  language: z.string().optional().default('Tiếng Việt'),
  release_date: z.string().optional(),
  sneak_at: z.string().nullable().optional(),
  is_hot: z.coerce.boolean().optional().default(false),
  sort_order: z.coerce.number().int().optional().default(999),
  poster_url: z.string().optional(),
  trailer_url: z.string().optional(),
});

const bannerSchema = z.object({
  title: z.string().min(1, 'Tiêu đề banner không được để trống'),
  image_url: z.string().min(1, 'Đường dẫn ảnh banner không được để trống'),
  link_url: z.string().nullable().optional(),
  sort_order: z.coerce.number().int().optional().default(0),
  is_active: z.coerce.boolean().optional().default(true),
});

const promotionSchema = z.object({
  title: z.string().min(1, 'Tiêu đề không được để trống'),
  slug: z.string().optional(),
  summary: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  type: z.enum(['PROMOTION', 'NEWS']).default('PROMOTION'),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  is_active: z.coerce.boolean().optional().default(true),
});

const comboSchema = z.object({
  name: z.string().min(1, 'Tên combo không được để trống'),
  description: z.string().optional().default(''),
  price: z.coerce.number().int().min(0, 'Giá combo phải >= 0'),
  is_active: z.coerce.boolean().optional().default(true),
});

const cinemaSchema = z.object({
  code: z.string().min(1, 'Mã rạp không được để trống'),
  name: z.string().min(1, 'Tên rạp không được để trống'),
  city: z.string().min(1, 'Thành phố không được để trống'),
  address: z.string().min(1, 'Địa chỉ không được để trống'),
  hotline: z.string().min(1, 'Hotline không được để trống'),
});

const roomSchema = z.object({
  cinema_id: z.coerce.number().int().positive('Cụm rạp không hợp lệ'),
  name: z.string().min(1, 'Tên phòng không được để trống'),
  room_type: z.enum(['2D', '3D']).default('2D'),
});

const generateSeatsSchema = z.object({
  rows: z.coerce.number().int().min(1).max(26),
  cols: z.coerce.number().int().min(1).max(50),
  vipRows: z.array(z.string()).optional().default([]),
  doubleRows: z.array(z.string()).optional().default([]),
  aisles: z.array(z.coerce.number().int()).optional().default([]),
});

const updateSeatSchema = z.object({
  seat_type: z.enum(['STANDARD', 'VIP', 'COUPLE']),
});

const showtimeSchema = z.object({
  movie_id: z.coerce.number().int().positive('Phim không hợp lệ'),
  room_id: z.coerce.number().int().positive('Phòng chiếu không hợp lệ'),
  starts_at: z.string().min(1, 'Thời gian bắt đầu không được để trống'),
  ends_at: z.string().min(1, 'Thời gian kết thúc không được để trống'),
  format: z.enum(['2D', '3D']).default('2D'),
  price_standard: z.coerce.number().int().min(0, 'Giá ghế thường phải >= 0'),
  price_vip: z.coerce.number().int().min(0, 'Giá ghế VIP phải >= 0'),
  price_couple: z.coerce.number().int().min(0, 'Giá ghế đôi phải >= 0'),
  status: z.enum(['OPEN', 'CLOSED', 'CANCELLED']).default('OPEN'),
});

const ticketPriceSchema = z.object({
  name: z.string().min(1, 'Tên mức giá không được để trống'),
  format: z.enum(['2D', '3D']).default('2D'),
  seat_type: z.enum(['STANDARD', 'VIP', 'COUPLE']).default('STANDARD'),
  price: z.coerce.number().int().min(0, 'Giá vé phải >= 0'),
  description: z.string().nullable().optional(),
});

/**
 * POST /admin/auth/login
 * Đăng nhập dành riêng cho nhân viên (IT, ACCOUNTANT, CSKH, MANAGER).
 * Trả cùng thông báo lỗi 401 khi sai thông tin.
 * Khóa tài khoản sau 5 lần sai liên tiếp và ghi nhận audit_log.
 */
router.post(
  '/auth/login',
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const ip = getClientIp(req);
    const { email, password } = req.valid.body;
    const nowIso = clock.nowIso();

    // 1. Tìm tài khoản người dùng theo email
    const user = await knex('users').where({ email: email.toLowerCase().trim() }).first();

    // 2. Kiểm tra tài khoản có đang bị khóa không
    if (user && user.locked_until) {
      const lockExpiry = new Date(user.locked_until).getTime();
      if (lockExpiry > Date.now()) {
        throw new AppError(
          'RATE_LIMITED',
          429,
          'Tài khoản đã bị tạm khóa do nhập sai mật khẩu quá 5 lần. Vui lòng thử lại sau.'
        );
      } else {
        // Hết hạn khóa -> tự động mở khóa
        await knex('users')
          .where({ id: user.id })
          .update({ failed_login_attempts: 0, locked_until: null, updated_at: nowIso });
        user.failed_login_attempts = 0;
        user.locked_until = null;
      }
    }

    // 3. Kiểm tra tính hợp lệ: phải là vai trò STAFF và đúng mật khẩu
    const isStaffRole = user && AUTH_ADMIN.STAFF_ROLES.includes(user.role) && user.role !== 'CUSTOMER';
    const isPasswordCorrect =
      user && Boolean(user.is_active) && isStaffRole && bcrypt.compareSync(password, user.password_hash);

    if (!isPasswordCorrect) {
      // Ghi audit_log đăng nhập thất bại
      await knex('audit_log').insert({
        at: nowIso,
        actor_type: user ? 'STAFF' : 'SYSTEM',
        actor_id: user ? String(user.id) : 'UNKNOWN',
        action: 'STAFF_LOGIN_FAILED',
        entity: 'USER',
        entity_id: user ? String(user.id) : 'UNKNOWN',
        after_json: JSON.stringify({ email, ip, reason: 'INVALID_CREDENTIALS' }),
      });

      // Nếu tài khoản tồn tại và là nhân viên -> đếm số lần sai
      if (user && isStaffRole) {
        const newFailed = (user.failed_login_attempts || 0) + 1;
        const updateData = {
          failed_login_attempts: newFailed,
          updated_at: nowIso,
        };

        if (newFailed >= AUTH_ADMIN.MAX_FAILED_ATTEMPTS) {
          // Lấy cấu hình thời gian khóa (phút)
          const settingRow = await knex('settings').where({ key: 'adminLockoutMin' }).first();
          const lockoutMin = settingRow ? parseInt(settingRow.value, 10) : AUTH_ADMIN.DEFAULT_LOCKOUT_MIN;
          const lockedUntil = new Date(clock.nowMs() + lockoutMin * 60 * 1000).toISOString();
          updateData.locked_until = lockedUntil;

          // Ghi nhận audit_log khóa tài khoản
          await knex('audit_log').insert({
            at: nowIso,
            actor_type: 'SYSTEM',
            actor_id: 'SYSTEM',
            action: 'STAFF_ACCOUNT_LOCKED',
            entity: 'USER',
            entity_id: String(user.id),
            after_json: JSON.stringify({
              email: user.email,
              failed_attempts: newFailed,
              locked_until: lockedUntil,
              lockout_minutes: lockoutMin,
            }),
          });
        }

        await knex('users').where({ id: user.id }).update(updateData);
      }

      // Trả cùng một thông báo lỗi và cùng mã trạng thái 401
      throw new AppError('AUTH_REQUIRED', 401, 'Email hoặc mật khẩu không chính xác.');
    }

    // 4. Đăng nhập thành công -> reset failed attempts và ghi audit_log
    if (user.failed_login_attempts > 0 || user.locked_until) {
      await knex('users').where({ id: user.id }).update({
        failed_login_attempts: 0,
        locked_until: null,
        updated_at: nowIso,
      });
    }

    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(user.id),
      action: 'STAFF_LOGIN_SUCCESS',
      entity: 'USER',
      entity_id: String(user.id),
      after_json: JSON.stringify({ email: user.email, role: user.role, ip }),
    });

    // 5. Ký JWT thời hạn 2 giờ
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
        type: 'STAFF',
      },
      env.JWT_SECRET,
      {
        algorithm: AUTH.JWT_ALGORITHM,
        expiresIn: '2h',
      }
    );

    // 6. Set cookie beta_admin_token (httpOnly, path /api/v1/admin, maxAge 2h)
    res.cookie(AUTH_ADMIN.COOKIE_NAME, token, AUTH_ADMIN.COOKIE_OPTIONS);

    sendOk(res, {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        must_change_password: Boolean(user.must_change_password),
      },
    });
  })
);

// =========================================================================
// ÁP DỤNG requireStaff CHO TOÀN BỘ CÁC ROUTE ADMIN CÒN LẠI
// =========================================================================
router.use(requireStaff());

/**
 * GET /admin/auth/me
 * Lấy thông tin tài khoản nhân viên hiện tại.
 */
router.get(
  '/auth/me',
  asyncHandler(async (req, res) => {
    const user = await knex('users')
      .where({ id: req.user.id })
      .select('id', 'email', 'phone', 'full_name', 'role', 'must_change_password', 'is_active', 'created_at', 'updated_at')
      .first();

    if (!user || !Boolean(user.is_active)) {
      throw new AppError('AUTH_REQUIRED');
    }

    sendOk(res, {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        full_name: user.full_name,
        role: user.role,
        must_change_password: Boolean(user.must_change_password),
      },
    });
  })
);

/**
 * POST /admin/auth/logout
 * Đăng xuất: xóa cookie beta_admin_token.
 */
router.post('/auth/logout', (_req, res) => {
  res.clearCookie(AUTH_ADMIN.COOKIE_NAME, {
    ...AUTH_ADMIN.COOKIE_OPTIONS,
    maxAge: 0,
  });
  sendOk(res, { message: 'Đăng xuất thành công.' });
});

/**
 * POST /admin/auth/change-password
 * Đổi mật khẩu nhân viên và cập nhật must_change_password = false.
 */
const handleChangePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.valid.body;
  const nowIso = clock.nowIso();

  const user = await knex('users').where({ id: req.user.id }).first();
  if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
    throw new AppError('VALIDATION_ERROR', 400, 'Mật khẩu cũ không chính xác.');
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  await knex('users').where({ id: req.user.id }).update({
    password_hash: newHash,
    must_change_password: false,
    updated_at: nowIso,
  });

  // Ghi nhận audit_log
  await knex('audit_log').insert({
    at: nowIso,
    actor_type: 'STAFF',
    actor_id: String(req.user.id),
    action: 'STAFF_CHANGE_PASSWORD',
    entity: 'USER',
    entity_id: String(req.user.id),
    after_json: JSON.stringify({ email: user.email }),
  });

  sendOk(res, {
    message: 'Đổi mật khẩu thành công.',
    must_change_password: false,
  });
});

router.post('/auth/change-password', validate({ body: changePasswordSchema }), handleChangePassword);
router.patch('/auth/change-password', validate({ body: changePasswordSchema }), handleChangePassword);

/**
 * GET /admin/dashboard/kpi
 * Thống kê 4 KPI chính: Doanh thu, Giao dịch treo, Ticket mở, Hoàn tiền chờ xử lý
 * Quyền: cả 4 vai trò (IT, ACCOUNTANT, CSKH, MANAGER).
 */
router.get(
  '/dashboard/kpi',
  requireStaff('IT', 'ACCOUNTANT', 'CSKH', 'MANAGER'),
  asyncHandler(async (_req, res) => {
    // 1. Doanh thu: tổng amount_total của các đơn PAID
    const revRow = await knex('orders')
      .where({ status: 'PAID' })
      .sum('amount_total as total')
      .first();
    const revenue = Number(revRow?.total || 0);

    // 2. Giao dịch treo: đơn PENDING_VERIFY hoặc (AWAITING_PAYMENT/PENDING_VERIFY có payment_attempts SUCCESS)
    const pendingVerifyRow = await knex('orders')
      .where({ status: 'PENDING_VERIFY' })
      .count('* as count')
      .first();
    const hangingPaRow = await knex('orders as o')
      .join('payment_attempts as pa', 'o.order_id', 'pa.order_id')
      .whereIn('o.status', ['AWAITING_PAYMENT', 'PENDING_VERIFY'])
      .where('pa.status', 'SUCCESS')
      .countDistinct('o.order_id as count')
      .first();
    const pendingTxns = Math.max(Number(pendingVerifyRow?.count || 0), Number(hangingPaRow?.count || 0));

    // 3. Ticket mở: NEW, IN_REVIEW, WAITING_REFUND
    const openTicketsRow = await knex('support_tickets')
      .whereIn('status', ['NEW', 'IN_REVIEW', 'WAITING_REFUND'])
      .count('* as count')
      .first();
    const openTickets = Number(openTicketsRow?.count || 0);

    // 4. Hoàn tiền chờ xử lý: CHECKING, SENT, BANK_PROCESSING
    const pendingRefundsRow = await knex('refunds')
      .whereIn('status', ['CHECKING', 'SENT', 'BANK_PROCESSING'])
      .count('* as count')
      .first();
    const pendingRefunds = Number(pendingRefundsRow?.count || 0);

    sendOk(res, {
      revenue,
      pendingTxns,
      openTickets,
      pendingRefunds,
    });
  })
);

/**
 * GET /admin/orders
 * Danh sách đơn hàng với bộ lọc tìm kiếm (mã đơn, email, SĐT), trạng thái, ngày và phân trang.
 * Quyền: IT, ACCOUNTANT, CSKH, MANAGER.
 */
router.get(
  '/orders',
  requireStaff('IT', 'ACCOUNTANT', 'CSKH', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { q, status, from, to, page = 1, limit = 10 } = req.query;

    let baseQuery = knex('orders');

    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      baseQuery = baseQuery.where((builder) => {
        builder
          .where('order_id', 'like', term)
          .orWhere('customer_email', 'like', term)
          .orWhere('customer_phone', 'like', term)
          .orWhere('customer_name', 'like', term);
      });
    }

    if (status) {
      baseQuery = baseQuery.where({ status });
    }

    if (from) {
      baseQuery = baseQuery.whereRaw('SUBSTR(created_at, 1, 10) >= ?', [from]);
    }

    if (to) {
      baseQuery = baseQuery.whereRaw('SUBSTR(created_at, 1, 10) <= ?', [to]);
    }

    // Đếm tổng số bản ghi phù hợp
    const countRow = await baseQuery.clone().count('* as count').first();
    const total = Number(countRow?.count || 0);

    const limitNum = Math.max(1, Math.min(Number(limit) || 10, 100));
    const pageNum = Math.max(1, Number(page) || 1);
    const offset = (pageNum - 1) * limitNum;

    const items = await baseQuery
      .clone()
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(limitNum)
      .offset(offset);

    sendOk(res, {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  })
);

/**
 * GET /admin/orders/:id
 * Chi tiết đơn hàng kèm danh sách ghế, combo, giao dịch thanh toán và timeline lịch sử trạng thái.
 * Quyền: IT, ACCOUNTANT, CSKH, MANAGER.
 */
router.get(
  '/orders/:id',
  requireStaff('IT', 'ACCOUNTANT', 'CSKH', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const order = await knex('orders').where({ order_id: req.params.id }).first();
    if (!order) {
      throw new AppError('NOT_FOUND');
    }

    const seats = await knex('order_seats as os')
      .leftJoin('seats as s', 'os.seat_id', 's.id')
      .where({ 'os.order_id': req.params.id })
      .select('os.*', knex.raw('(s.row_label || s.col_number) as seat_code'));
    const combos = await knex('order_combos').where({ order_id: req.params.id });
    const payments = await knex('payment_attempts').where({ order_id: req.params.id }).orderBy('created_at', 'desc');

    // Lấy timeline trạng thái từ bảng order_status_history
    const timeline = await knex('order_status_history')
      .where({ order_id: req.params.id })
      .orderBy('at', 'asc');

    // Lấy thông tin suất chiếu và phim nếu có
    let showtime = null;
    if (order.showtime_id) {
      showtime = await knex('showtimes as st')
        .leftJoin('movies as m', 'st.movie_id', 'm.id')
        .leftJoin('rooms as r', 'st.room_id', 'r.id')
        .leftJoin('cinemas as c', 'r.cinema_id', 'c.id')
        .where('st.id', order.showtime_id)
        .select(
          'st.id as showtime_id',
          'st.starts_at as start_time',
          'st.ends_at as end_time',
          'st.format',
          'm.title as movie_title',
          'r.name as room_name',
          'c.name as cinema_name'
        )
        .first();
    }

    sendOk(res, {
      ...order,
      seats,
      combos,
      payments,
      timeline,
      showtime,
    });
  })
);

/**
 * GET /admin/content
 * Quản lý tổng hợp nội dung: phim, combo, banners, tin & ưu đãi (quyền: MANAGER).
 */
router.get(
  '/content',
  requireStaff('MANAGER'),
  asyncHandler(async (_req, res) => {
    const movies = await knex('movies').select('*').orderBy('id', 'desc').limit(100);
    const combos = await knex('combos').select('*').orderBy('id', 'asc');
    const banners = await knex('banners').select('*').orderBy('sort_order', 'asc');
    const promotions = await knex('promotions').select('*').orderBy('id', 'desc');
    sendOk(res, { movies, combos, banners, promotions });
  })
);

/**
 * GET /admin/operations
 * Vận hành tổng hợp: rạp, phòng, suất chiếu, bảng giá vé (quyền: MANAGER).
 */
router.get(
  '/operations',
  requireStaff('MANAGER'),
  asyncHandler(async (_req, res) => {
    const cinemas = await knex('cinemas').select('*').orderBy('id', 'asc');
    const rooms = await knex('rooms as r')
      .join('cinemas as c', 'r.cinema_id', 'c.id')
      .select('r.*', 'c.name as cinema_name')
      .orderBy('r.id', 'asc');
    const showtimes = await knex('showtimes as st')
      .join('movies as m', 'st.movie_id', 'm.id')
      .join('rooms as r', 'st.room_id', 'r.id')
      .join('cinemas as c', 'r.cinema_id', 'c.id')
      .select(
        'st.*',
        'm.title as movie_title',
        'r.name as room_name',
        'c.name as cinema_name'
      )
      .orderBy('st.starts_at', 'desc')
      .limit(100);
    const ticketPrices = await knex('ticket_prices').select('*').orderBy('id', 'asc');
    sendOk(res, { cinemas, rooms, showtimes, ticketPrices });
  })
);

// =========================================================================
// CRUD PHIM (MOVIES) - QUYỀN: MANAGER
// =========================================================================

/**
 * GET /admin/movies
 */
router.get(
  '/movies',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const { status, search, page, limit = 50 } = req.query;
    let query = knex('movies').select('*').orderBy('id', 'desc');

    if (status && status !== 'ALL') {
      query = query.where({ status });
    }
    if (search) {
      const q = `%${search.trim()}%`;
      query = query.where(function () {
        this.where('title', 'like', q)
          .orWhere('director', 'like', q)
          .orWhere('slug', 'like', q);
      });
    }

    if (page) {
      const countRow = await query.clone().count('id as count').first();
      const total = Number(countRow?.count || 0);
      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Math.min(Number(limit) || 20, 100));
      const offset = (pageNum - 1) * limitNum;
      const movies = await query.clone().limit(limitNum).offset(offset);
      return sendOk(res, {
        movies,
        pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) || 1 },
      });
    }

    const movies = await query.limit(Number(limit) || 100);
    sendOk(res, { movies });
  })
);

/**
 * GET /admin/movies/:id
 */
router.get(
  '/movies/:id',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const movie = await knex('movies').where({ id: req.params.id }).first();
    if (!movie) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy phim.');
    sendOk(res, movie);
  })
);

/**
 * POST /admin/movies
 */
router.post(
  '/movies',
  requireStaff('MANAGER'),
  validate({ body: movieSchema }),
  asyncHandler(async (req, res) => {
    const b = req.valid.body;
    const nowIso = clock.nowIso();

    const slug = b.slug || (b.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now());
    const genres_json = typeof b.genres === 'string' ? JSON.stringify([b.genres]) : JSON.stringify(b.genres || ['Hành Động']);
    const cast_json = typeof b.cast === 'string' ? JSON.stringify([b.cast]) : JSON.stringify(b.cast || ['Đang cập nhật']);
    const poster_style_json = JSON.stringify({ url: b.poster_url || 'https://files.betacorp.vn/media/images/2026/default-poster.png' });
    const trailer_json = JSON.stringify({ url: b.trailer_url || '' });

    const [newId] = await knex('movies').insert({
      slug,
      title: b.title.trim(),
      genres_json,
      duration_min: b.duration_min,
      age_rating: b.age_rating,
      status: b.status,
      synopsis: b.synopsis || 'Chưa có thông tin tóm tắt.',
      director: b.director || 'Đang cập nhật',
      cast_json,
      language: b.language || 'Tiếng Việt',
      release_date: b.release_date || new Date().toISOString().slice(0, 10),
      sneak_at: b.sneak_at || null,
      is_hot: b.is_hot ? 1 : 0,
      sort_order: b.sort_order || 999,
      poster_style_json,
      trailer_json,
    });

    const newMovie = await knex('movies').where({ id: newId }).first();

    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'CREATE_MOVIE',
      entity: 'MOVIE',
      entity_id: String(newId),
      after_json: JSON.stringify(newMovie),
    });

    sendOk(res, newMovie, {}, 201);
  })
);

/**
 * PUT /admin/movies/:id
 */
router.put(
  '/movies/:id',
  requireStaff('MANAGER'),
  validate({ body: movieSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const oldMovie = await knex('movies').where({ id }).first();
    if (!oldMovie) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy phim.');

    const b = req.valid.body;
    const nowIso = clock.nowIso();
    const updateData = {
      title: b.title.trim(),
      duration_min: b.duration_min,
      age_rating: b.age_rating,
      status: b.status,
      synopsis: b.synopsis || oldMovie.synopsis,
      director: b.director || oldMovie.director,
      language: b.language || oldMovie.language,
      is_hot: b.is_hot ? 1 : 0,
      sort_order: b.sort_order || oldMovie.sort_order,
    };
    if (b.slug) updateData.slug = b.slug;
    if (b.release_date) updateData.release_date = b.release_date;
    if (b.sneak_at !== undefined) updateData.sneak_at = b.sneak_at;
    if (b.genres) updateData.genres_json = typeof b.genres === 'string' ? JSON.stringify([b.genres]) : JSON.stringify(b.genres);
    if (b.cast) updateData.cast_json = typeof b.cast === 'string' ? JSON.stringify([b.cast]) : JSON.stringify(b.cast);
    if (b.poster_url) updateData.poster_style_json = JSON.stringify({ url: b.poster_url });
    if (b.trailer_url !== undefined) updateData.trailer_json = JSON.stringify({ url: b.trailer_url });

    await knex('movies').where({ id }).update(updateData);
    const updated = await knex('movies').where({ id }).first();

    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'UPDATE_MOVIE',
      entity: 'MOVIE',
      entity_id: String(id),
      before_json: JSON.stringify(oldMovie),
      after_json: JSON.stringify(updated),
    });

    sendOk(res, updated);
  })
);

/**
 * DELETE /admin/movies/:id
 */
router.delete(
  '/movies/:id',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const movie = await knex('movies').where({ id }).first();
    if (!movie) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy phim.');

    // Kiểm tra xem phim có suất chiếu đã có đơn hàng không
    const ordersWithMovie = await knex('orders as o')
      .join('showtimes as st', 'o.showtime_id', 'st.id')
      .where('st.movie_id', id)
      .count('o.order_id as count')
      .first();

    if (Number(ordersWithMovie?.count || 0) > 0) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        409,
        'Phim đã có đơn đặt vé, không thể xóa. Bạn có thể chuyển trạng thái phim sang ENDED.'
      );
    }

    // Xóa các suất chiếu chưa có đơn và showtime_seats của phim này
    const movieShowtimes = await knex('showtimes').where({ movie_id: id }).select('id');
    const stIds = movieShowtimes.map((s) => s.id);
    if (stIds.length > 0) {
      await knex('showtime_seats').whereIn('showtime_id', stIds).del();
      await knex('showtimes').whereIn('id', stIds).del();
    }
    await knex('movies').where({ id }).del();

    await knex('audit_log').insert({
      at: clock.nowIso(),
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'DELETE_MOVIE',
      entity: 'MOVIE',
      entity_id: String(id),
      before_json: JSON.stringify(movie),
    });

    sendOk(res, { id: Number(id), message: 'Đã xóa phim thành công.' });
  })
);

// =========================================================================
// CRUD BANNER (BANNERS) - QUYỀN: MANAGER
// =========================================================================

/**
 * GET /admin/banners
 */
router.get(
  '/banners',
  requireStaff('MANAGER'),
  asyncHandler(async (_req, res) => {
    const banners = await knex('banners').select('*').orderBy('sort_order', 'asc').orderBy('id', 'desc');
    sendOk(res, { banners });
  })
);

/**
 * POST /admin/banners
 */
router.post(
  '/banners',
  requireStaff('MANAGER'),
  validate({ body: bannerSchema }),
  asyncHandler(async (req, res) => {
    const b = req.valid.body;
    const nowIso = clock.nowIso();
    const [newId] = await knex('banners').insert({
      title: b.title.trim(),
      image_url: b.image_url.trim(),
      link_url: b.link_url ? b.link_url.trim() : null,
      sort_order: b.sort_order || 0,
      is_active: b.is_active ? 1 : 0,
      created_at: nowIso,
      updated_at: nowIso,
    });
    const newBanner = await knex('banners').where({ id: newId }).first();

    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'CREATE_BANNER',
      entity: 'BANNER',
      entity_id: String(newId),
      after_json: JSON.stringify(newBanner),
    });

    sendOk(res, newBanner, {}, 201);
  })
);

/**
 * PUT /admin/banners/:id
 */
router.put(
  '/banners/:id',
  requireStaff('MANAGER'),
  validate({ body: bannerSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const oldBanner = await knex('banners').where({ id }).first();
    if (!oldBanner) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy banner.');

    const b = req.valid.body;
    const nowIso = clock.nowIso();
    await knex('banners').where({ id }).update({
      title: b.title.trim(),
      image_url: b.image_url.trim(),
      link_url: b.link_url ? b.link_url.trim() : null,
      sort_order: b.sort_order || 0,
      is_active: b.is_active ? 1 : 0,
      updated_at: nowIso,
    });
    const updated = await knex('banners').where({ id }).first();

    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'UPDATE_BANNER',
      entity: 'BANNER',
      entity_id: String(id),
      before_json: JSON.stringify(oldBanner),
      after_json: JSON.stringify(updated),
    });

    sendOk(res, updated);
  })
);

/**
 * DELETE /admin/banners/:id
 */
router.delete(
  '/banners/:id',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const banner = await knex('banners').where({ id }).first();
    if (!banner) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy banner.');

    await knex('banners').where({ id }).del();
    await knex('audit_log').insert({
      at: clock.nowIso(),
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'DELETE_BANNER',
      entity: 'BANNER',
      entity_id: String(id),
      before_json: JSON.stringify(banner),
    });

    sendOk(res, { id: Number(id), message: 'Đã xóa banner thành công.' });
  })
);

// =========================================================================
// CRUD TIN VÀ ƯU ĐÃI (PROMOTIONS) - QUYỀN: MANAGER
// =========================================================================

/**
 * GET /admin/promotions
 */
router.get(
  '/promotions',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const { type, search } = req.query;
    let query = knex('promotions').select('*').orderBy('id', 'desc');
    if (type && type !== 'ALL') query = query.where({ type });
    if (search) {
      const q = `%${search.trim()}%`;
      query = query.where(function () {
        this.where('title', 'like', q).orWhere('summary', 'like', q);
      });
    }
    const promotions = await query;
    sendOk(res, { promotions });
  })
);

/**
 * POST /admin/promotions
 */
router.post(
  '/promotions',
  requireStaff('MANAGER'),
  validate({ body: promotionSchema }),
  asyncHandler(async (req, res) => {
    const b = req.valid.body;
    const nowIso = clock.nowIso();
    const slug = b.slug || (b.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now());

    const [newId] = await knex('promotions').insert({
      title: b.title.trim(),
      slug,
      summary: b.summary || null,
      content: b.content || null,
      image_url: b.image_url || null,
      type: b.type,
      start_date: b.start_date || null,
      end_date: b.end_date || null,
      is_active: b.is_active ? 1 : 0,
      created_at: nowIso,
      updated_at: nowIso,
    });

    const newPromo = await knex('promotions').where({ id: newId }).first();
    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'CREATE_PROMOTION',
      entity: 'PROMOTION',
      entity_id: String(newId),
      after_json: JSON.stringify(newPromo),
    });

    sendOk(res, newPromo, {}, 201);
  })
);

/**
 * PUT /admin/promotions/:id
 */
router.put(
  '/promotions/:id',
  requireStaff('MANAGER'),
  validate({ body: promotionSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const oldPromo = await knex('promotions').where({ id }).first();
    if (!oldPromo) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy tin/ưu đãi.');

    const b = req.valid.body;
    const nowIso = clock.nowIso();
    await knex('promotions').where({ id }).update({
      title: b.title.trim(),
      slug: b.slug || oldPromo.slug,
      summary: b.summary !== undefined ? b.summary : oldPromo.summary,
      content: b.content !== undefined ? b.content : oldPromo.content,
      image_url: b.image_url !== undefined ? b.image_url : oldPromo.image_url,
      type: b.type,
      start_date: b.start_date !== undefined ? b.start_date : oldPromo.start_date,
      end_date: b.end_date !== undefined ? b.end_date : oldPromo.end_date,
      is_active: b.is_active ? 1 : 0,
      updated_at: nowIso,
    });

    const updated = await knex('promotions').where({ id }).first();
    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'UPDATE_PROMOTION',
      entity: 'PROMOTION',
      entity_id: String(id),
      before_json: JSON.stringify(oldPromo),
      after_json: JSON.stringify(updated),
    });

    sendOk(res, updated);
  })
);

/**
 * DELETE /admin/promotions/:id
 */
router.delete(
  '/promotions/:id',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const promo = await knex('promotions').where({ id }).first();
    if (!promo) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy tin/ưu đãi.');

    await knex('promotions').where({ id }).del();
    await knex('audit_log').insert({
      at: clock.nowIso(),
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'DELETE_PROMOTION',
      entity: 'PROMOTION',
      entity_id: String(id),
      before_json: JSON.stringify(promo),
    });

    sendOk(res, { id: Number(id), message: 'Đã xóa tin/ưu đãi thành công.' });
  })
);

// =========================================================================
// CRUD COMBO (COMBOS) - QUYỀN: MANAGER
// =========================================================================

/**
 * GET /admin/combos
 */
router.get(
  '/combos',
  requireStaff('MANAGER'),
  asyncHandler(async (_req, res) => {
    const combos = await knex('combos').select('*').orderBy('id', 'asc');
    sendOk(res, { combos });
  })
);

/**
 * POST /admin/combos
 */
router.post(
  '/combos',
  requireStaff('MANAGER'),
  validate({ body: comboSchema }),
  asyncHandler(async (req, res) => {
    const { name, description, price, is_active } = req.valid.body;
    const nowIso = clock.nowIso();

    const [newId] = await knex('combos').insert({
      name: name.trim(),
      description: description ? description.trim() : '',
      price,
      is_active: is_active ? 1 : 0,
    });
    const newCombo = await knex('combos').where({ id: newId }).first();

    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'CREATE_COMBO',
      entity: 'COMBO',
      entity_id: String(newId),
      after_json: JSON.stringify(newCombo),
    });

    sendOk(res, newCombo, {}, 201);
  })
);

/**
 * PUT /admin/combos/:id
 */
router.put(
  '/combos/:id',
  requireStaff('MANAGER'),
  validate({ body: comboSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const oldCombo = await knex('combos').where({ id }).first();
    if (!oldCombo) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy combo.');

    const { name, description, price, is_active } = req.valid.body;
    const nowIso = clock.nowIso();

    await knex('combos').where({ id }).update({
      name: name.trim(),
      description: description ? description.trim() : '',
      price,
      is_active: is_active ? 1 : 0,
    });
    const updated = await knex('combos').where({ id }).first();

    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'UPDATE_COMBO',
      entity: 'COMBO',
      entity_id: String(id),
      before_json: JSON.stringify(oldCombo),
      after_json: JSON.stringify(updated),
    });

    sendOk(res, updated);
  })
);

/**
 * DELETE /admin/combos/:id
 */
router.delete(
  '/combos/:id',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const combo = await knex('combos').where({ id }).first();
    if (!combo) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy combo.');

    const inOrders = await knex('order_combos').where({ combo_id: id }).count('order_id as count').first();
    if (Number(inOrders?.count || 0) > 0) {
      await knex('combos').where({ id }).update({ is_active: 0 });
    } else {
      await knex('combos').where({ id }).del();
    }

    await knex('audit_log').insert({
      at: clock.nowIso(),
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'DELETE_COMBO',
      entity: 'COMBO',
      entity_id: String(id),
      before_json: JSON.stringify(combo),
    });

    sendOk(res, { id: Number(id), message: 'Đã xóa hoặc ngưng bán combo thành công.' });
  })
);

// =========================================================================
// CRUD CỤM RẠP (CINEMAS) - QUYỀN: MANAGER
// =========================================================================

/**
 * GET /admin/cinemas
 */
router.get(
  '/cinemas',
  requireStaff('MANAGER'),
  asyncHandler(async (_req, res) => {
    const cinemas = await knex('cinemas').select('*').orderBy('id', 'asc');
    sendOk(res, { cinemas });
  })
);

/**
 * POST /admin/cinemas
 */
router.post(
  '/cinemas',
  requireStaff('MANAGER'),
  validate({ body: cinemaSchema }),
  asyncHandler(async (req, res) => {
    const { code, name, city, address, hotline } = req.valid.body;
    const nowIso = clock.nowIso();

    const existing = await knex('cinemas').where({ code: code.toUpperCase().trim() }).first();
    if (existing) throw new AppError('VALIDATION_ERROR', 400, 'Mã cụm rạp đã tồn tại.');

    const [newId] = await knex('cinemas').insert({
      code: code.toUpperCase().trim(),
      name: name.trim(),
      city: city.trim(),
      address: address.trim(),
      hotline: hotline.trim(),
    });
    const newCinema = await knex('cinemas').where({ id: newId }).first();

    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'CREATE_CINEMA',
      entity: 'CINEMA',
      entity_id: String(newId),
      after_json: JSON.stringify(newCinema),
    });

    sendOk(res, newCinema, {}, 201);
  })
);

/**
 * PUT /admin/cinemas/:id
 */
router.put(
  '/cinemas/:id',
  requireStaff('MANAGER'),
  validate({ body: cinemaSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const oldCinema = await knex('cinemas').where({ id }).first();
    if (!oldCinema) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy cụm rạp.');

    const { code, name, city, address, hotline } = req.valid.body;
    const nowIso = clock.nowIso();

    const existing = await knex('cinemas')
      .where({ code: code.toUpperCase().trim() })
      .whereNot({ id })
      .first();
    if (existing) throw new AppError('VALIDATION_ERROR', 400, 'Mã cụm rạp đã bị trùng lặp.');

    await knex('cinemas').where({ id }).update({
      code: code.toUpperCase().trim(),
      name: name.trim(),
      city: city.trim(),
      address: address.trim(),
      hotline: hotline.trim(),
    });
    const updated = await knex('cinemas').where({ id }).first();

    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'UPDATE_CINEMA',
      entity: 'CINEMA',
      entity_id: String(id),
      before_json: JSON.stringify(oldCinema),
      after_json: JSON.stringify(updated),
    });

    sendOk(res, updated);
  })
);

/**
 * DELETE /admin/cinemas/:id
 */
router.delete(
  '/cinemas/:id',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const cinema = await knex('cinemas').where({ id }).first();
    if (!cinema) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy cụm rạp.');

    const roomsCount = await knex('rooms').where({ cinema_id: id }).count('id as count').first();
    if (Number(roomsCount?.count || 0) > 0) {
      throw new AppError('INVALID_STATE_TRANSITION', 409, 'Cụm rạp đang có phòng chiếu, vui lòng xóa hoặc chuyển các phòng chiếu trước.');
    }

    await knex('cinemas').where({ id }).del();
    await knex('audit_log').insert({
      at: clock.nowIso(),
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'DELETE_CINEMA',
      entity: 'CINEMA',
      entity_id: String(id),
      before_json: JSON.stringify(cinema),
    });

    sendOk(res, { id: Number(id), message: 'Đã xóa cụm rạp thành công.' });
  })
);

// =========================================================================
// CRUD PHÒNG CHIẾU (ROOMS) - QUYỀN: MANAGER
// =========================================================================

/**
 * GET /admin/rooms
 */
router.get(
  '/rooms',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const { cinema_id } = req.query;
    let query = knex('rooms as r')
      .join('cinemas as c', 'r.cinema_id', 'c.id')
      .select('r.*', 'c.name as cinema_name')
      .orderBy('r.id', 'asc');

    if (cinema_id) query = query.where('r.cinema_id', cinema_id);

    const rooms = await query;
    sendOk(res, { rooms });
  })
);

/**
 * POST /admin/rooms
 */
router.post(
  '/rooms',
  requireStaff('MANAGER'),
  validate({ body: roomSchema }),
  asyncHandler(async (req, res) => {
    const { cinema_id, name, room_type } = req.valid.body;
    const nowIso = clock.nowIso();

    const cinema = await knex('cinemas').where({ id: cinema_id }).first();
    if (!cinema) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy cụm rạp tương ứng.');

    const existing = await knex('rooms').where({ cinema_id, name: name.trim() }).first();
    if (existing) throw new AppError('VALIDATION_ERROR', 400, 'Tên phòng chiếu đã tồn tại trong cụm rạp này.');

    const [newId] = await knex('rooms').insert({
      cinema_id,
      name: name.trim(),
      room_type,
    });
    const newRoom = await knex('rooms').where({ id: newId }).first();

    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'CREATE_ROOM',
      entity: 'ROOM',
      entity_id: String(newId),
      after_json: JSON.stringify(newRoom),
    });

    sendOk(res, newRoom, {}, 201);
  })
);

/**
 * PUT /admin/rooms/:id
 */
router.put(
  '/rooms/:id',
  requireStaff('MANAGER'),
  validate({ body: roomSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const oldRoom = await knex('rooms').where({ id }).first();
    if (!oldRoom) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy phòng chiếu.');

    const { cinema_id, name, room_type } = req.valid.body;
    const nowIso = clock.nowIso();

    const existing = await knex('rooms')
      .where({ cinema_id, name: name.trim() })
      .whereNot({ id })
      .first();
    if (existing) throw new AppError('VALIDATION_ERROR', 400, 'Tên phòng chiếu đã bị trùng lặp trong cụm rạp này.');

    await knex('rooms').where({ id }).update({
      cinema_id,
      name: name.trim(),
      room_type,
    });
    const updated = await knex('rooms').where({ id }).first();

    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'UPDATE_ROOM',
      entity: 'ROOM',
      entity_id: String(id),
      before_json: JSON.stringify(oldRoom),
      after_json: JSON.stringify(updated),
    });

    sendOk(res, updated);
  })
);

/**
 * DELETE /admin/rooms/:id
 */
router.delete(
  '/rooms/:id',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const room = await knex('rooms').where({ id }).first();
    if (!room) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy phòng chiếu.');

    const stCount = await knex('showtimes').where({ room_id: id }).count('id as count').first();
    if (Number(stCount?.count || 0) > 0) {
      throw new AppError('INVALID_STATE_TRANSITION', 409, 'Phòng chiếu đang có lịch suất chiếu, không thể xóa.');
    }

    await knex('seats').where({ room_id: id }).del();
    await knex('rooms').where({ id }).del();

    await knex('audit_log').insert({
      at: clock.nowIso(),
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'DELETE_ROOM',
      entity: 'ROOM',
      entity_id: String(id),
      before_json: JSON.stringify(room),
    });

    sendOk(res, { id: Number(id), message: 'Đã xóa phòng chiếu và toàn bộ sơ đồ ghế thành công.' });
  })
);

// =========================================================================
// SƠ ĐỒ GHẾ (SEATS) - QUYỀN: MANAGER
// =========================================================================

/**
 * GET /admin/rooms/:id/seats
 * Lấy sơ đồ ghế chi tiết của phòng chiếu
 */
router.get(
  '/rooms/:id/seats',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const roomId = req.params.id;
    const room = await knex('rooms').where({ id: roomId }).first();
    if (!room) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy phòng chiếu.');

    const seats = await knex('seats')
      .where({ room_id: roomId })
      .orderBy(['row_label', 'col_number']);

    sendOk(res, { room, seats, totalSeats: seats.length });
  })
);

/**
 * POST /admin/rooms/:id/seats/generate
 * Tự sinh ma trận ghế tự động theo hàng, cột, vipRows, doubleRows, aisles
 */
router.post(
  '/rooms/:id/seats/generate',
  requireStaff('MANAGER'),
  validate({ body: generateSeatsSchema }),
  asyncHandler(async (req, res) => {
    const roomId = req.params.id;
    const room = await knex('rooms').where({ id: roomId }).first();
    if (!room) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy phòng chiếu.');

    const { rows, cols, vipRows = [], doubleRows = [], aisles = [] } = req.valid.body;
    const nowIso = clock.nowIso();

    // Kiểm tra xem phòng chiếu đã có đơn hàng nào chưa
    const ordersInRoom = await knex('orders as o')
      .join('showtimes as st', 'o.showtime_id', 'st.id')
      .where('st.room_id', roomId)
      .count('o.order_id as count')
      .first();

    if (Number(ordersInRoom?.count || 0) > 0) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        409,
        'Phòng chiếu đã phát sinh đơn đặt vé trong các suất chiếu, không thể tạo lại toàn bộ sơ đồ ghế.'
      );
    }

    // Xóa showtime_seats cũ của phòng nếu có
    const roomSts = await knex('showtimes').where({ room_id: roomId }).select('id');
    if (roomSts.length > 0) {
      await knex('showtime_seats').whereIn('showtime_id', roomSts.map((s) => s.id)).del();
    }
    await knex('seats').where({ room_id: roomId }).del();

    const newSeats = [];
    for (let i = 0; i < rows; i++) {
      const rowLabel = String.fromCharCode(65 + i); // A, B, C...
      const isVip = vipRows.includes(rowLabel);
      const isDouble = doubleRows.includes(rowLabel);

      for (let j = 1; j <= cols; j++) {
        if (aisles.includes(j)) continue; // Bỏ qua lối đi

        const seatType = isDouble ? 'COUPLE' : (isVip ? 'VIP' : 'STANDARD');
        let pairCol = null;

        if (isDouble) {
          if (j % 2 !== 0 && !aisles.includes(j + 1) && j < cols) {
            pairCol = j + 1;
          } else if (j % 2 === 0 && !aisles.includes(j - 1)) {
            pairCol = j - 1;
          }
        }

        newSeats.push({
          room_id: Number(roomId),
          row_label: rowLabel,
          col_number: j,
          seat_type: seatType,
          pair_col: pairCol,
        });
      }
    }

    for (let i = 0; i < newSeats.length; i += 500) {
      await knex('seats').insert(newSeats.slice(i, i + 500));
    }

    const createdSeats = await knex('seats').where({ room_id: roomId }).orderBy(['row_label', 'col_number']);

    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'GENERATE_SEATS',
      entity: 'ROOM_SEATS',
      entity_id: String(roomId),
      after_json: JSON.stringify({ room_id: roomId, total_seats: createdSeats.length, rows, cols }),
    });

    sendOk(res, {
      room_id: Number(roomId),
      total_seats: createdSeats.length,
      seats: createdSeats,
      message: `Đã sinh thành công ${createdSeats.length} ghế cho phòng chiếu.`,
    }, {}, 201);
  })
);

/**
 * PUT /admin/seats/:id
 * Cập nhật loại ghế đơn lẻ (STANDARD, VIP, COUPLE)
 */
router.put(
  '/seats/:id',
  requireStaff('MANAGER'),
  validate({ body: updateSeatSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const seat = await knex('seats').where({ id }).first();
    if (!seat) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy ghế.');

    const { seat_type } = req.valid.body;
    await knex('seats').where({ id }).update({ seat_type });
    const updated = await knex('seats').where({ id }).first();

    await knex('audit_log').insert({
      at: clock.nowIso(),
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'UPDATE_SEAT',
      entity: 'SEAT',
      entity_id: String(id),
      before_json: JSON.stringify(seat),
      after_json: JSON.stringify(updated),
    });

    sendOk(res, updated);
  })
);

/**
 * DELETE /admin/seats/:id
 */
router.delete(
  '/seats/:id',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const seat = await knex('seats').where({ id }).first();
    if (!seat) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy ghế.');

    const booked = await knex('order_seats').where({ seat_id: id }).count('order_id as count').first();
    if (Number(booked?.count || 0) > 0) {
      throw new AppError('INVALID_STATE_TRANSITION', 409, 'Ghế đã từng được đặt vé trong lịch sử, không thể xóa.');
    }

    await knex('showtime_seats').where({ seat_id: id }).del();
    await knex('seats').where({ id }).del();

    await knex('audit_log').insert({
      at: clock.nowIso(),
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'DELETE_SEAT',
      entity: 'SEAT',
      entity_id: String(id),
      before_json: JSON.stringify(seat),
    });

    sendOk(res, { id: Number(id), message: 'Đã xóa ghế thành công.' });
  })
);

// =========================================================================
// CRUD SUẤT CHIẾU (SHOWTIMES) - QUYỀN: MANAGER
// =========================================================================

/**
 * GET /admin/showtimes
 * Danh sách suất chiếu kèm bộ lọc và phân trang
 */
router.get(
  '/showtimes',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const { movie_id, room_id, cinema_id, date, status, page, limit = 50 } = req.query;

    let query = knex('showtimes as st')
      .join('movies as m', 'st.movie_id', 'm.id')
      .join('rooms as r', 'st.room_id', 'r.id')
      .join('cinemas as c', 'r.cinema_id', 'c.id')
      .select(
        'st.*',
        'm.title as movie_title',
        'm.duration_min',
        'm.age_rating',
        'r.name as room_name',
        'r.room_type',
        'c.id as cinema_id',
        'c.name as cinema_name',
        knex.raw('(SELECT COUNT(*) FROM seats s WHERE s.room_id = st.room_id) as total_seats'),
        knex.raw('(SELECT COUNT(*) FROM showtime_seats ss WHERE ss.showtime_id = st.id AND ss.state = "SOLD") as sold_seats')
      )
      .orderBy('st.starts_at', 'desc');

    if (movie_id) query = query.where('st.movie_id', movie_id);
    if (room_id) query = query.where('st.room_id', room_id);
    if (cinema_id) query = query.where('c.id', cinema_id);
    if (status && status !== 'ALL') query = query.where('st.status', status);
    if (date) {
      query = query.whereRaw('SUBSTR(st.starts_at, 1, 10) = ?', [date.slice(0, 10)]);
    }

    if (page) {
      const countRow = await query.clone().count('st.id as count').first();
      const total = Number(countRow?.count || 0);
      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Math.min(Number(limit) || 20, 100));
      const offset = (pageNum - 1) * limitNum;

      const showtimes = await query.clone().limit(limitNum).offset(offset);
      return sendOk(res, {
        showtimes,
        pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) || 1 },
      });
    }

    const showtimes = await query.limit(Number(limit) || 100);
    sendOk(res, { showtimes });
  })
);

/**
 * GET /admin/showtimes/:id
 */
router.get(
  '/showtimes/:id',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const showtime = await knex('showtimes as st')
      .join('movies as m', 'st.movie_id', 'm.id')
      .join('rooms as r', 'st.room_id', 'r.id')
      .join('cinemas as c', 'r.cinema_id', 'c.id')
      .where('st.id', id)
      .select(
        'st.*',
        'm.title as movie_title',
        'm.duration_min',
        'm.age_rating',
        'r.name as room_name',
        'c.name as cinema_name'
      )
      .first();

    if (!showtime) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy suất chiếu.');

    const orders = await knex('orders').where({ showtime_id: id }).orderBy('created_at', 'desc');
    sendOk(res, { showtime, orders });
  })
);

/**
 * POST /admin/showtimes
 * Tạo suất chiếu mới:
 * 1. Chặn trùng giờ trong cùng phòng chiếu.
 * 2. Tự sinh showtime_seats cho toàn bộ ghế của phòng chiếu.
 */
router.post(
  '/showtimes',
  requireStaff('MANAGER'),
  validate({ body: showtimeSchema }),
  asyncHandler(async (req, res) => {
    const { movie_id, room_id, starts_at, ends_at, format, price_standard, price_vip, price_couple, status } = req.valid.body;
    const nowIso = clock.nowIso();

    // 1. Kiểm tra tồn tại phim và phòng chiếu
    const movie = await knex('movies').where({ id: movie_id }).first();
    if (!movie) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy phim.');

    const room = await knex('rooms').where({ id: room_id }).first();
    if (!room) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy phòng chiếu.');

    // 2. CHẶN TRÙNG GIỜ trong cùng phòng chiếu (Khoảng thời gian starts_at < existing.ends_at AND ends_at > existing.starts_at)
    const overlap = await knex('showtimes')
      .where({ room_id })
      .whereNot('status', 'CANCELLED')
      .where('starts_at', '<', ends_at)
      .where('ends_at', '>', starts_at)
      .first();

    if (overlap) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        409,
        `Phòng chiếu đã có suất chiếu khác trùng giờ từ ${overlap.starts_at} đến ${overlap.ends_at}. Vui lòng chọn khung giờ khác!`
      );
    }

    // 3. Tạo suất chiếu trong Transaction
    const result = await knex.transaction(async (trx) => {
      const [newId] = await trx('showtimes').insert({
        movie_id,
        room_id,
        starts_at,
        ends_at,
        format,
        price_standard,
        price_vip,
        price_couple,
        status,
      });

      // 4. TỰ SINH SHOWTIME_SEATS cho toàn bộ ghế của phòng chiếu
      const roomSeats = await trx('seats').where({ room_id });
      if (roomSeats.length > 0) {
        const showtimeSeats = roomSeats.map((s) => ({
          showtime_id: newId,
          seat_id: s.id,
          state: 'AVAILABLE',
          order_id: null,
          held_until: null,
        }));
        for (let i = 0; i < showtimeSeats.length; i += 500) {
          await trx('showtime_seats').insert(showtimeSeats.slice(i, i + 500));
        }
      }

      const created = await trx('showtimes').where({ id: newId }).first();

      // 5. Ghi audit_log
      await trx('audit_log').insert({
        at: nowIso,
        actor_type: 'STAFF',
        actor_id: String(req.user.id),
        action: 'CREATE_SHOWTIME',
        entity: 'SHOWTIME',
        entity_id: String(newId),
        after_json: JSON.stringify({
          ...created,
          auto_generated_seats: roomSeats.length,
        }),
      });

      return { ...created, auto_generated_seats: roomSeats.length };
    });

    sendOk(res, result, {}, 201);
  })
);

/**
 * PUT /admin/showtimes/:id
 * Cập nhật suất chiếu (kiểm tra chặn trùng giờ nếu đổi khung giờ/phòng)
 */
router.put(
  '/showtimes/:id',
  requireStaff('MANAGER'),
  validate({ body: showtimeSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const oldSt = await knex('showtimes').where({ id }).first();
    if (!oldSt) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy suất chiếu.');

    const { movie_id, room_id, starts_at, ends_at, format, price_standard, price_vip, price_couple, status } = req.valid.body;
    const nowIso = clock.nowIso();

    // Kiểm tra chặn trùng giờ (loại trừ chính suất chiếu này)
    const overlap = await knex('showtimes')
      .where({ room_id })
      .whereNot('status', 'CANCELLED')
      .whereNot({ id })
      .where('starts_at', '<', ends_at)
      .where('ends_at', '>', starts_at)
      .first();

    if (overlap) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        409,
        `Phòng chiếu đã có suất chiếu khác trùng giờ từ ${overlap.starts_at} đến ${overlap.ends_at}. Vui lòng chọn khung giờ khác!`
      );
    }

    await knex('showtimes').where({ id }).update({
      movie_id,
      room_id,
      starts_at,
      ends_at,
      format,
      price_standard,
      price_vip,
      price_couple,
      status,
    });

    const updated = await knex('showtimes').where({ id }).first();

    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'UPDATE_SHOWTIME',
      entity: 'SHOWTIME',
      entity_id: String(id),
      before_json: JSON.stringify(oldSt),
      after_json: JSON.stringify(updated),
    });

    sendOk(res, updated);
  })
);

/**
 * DELETE /admin/showtimes/:id
 * Chặn xóa suất chiếu đã có đơn hàng. Chỉ cho phép xóa khi chưa có đơn.
 */
router.delete(
  '/showtimes/:id',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const showtime = await knex('showtimes').where({ id }).first();
    if (!showtime) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy suất chiếu.');

    // CHẶN XÓA NẾU ĐÃ CÓ ĐƠN HÀNG
    const orderCount = await knex('orders').where({ showtime_id: id }).count('order_id as count').first();
    if (Number(orderCount?.count || 0) > 0) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        409,
        'Suất chiếu đã có đơn hàng, không thể xóa. Bạn chỉ có thể hủy suất chiếu kèm quy trình hoàn tiền.'
      );
    }

    // Chưa có đơn hàng -> xóa an toàn
    await knex('showtime_seats').where({ showtime_id: id }).del();
    await knex('showtimes').where({ id }).del();

    await knex('audit_log').insert({
      at: clock.nowIso(),
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'DELETE_SHOWTIME',
      entity: 'SHOWTIME',
      entity_id: String(id),
      before_json: JSON.stringify(showtime),
    });

    sendOk(res, { id: Number(id), message: 'Đã xóa suất chiếu thành công.' });
  })
);

/**
 * POST /admin/showtimes/:id/cancel
 * HỦY SUẤT CHIẾU KÈM QUY TRÌNH HOÀN TIỀN
 * 1. Chuyển showtimes.status = 'CANCELLED'.
 * 2. Đơn PAID: Tạo lệnh hoàn tiền refunds, chuyển sang REFUND_PENDING, hủy vé tickets VOID, nhả ghế, gửi thông báo.
 * 3. Đơn HOLDING/AWAITING_PAYMENT: Chuyển sang CANCELLED, nhả ghế.
 */
router.post(
  '/showtimes/:id/cancel',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;

    const result = await knex.transaction(async (trx) => {
      const showtime = await trx('showtimes').where({ id }).first();
      if (!showtime) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy suất chiếu.');

      // 1. Chuyển trạng thái suất chiếu sang CANCELLED
      await trx('showtimes').where({ id }).update({ status: 'CANCELLED' });

      // 2. Tìm tất cả các đơn hàng thuộc suất chiếu này
      const orders = await trx('orders').where({ showtime_id: id });
      const nowIso = clock.nowIso();
      let refundedOrdersCount = 0;
      let cancelledOrdersCount = 0;

      for (const ord of orders) {
        if (ord.status === 'PAID') {
          const attempt = await trx('payment_attempts').where({ order_id: ord.order_id, status: 'SUCCESS' }).first();
          const refundId = ids.newRefundId();

          // Tạo bản ghi hoàn tiền trong bảng refunds
          const checks = {
            showtime_cancelled: true,
            is_valid_amount: true,
            has_gateway_txn: Boolean(attempt),
            not_refunded_yet: true,
          };

          await trx('refunds').insert({
            refund_id: refundId,
            order_id: ord.order_id,
            gateway_txn_id: attempt ? attempt.gateway_txn_id : 'CANCEL_ST_' + ord.order_id,
            amount: ord.amount_total,
            type: 'AUTO',
            status: 'CHECKING',
            detected_at: nowIso,
            send_due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            checks_json: JSON.stringify(checks),
            sla_breached: false,
            created_by: req.user.id,
          });

          // Chuyển trạng thái đơn sang REFUND_PENDING
          await updateOrderStatus(trx, ord, 'REFUND_PENDING', {
            reason: `Hủy suất chiếu #${id} do rạp, kích hoạt hoàn tiền tự động`,
            actorType: 'STAFF',
            actorId: req.user.id,
          });

          // Đánh dấu vé bị vô hiệu
          await trx('tickets').where({ order_id: ord.order_id }).update({ status: 'VOID' });

          // Nhả ghế của đơn khỏi showtime_seats
          await trx('showtime_seats').where({ order_id: ord.order_id }).del();

          // Gửi thông báo đến khách hàng
          if (ord.user_id) {
            await trx('notifications').insert({
              user_id: ord.user_id,
              order_id: ord.order_id,
              channel: 'WEB',
              title: 'Suất chiếu bị hủy - Đang xử lý hoàn tiền',
              body: `Suất chiếu #${id} đã bị hủy do kế hoạch rạp thay đổi. Đơn hàng ${ord.order_id} trị giá ${Number(ord.amount_total || 0).toLocaleString()}đ đã được chuyển sang quy trình hoàn tiền tự động.`,
              status: 'SENT',
              scheduled_at: nowIso,
              sent_at: nowIso,
            });
          }
          refundedOrdersCount++;
        } else if (ord.status === 'HOLDING' || ord.status === 'AWAITING_PAYMENT') {
          await updateOrderStatus(trx, ord, 'CANCELLED', {
            reason: `Hủy suất chiếu #${id} do rạp`,
            actorType: 'STAFF',
            actorId: req.user.id,
          });
          await trx('showtime_seats').where({ order_id: ord.order_id }).del();
          cancelledOrdersCount++;
        }
      }

      // 3. Ghi audit_log
      await trx('audit_log').insert({
        at: nowIso,
        actor_type: 'STAFF',
        actor_id: String(req.user.id),
        action: 'CANCEL_SHOWTIME',
        entity: 'SHOWTIME',
        entity_id: String(id),
        after_json: JSON.stringify({
          showtime_id: id,
          refunded_orders: refundedOrdersCount,
          cancelled_orders: cancelledOrdersCount,
        }),
      });

      return {
        showtime_id: Number(id),
        status: 'CANCELLED',
        refunded_orders: refundedOrdersCount,
        cancelled_orders: cancelledOrdersCount,
        message: `Đã hủy suất chiếu thành công. Tạo lệnh hoàn tiền cho ${refundedOrdersCount} đơn PAID và hủy ${cancelledOrdersCount} đơn đang giữ.`,
      };
    });

    sendOk(res, result);
  })
);

// =========================================================================
// CRUD GIÁ VÉ (TICKET PRICES) - QUYỀN: MANAGER
// =========================================================================

/**
 * GET /admin/ticket-prices
 */
router.get(
  '/ticket-prices',
  requireStaff('MANAGER'),
  asyncHandler(async (_req, res) => {
    const ticketPrices = await knex('ticket_prices').select('*').orderBy('id', 'asc');
    sendOk(res, { ticketPrices });
  })
);

/**
 * POST /admin/ticket-prices
 */
router.post(
  '/ticket-prices',
  requireStaff('MANAGER'),
  validate({ body: ticketPriceSchema }),
  asyncHandler(async (req, res) => {
    const { name, format, seat_type, price, description } = req.valid.body;
    const nowIso = clock.nowIso();

    const [newId] = await knex('ticket_prices').insert({
      name: name.trim(),
      format,
      seat_type,
      price,
      description: description ? description.trim() : null,
      created_at: nowIso,
      updated_at: nowIso,
    });
    const newPrice = await knex('ticket_prices').where({ id: newId }).first();

    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'CREATE_TICKET_PRICE',
      entity: 'TICKET_PRICE',
      entity_id: String(newId),
      after_json: JSON.stringify(newPrice),
    });

    sendOk(res, newPrice, {}, 201);
  })
);

/**
 * PUT /admin/ticket-prices/:id
 */
router.put(
  '/ticket-prices/:id',
  requireStaff('MANAGER'),
  validate({ body: ticketPriceSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const oldPrice = await knex('ticket_prices').where({ id }).first();
    if (!oldPrice) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy mức giá vé.');

    const { name, format, seat_type, price, description } = req.valid.body;
    const nowIso = clock.nowIso();

    await knex('ticket_prices').where({ id }).update({
      name: name.trim(),
      format,
      seat_type,
      price,
      description: description ? description.trim() : null,
      updated_at: nowIso,
    });
    const updated = await knex('ticket_prices').where({ id }).first();

    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'UPDATE_TICKET_PRICE',
      entity: 'TICKET_PRICE',
      entity_id: String(id),
      before_json: JSON.stringify(oldPrice),
      after_json: JSON.stringify(updated),
    });

    sendOk(res, updated);
  })
);

/**
 * DELETE /admin/ticket-prices/:id
 */
router.delete(
  '/ticket-prices/:id',
  requireStaff('MANAGER'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const priceRow = await knex('ticket_prices').where({ id }).first();
    if (!priceRow) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy mức giá vé.');

    await knex('ticket_prices').where({ id }).del();
    await knex('audit_log').insert({
      at: clock.nowIso(),
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'DELETE_TICKET_PRICE',
      entity: 'TICKET_PRICE',
      entity_id: String(id),
      before_json: JSON.stringify(priceRow),
    });

    sendOk(res, { id: Number(id), message: 'Đã xóa mức giá vé thành công.' });
  })
);

/**
 * Handler lấy danh sách người dùng / nhân sự có bộ lọc và phân trang (quyền: MANAGER).
 */
async function getUsersHandler(req, res) {
  const { role, is_active, search, page, limit = 20 } = req.query;

  let query = knex('users')
    .select('id', 'email', 'phone', 'full_name', 'role', 'is_active', 'must_change_password', 'failed_login_attempts', 'locked_until', 'created_at', 'updated_at')
    .orderBy('id', 'desc');

  if (role && role !== 'ALL') {
    query = query.where({ role });
  }
  if (is_active !== undefined && is_active !== '') {
    const activeBool = is_active === 'true' || is_active === '1' || is_active === true;
    query = query.where({ is_active: activeBool ? 1 : 0 });
  }
  if (search) {
    const q = `%${search.trim()}%`;
    query = query.where(function () {
      this.where('email', 'like', q)
        .orWhere('full_name', 'like', q)
        .orWhere('phone', 'like', q);
    });
  }

  if (page) {
    const countRow = await query.clone().count('id as count').first();
    const total = Number(countRow?.count || 0);
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(Number(limit) || 20, 100));
    const offset = (pageNum - 1) * limitNum;

    const users = await query.clone().limit(limitNum).offset(offset);
    return sendOk(res, {
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  }

  const users = await query.clone().limit(Math.min(Number(limit) || 100, 200));
  sendOk(res, { users });
}

/**
 * GET /admin/management & GET /admin/users
 * Quản trị nhân sự/người dùng (quyền: MANAGER).
 */
router.get('/management', requireStaff('MANAGER'), asyncHandler(getUsersHandler));
router.get('/users', requireStaff('MANAGER'), asyncHandler(getUsersHandler));

/**
 * POST /admin/users
 * Tạo tài khoản nhân viên mới (quyền: MANAGER).
 * Ghi nhận audit_log.
 */
router.post(
  '/users',
  requireStaff('MANAGER'),
  validate({ body: createUserSchema }),
  asyncHandler(async (req, res) => {
    const { email, password, full_name, phone, role } = req.valid.body;
    const nowIso = clock.nowIso();

    // 1. Kiểm tra email đã tồn tại hay chưa
    const existing = await knex('users').where({ email: email.toLowerCase().trim() }).first();
    if (existing) {
      throw new AppError('VALIDATION_ERROR', 400, 'Email này đã tồn tại trong hệ thống.');
    }

    // 2. Hash mật khẩu và khởi tạo tài khoản nhân viên
    const password_hash = bcrypt.hashSync(password, 10);
    const [newId] = await knex('users').insert({
      email: email.toLowerCase().trim(),
      password_hash,
      full_name: full_name.trim(),
      phone: phone ? phone.trim() : null,
      role,
      is_active: 1,
      must_change_password: 1, // Bắt buộc đổi mật khẩu lần đầu
      points: 0,
      created_at: nowIso,
      updated_at: nowIso,
    });

    const newUser = await knex('users')
      .where({ id: newId })
      .select('id', 'email', 'phone', 'full_name', 'role', 'is_active', 'must_change_password', 'created_at')
      .first();

    // 3. Ghi audit_log
    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'CREATE_USER',
      entity: 'USER',
      entity_id: String(newId),
      after_json: JSON.stringify({
        id: newId,
        email: newUser.email,
        full_name: newUser.full_name,
        role: newUser.role,
        must_change_password: true,
      }),
    });

    sendOk(res, newUser, {}, 201);
  })
);

/**
 * PATCH /admin/users/:id/role
 * Gán vai trò cho nhân viên. Không cho tự hạ quyền quản lý của chính mình (quyền: MANAGER).
 */
router.patch(
  '/users/:id/role',
  requireStaff('MANAGER'),
  validate({ body: updateUserRoleSchema }),
  asyncHandler(async (req, res) => {
    const targetUserId = req.params.id;
    const { role } = req.valid.body;
    const nowIso = clock.nowIso();

    const targetUser = await knex('users').where({ id: targetUserId }).first();
    if (!targetUser) {
      throw new AppError('NOT_FOUND', 404, 'Không tìm thấy người dùng.');
    }

    // Không cho tự hạ quyền của chính mình
    if (Number(targetUserId) === Number(req.user.id) && role !== 'MANAGER') {
      throw new AppError('FORBIDDEN', 403, 'Bạn không thể tự hạ quyền quản lý của chính mình.');
    }

    await knex('users').where({ id: targetUserId }).update({
      role,
      updated_at: nowIso,
    });

    // Ghi audit_log
    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'CHANGE_USER_ROLE',
      entity: 'USER',
      entity_id: String(targetUserId),
      before_json: JSON.stringify({ role: targetUser.role }),
      after_json: JSON.stringify({ role }),
    });

    sendOk(res, {
      id: targetUser.id,
      email: targetUser.email,
      role,
      message: `Đã cập nhật vai trò người dùng thành ${role}`,
    });
  })
);

/**
 * PATCH /admin/users/:id/status
 * Khóa hoặc mở khóa tài khoản. Không cho tự khóa chính mình (quyền: MANAGER).
 */
router.patch(
  '/users/:id/status',
  requireStaff('MANAGER'),
  validate({ body: updateUserStatusSchema }),
  asyncHandler(async (req, res) => {
    const targetUserId = req.params.id;
    const { is_active } = req.valid.body;
    const nowIso = clock.nowIso();

    const targetUser = await knex('users').where({ id: targetUserId }).first();
    if (!targetUser) {
      throw new AppError('NOT_FOUND', 404, 'Không tìm thấy người dùng.');
    }

    // Không cho tự khóa chính mình
    if (Number(targetUserId) === Number(req.user.id) && is_active === false) {
      throw new AppError('FORBIDDEN', 403, 'Bạn không thể tự khóa tài khoản của chính mình.');
    }

    const updateData = {
      is_active: is_active ? 1 : 0,
      updated_at: nowIso,
    };
    if (is_active) {
      // Khi mở khóa, đặt lại số lần đăng nhập sai và gỡ thời gian khóa
      updateData.failed_login_attempts = 0;
      updateData.locked_until = null;
    }

    await knex('users').where({ id: targetUserId }).update(updateData);

    // Ghi audit_log
    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'TOGGLE_USER_STATUS',
      entity: 'USER',
      entity_id: String(targetUserId),
      before_json: JSON.stringify({ is_active: Boolean(targetUser.is_active) }),
      after_json: JSON.stringify({ is_active }),
    });

    sendOk(res, {
      id: targetUser.id,
      email: targetUser.email,
      is_active,
      message: is_active ? 'Đã mở khóa tài khoản thành công' : 'Đã khóa tài khoản thành công',
    });
  })
);

/**
 * POST /admin/users/:id/reset-password
 * Đặt lại mật khẩu nhân viên và yêu cầu đổi mật khẩu ở lần đăng nhập tiếp theo (quyền: MANAGER).
 */
router.post(
  '/users/:id/reset-password',
  requireStaff('MANAGER'),
  validate({ body: resetUserPasswordSchema }),
  asyncHandler(async (req, res) => {
    const targetUserId = req.params.id;
    const { newPassword } = req.valid.body;
    const nowIso = clock.nowIso();

    const targetUser = await knex('users').where({ id: targetUserId }).first();
    if (!targetUser) {
      throw new AppError('NOT_FOUND', 404, 'Không tìm thấy người dùng.');
    }

    const password_hash = bcrypt.hashSync(newPassword, 10);
    await knex('users').where({ id: targetUserId }).update({
      password_hash,
      must_change_password: 1,
      failed_login_attempts: 0,
      locked_until: null,
      updated_at: nowIso,
    });

    // Ghi audit_log
    await knex('audit_log').insert({
      at: nowIso,
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'RESET_USER_PASSWORD',
      entity: 'USER',
      entity_id: String(targetUserId),
      after_json: JSON.stringify({
        email: targetUser.email,
        must_change_password: true,
      }),
    });

    sendOk(res, {
      id: targetUser.id,
      email: targetUser.email,
      message: 'Đặt lại mật khẩu thành công. Nhân viên sẽ phải đổi mật khẩu khi đăng nhập.',
    });
  })
);

/**
 * Helper xuất một dòng CSV chuẩn theo RFC 4180 (escape dấu phẩy, nháy kép, xuống dòng).
 */
function toCsvRow(arr) {
  return arr
    .map((val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    })
    .join(',');
}

/**
 * 1. Báo cáo Doanh thu theo Ngày / theo Phim / theo Rạp (quyền: ACCOUNTANT, MANAGER).
 */
async function getRevenueReportData(from, to) {
  const fromDate = from ? String(from).slice(0, 10) : '1970-01-01';
  const toDate = to ? String(to).slice(0, 10) : '2099-12-31';

  // 1. Doanh thu theo Ngày (đơn PAID)
  const dailyRows = await knex('orders')
    .where('status', 'PAID')
    .whereRaw("SUBSTR(COALESCE(paid_at, created_at), 1, 10) >= ?", [fromDate])
    .whereRaw("SUBSTR(COALESCE(paid_at, created_at), 1, 10) <= ?", [toDate])
    .select(
      knex.raw("SUBSTR(COALESCE(paid_at, created_at), 1, 10) as date"),
      knex.raw('COUNT(DISTINCT order_id) as orders_count'),
      knex.raw('COALESCE(SUM(amount_tickets), 0) as amount_tickets'),
      knex.raw('COALESCE(SUM(amount_combos), 0) as amount_combos'),
      knex.raw('COALESCE(SUM(amount_total), 0) as total_revenue')
    )
    .groupByRaw("SUBSTR(COALESCE(paid_at, created_at), 1, 10)")
    .orderBy('date', 'desc');

  const by_day = dailyRows.map((r) => ({
    date: r.date,
    orders_count: Number(r.orders_count || 0),
    amount_tickets: Number(r.amount_tickets || 0),
    amount_combos: Number(r.amount_combos || 0),
    total_revenue: Number(r.total_revenue || 0),
  }));

  // 2. Doanh thu theo Phim (đơn PAID)
  const movieOrderRows = await knex('orders as o')
    .join('showtimes as st', 'o.showtime_id', 'st.id')
    .join('movies as m', 'st.movie_id', 'm.id')
    .where('o.status', 'PAID')
    .whereRaw("SUBSTR(COALESCE(o.paid_at, o.created_at), 1, 10) >= ?", [fromDate])
    .whereRaw("SUBSTR(COALESCE(o.paid_at, o.created_at), 1, 10) <= ?", [toDate])
    .select(
      'm.id as movie_id',
      'm.title as movie_title',
      knex.raw('COUNT(o.order_id) as orders_count'),
      knex.raw('COALESCE(SUM(o.amount_total), 0) as total_revenue'),
      knex.raw('COALESCE(SUM(o.amount_tickets), 0) as amount_tickets'),
      knex.raw('COALESCE(SUM(o.amount_combos), 0) as amount_combos')
    )
    .groupBy('m.id', 'm.title')
    .orderBy('total_revenue', 'desc');

  const movieTicketRows = await knex('order_seats as os')
    .join('orders as o', 'os.order_id', 'o.order_id')
    .join('showtimes as st', 'o.showtime_id', 'st.id')
    .where('o.status', 'PAID')
    .whereRaw("SUBSTR(COALESCE(o.paid_at, o.created_at), 1, 10) >= ?", [fromDate])
    .whereRaw("SUBSTR(COALESCE(o.paid_at, o.created_at), 1, 10) <= ?", [toDate])
    .select('st.movie_id', knex.raw('COUNT(os.seat_id) as tickets_count'))
    .groupBy('st.movie_id');

  const movieTicketsMap = {};
  for (const r of movieTicketRows) {
    movieTicketsMap[r.movie_id] = Number(r.tickets_count || 0);
  }

  const by_movie = movieOrderRows.map((r) => ({
    movie_id: r.movie_id,
    movie_title: r.movie_title,
    orders_count: Number(r.orders_count || 0),
    tickets_count: movieTicketsMap[r.movie_id] || 0,
    amount_tickets: Number(r.amount_tickets || 0),
    amount_combos: Number(r.amount_combos || 0),
    total_revenue: Number(r.total_revenue || 0),
  }));

  // 3. Doanh thu theo Rạp (đơn PAID)
  const cinemaOrderRows = await knex('orders as o')
    .join('showtimes as st', 'o.showtime_id', 'st.id')
    .join('rooms as r', 'st.room_id', 'r.id')
    .join('cinemas as c', 'r.cinema_id', 'c.id')
    .where('o.status', 'PAID')
    .whereRaw("SUBSTR(COALESCE(o.paid_at, o.created_at), 1, 10) >= ?", [fromDate])
    .whereRaw("SUBSTR(COALESCE(o.paid_at, o.created_at), 1, 10) <= ?", [toDate])
    .select(
      'c.id as cinema_id',
      'c.name as cinema_name',
      'c.city as cinema_city',
      knex.raw('COUNT(o.order_id) as orders_count'),
      knex.raw('COALESCE(SUM(o.amount_total), 0) as total_revenue'),
      knex.raw('COALESCE(SUM(o.amount_tickets), 0) as amount_tickets'),
      knex.raw('COALESCE(SUM(o.amount_combos), 0) as amount_combos')
    )
    .groupBy('c.id', 'c.name', 'c.city')
    .orderBy('total_revenue', 'desc');

  const cinemaTicketRows = await knex('order_seats as os')
    .join('orders as o', 'os.order_id', 'o.order_id')
    .join('showtimes as st', 'o.showtime_id', 'st.id')
    .join('rooms as r', 'st.room_id', 'r.id')
    .where('o.status', 'PAID')
    .whereRaw("SUBSTR(COALESCE(o.paid_at, o.created_at), 1, 10) >= ?", [fromDate])
    .whereRaw("SUBSTR(COALESCE(o.paid_at, o.created_at), 1, 10) <= ?", [toDate])
    .select('r.cinema_id', knex.raw('COUNT(os.seat_id) as tickets_count'))
    .groupBy('r.cinema_id');

  const cinemaTicketsMap = {};
  for (const r of cinemaTicketRows) {
    cinemaTicketsMap[r.cinema_id] = Number(r.tickets_count || 0);
  }

  const by_cinema = cinemaOrderRows.map((r) => ({
    cinema_id: r.cinema_id,
    cinema_name: r.cinema_name,
    cinema_city: r.cinema_city,
    orders_count: Number(r.orders_count || 0),
    tickets_count: cinemaTicketsMap[r.cinema_id] || 0,
    amount_tickets: Number(r.amount_tickets || 0),
    amount_combos: Number(r.amount_combos || 0),
    total_revenue: Number(r.total_revenue || 0),
  }));

  // Tổng hợp chung
  const total_revenue = by_day.reduce((acc, cur) => acc + cur.total_revenue, 0);
  const total_orders = by_day.reduce((acc, cur) => acc + cur.orders_count, 0);
  const total_tickets = Object.values(movieTicketsMap).reduce((acc, cur) => acc + cur, 0);

  return {
    by_day,
    by_movie,
    by_cinema,
    totals: {
      total_revenue,
      total_orders,
      total_tickets,
    },
  };
}

/**
 * 2. Báo cáo Hoàn tiền & SLA (quyền: ACCOUNTANT, MANAGER).
 * Bao gồm: đã hoàn, đang xử lý, quá hạn SLA, thời gian trung bình từ phát hiện đến gửi lệnh hoàn.
 */
async function getRefundsReportData(from, to) {
  const fromDate = from ? String(from).slice(0, 10) : '1970-01-01';
  const toDate = to ? String(to).slice(0, 10) : '2099-12-31';
  const nowMs = clock.nowMs();

  const rows = await knex('refunds as rf')
    .whereRaw("SUBSTR(rf.detected_at, 1, 10) >= ?", [fromDate])
    .whereRaw("SUBSTR(rf.detected_at, 1, 10) <= ?", [toDate])
    .select('*')
    .orderBy('detected_at', 'desc');

  let completed_count = 0;
  let completed_amount = 0;
  let processing_count = 0;
  let processing_amount = 0;
  let rejected_count = 0;
  let overdue_count = 0;

  let totalTurnaroundMinutes = 0;
  let turnaroundItemCount = 0;

  const items = rows.map((rf) => {
    const isTerminal = rf.status === 'COMPLETED' || rf.status === 'REJECTED';
    let isOverdue = Boolean(rf.sla_breached);
    if (!isTerminal && rf.send_due_at) {
      if (nowMs > new Date(rf.send_due_at).getTime()) {
        isOverdue = true;
      }
    }

    if (rf.status === 'COMPLETED') {
      completed_count++;
      completed_amount += Number(rf.amount || 0);
    } else if (['CHECKING', 'SENT', 'BANK_PROCESSING'].includes(rf.status)) {
      processing_count++;
      processing_amount += Number(rf.amount || 0);
    } else if (rf.status === 'REJECTED') {
      rejected_count++;
    }

    if (isOverdue) {
      overdue_count++;
    }

    // Thời gian từ lúc phát hiện lỗi (detected_at) đến lúc gửi lệnh hoàn (sent_at hoặc completed_at)
    let turnaroundMinutes = null;
    const dispatchedAt = rf.sent_at || rf.completed_at;
    if (dispatchedAt && rf.detected_at) {
      const diffMs = Math.max(0, new Date(dispatchedAt).getTime() - new Date(rf.detected_at).getTime());
      turnaroundMinutes = Math.round((diffMs / 60000) * 10) / 10;
      totalTurnaroundMinutes += turnaroundMinutes;
      turnaroundItemCount++;
    }

    return {
      refund_id: rf.refund_id,
      order_id: rf.order_id,
      amount: Number(rf.amount || 0),
      status: rf.status,
      type: rf.type,
      detected_at: rf.detected_at,
      send_due_at: rf.send_due_at,
      sent_at: rf.sent_at,
      completed_at: rf.completed_at,
      is_overdue: isOverdue,
      turnaround_minutes: turnaroundMinutes,
    };
  });

  const avg_turnaround_minutes = turnaroundItemCount > 0
    ? Math.round((totalTurnaroundMinutes / turnaroundItemCount) * 10) / 10
    : 0;

  return {
    completed_count,
    completed_amount,
    processing_count,
    processing_amount,
    rejected_count,
    overdue_count,
    avg_turnaround_minutes,
    items,
  };
}

/**
 * 3. Báo cáo Ticket CSKH theo trạng thái & Thời gian xử lý trung bình (quyền: ACCOUNTANT, MANAGER).
 */
async function getTicketsReportData(from, to) {
  const fromDate = from ? String(from).slice(0, 10) : '1970-01-01';
  const toDate = to ? String(to).slice(0, 10) : '2099-12-31';

  const rows = await knex('support_tickets as st')
    .whereRaw("SUBSTR(st.created_at, 1, 10) >= ?", [fromDate])
    .whereRaw("SUBSTR(st.created_at, 1, 10) <= ?", [toDate])
    .select('*')
    .orderBy('created_at', 'desc');

  const by_status = {
    NEW: 0,
    IN_REVIEW: 0,
    WAITING_REFUND: 0,
    RESOLVED: 0,
    REJECTED: 0,
  };

  let totalResolutionMinutes = 0;
  let resolvedItemCount = 0;

  const items = rows.map((t) => {
    if (by_status[t.status] !== undefined) {
      by_status[t.status]++;
    }

    let resolutionHours = null;
    let resolutionMinutes = null;
    if (t.resolved_at && t.created_at) {
      const diffMs = Math.max(0, new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime());
      resolutionMinutes = Math.round((diffMs / 60000) * 10) / 10;
      resolutionHours = Math.round((diffMs / 3600000) * 10) / 10;
      totalResolutionMinutes += resolutionMinutes;
      resolvedItemCount++;
    }

    return {
      ticket_id: t.ticket_id,
      order_id: t.order_id,
      source: t.source,
      status: t.status,
      issue_type: t.issue_type,
      created_at: t.created_at,
      resolved_at: t.resolved_at,
      resolution_minutes: resolutionMinutes,
      resolution_hours: resolutionHours,
    };
  });

  const avg_resolution_minutes = resolvedItemCount > 0
    ? Math.round((totalResolutionMinutes / resolvedItemCount) * 10) / 10
    : 0;
  const avg_resolution_hours = resolvedItemCount > 0
    ? Math.round((avg_resolution_minutes / 60) * 10) / 10
    : 0;

  return {
    by_status,
    total_tickets: rows.length,
    avg_resolution_minutes,
    avg_resolution_hours,
    items,
  };
}

/**
 * 4. Báo cáo Tỷ lệ Lấp đầy Ghế theo Suất chiếu (quyền: ACCOUNTANT, MANAGER).
 */
async function getOccupancyReportData(from, to) {
  const fromDate = from ? String(from).slice(0, 10) : '1970-01-01';
  const toDate = to ? String(to).slice(0, 10) : '2099-12-31';

  // 1. Lấy tất cả suất chiếu trong khoảng thời gian [from, to]
  const showtimes = await knex('showtimes as st')
    .join('movies as m', 'st.movie_id', 'm.id')
    .join('rooms as r', 'st.room_id', 'r.id')
    .join('cinemas as c', 'r.cinema_id', 'c.id')
    .whereRaw("SUBSTR(st.starts_at, 1, 10) >= ?", [fromDate])
    .whereRaw("SUBSTR(st.starts_at, 1, 10) <= ?", [toDate])
    .select(
      'st.id as showtime_id',
      'st.starts_at',
      'st.ends_at',
      'st.format',
      'st.room_id',
      'm.title as movie_title',
      'r.name as room_name',
      'c.name as cinema_name'
    )
    .orderBy('st.starts_at', 'desc')
    .limit(200);

  if (showtimes.length === 0) {
    return [];
  }

  const roomIds = Array.from(new Set(showtimes.map((s) => s.room_id)));
  const showtimeIds = showtimes.map((s) => s.showtime_id);

  // 2. Tổng số ghế theo phòng
  const roomSeatsRows = await knex('seats')
    .whereIn('room_id', roomIds)
    .select('room_id', knex.raw('COUNT(id) as total_seats'))
    .groupBy('room_id');

  const roomSeatsMap = {};
  for (const r of roomSeatsRows) {
    roomSeatsMap[r.room_id] = Number(r.total_seats || 0);
  }

  // 3. Số ghế đã bán theo suất (đơn hàng PAID)
  const bookedSeatsRows = await knex('order_seats as os')
    .join('orders as o', 'os.order_id', 'o.order_id')
    .whereIn('o.showtime_id', showtimeIds)
    .where('o.status', 'PAID')
    .select('o.showtime_id', knex.raw('COUNT(os.seat_id) as booked_seats'))
    .groupBy('o.showtime_id');

  const bookedSeatsMap = {};
  for (const r of bookedSeatsRows) {
    bookedSeatsMap[r.showtime_id] = Number(r.booked_seats || 0);
  }

  // 4. Doanh thu theo suất (đơn hàng PAID)
  const revenueRows = await knex('orders')
    .whereIn('showtime_id', showtimeIds)
    .where('status', 'PAID')
    .select('showtime_id', knex.raw('SUM(amount_total) as revenue'))
    .groupBy('showtime_id');

  const revenueMap = {};
  for (const r of revenueRows) {
    revenueMap[r.showtime_id] = Number(r.revenue || 0);
  }

  // 5. Tổng hợp
  const items = showtimes.map((st) => {
    const total_seats = roomSeatsMap[st.room_id] || 0;
    const booked_seats = bookedSeatsMap[st.showtime_id] || 0;
    const occupancy_rate = total_seats > 0
      ? Math.round((booked_seats / total_seats) * 1000) / 10
      : 0;
    const revenue = revenueMap[st.showtime_id] || 0;

    return {
      showtime_id: st.showtime_id,
      movie_title: st.movie_title,
      cinema_name: st.cinema_name,
      room_name: st.room_name,
      starts_at: st.starts_at,
      format: st.format,
      total_seats,
      booked_seats,
      occupancy_rate,
      revenue,
    };
  });

  return items;
}

/**
 * Hàm tổng hợp báo cáo đối soát theo từng ngày trong khoảng thời gian [from, to].
 */
async function getReconciliationReportData(from, to) {
  const fromDate = from ? String(from).slice(0, 10) : '1970-01-01';
  const toDate = to ? String(to).slice(0, 10) : '2099-12-31';

  // 1. Tổng tiền cổng xác nhận thành công
  const gwRows = await knex('payment_attempts')
    .select(knex.raw("SUBSTR(created_at, 1, 10) as date"), knex.raw('SUM(amount) as gateway_total'))
    .where('status', 'SUCCESS')
    .whereRaw("SUBSTR(created_at, 1, 10) >= ?", [fromDate])
    .whereRaw("SUBSTR(created_at, 1, 10) <= ?", [toDate])
    .groupByRaw("SUBSTR(created_at, 1, 10)");

  // 2. Tổng tiền Beta ghi nhận thành công (đơn PAID)
  const betaRows = await knex('orders')
    .select(knex.raw("SUBSTR(COALESCE(paid_at, created_at), 1, 10) as date"), knex.raw('SUM(amount_total) as beta_total'))
    .where('status', 'PAID')
    .whereRaw("SUBSTR(COALESCE(paid_at, created_at), 1, 10) >= ?", [fromDate])
    .whereRaw("SUBSTR(COALESCE(paid_at, created_at), 1, 10) <= ?", [toDate])
    .groupByRaw("SUBSTR(COALESCE(paid_at, created_at), 1, 10)");

  // 3. Số giao dịch treo (đơn chờ thanh toán/xác thực nhưng cổng đã trừ tiền)
  const hangingRows = await knex('orders as o')
    .join('payment_attempts as pa', 'o.order_id', 'pa.order_id')
    .select(knex.raw("SUBSTR(pa.created_at, 1, 10) as date"), knex.raw('COUNT(DISTINCT o.order_id) as hanging_count'))
    .whereIn('o.status', ['AWAITING_PAYMENT', 'PENDING_VERIFY'])
    .where('pa.status', 'SUCCESS')
    .whereRaw("SUBSTR(pa.created_at, 1, 10) >= ?", [fromDate])
    .whereRaw("SUBSTR(pa.created_at, 1, 10) <= ?", [toDate])
    .groupByRaw("SUBSTR(pa.created_at, 1, 10)");

  // 4. Số lệnh hoàn tiền đã hoàn tất (COMPLETED)
  const refundedRows = await knex('refunds')
    .select(knex.raw("SUBSTR(COALESCE(completed_at, detected_at), 1, 10) as date"), knex.raw('COUNT(*) as refunded_count'))
    .where('status', 'COMPLETED')
    .whereRaw("SUBSTR(COALESCE(completed_at, detected_at), 1, 10) >= ?", [fromDate])
    .whereRaw("SUBSTR(COALESCE(completed_at, detected_at), 1, 10) <= ?", [toDate])
    .groupByRaw("SUBSTR(COALESCE(completed_at, detected_at), 1, 10)");

  // 5. Số lệnh hoàn tiền đang xử lý (CHECKING, SENT, BANK_PROCESSING)
  const refundingRows = await knex('refunds')
    .select(knex.raw("SUBSTR(detected_at, 1, 10) as date"), knex.raw('COUNT(*) as refunding_count'))
    .whereIn('status', ['CHECKING', 'SENT', 'BANK_PROCESSING'])
    .whereRaw("SUBSTR(detected_at, 1, 10) >= ?", [fromDate])
    .whereRaw("SUBSTR(detected_at, 1, 10) <= ?", [toDate])
    .groupByRaw("SUBSTR(detected_at, 1, 10)");

  // Gom các ngày lại
  const datesSet = new Set();
  const gwMap = {};
  const betaMap = {};
  const hangingMap = {};
  const refundedMap = {};
  const refundingMap = {};

  for (const r of gwRows) {
    if (r.date) {
      datesSet.add(r.date);
      gwMap[r.date] = Number(r.gateway_total || 0);
    }
  }
  for (const r of betaRows) {
    if (r.date) {
      datesSet.add(r.date);
      betaMap[r.date] = Number(r.beta_total || 0);
    }
  }
  for (const r of hangingRows) {
    if (r.date) {
      datesSet.add(r.date);
      hangingMap[r.date] = Number(r.hanging_count || 0);
    }
  }
  for (const r of refundedRows) {
    if (r.date) {
      datesSet.add(r.date);
      refundedMap[r.date] = Number(r.refunded_count || 0);
    }
  }
  for (const r of refundingRows) {
    if (r.date) {
      datesSet.add(r.date);
      refundingMap[r.date] = Number(r.refunding_count || 0);
    }
  }

  const sortedDates = Array.from(datesSet).sort();
  const report = sortedDates.map((date) => {
    const gw = gwMap[date] || 0;
    const beta = betaMap[date] || 0;
    return {
      date,
      gateway_total: gw,
      beta_total: beta,
      difference: gw - beta,
      hanging_count: hangingMap[date] || 0,
      refunded_count: refundedMap[date] || 0,
      refunding_count: refundingMap[date] || 0,
    };
  });

  return report;
}

/**
 * GET /admin/reports/reconciliation/export.csv
 * Xuất file CSV báo cáo đối soát có UTF-8 BOM (quyền: ACCOUNTANT, MANAGER).
 */
router.get(
  '/reports/reconciliation/export.csv',
  requireStaff('ACCOUNTANT', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const report = await getReconciliationReportData(from, to);

    const BOM = '\uFEFF';
    const header = 'Ngày,Tổng tiền Cổng (VND),Tổng tiền Beta (VND),Chênh lệch (VND),Số GD treo,Đã hoàn,Đang hoàn\r\n';
    const rows = report
      .map(
        (r) =>
          `${r.date},${r.gateway_total},${r.beta_total},${r.difference},${r.hanging_count},${r.refunded_count},${r.refunding_count}`
      )
      .join('\r\n');

    const csv = BOM + header + rows;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="reconciliation-report.csv"');
    res.status(200).send(csv);
  })
);

/**
 * GET /admin/reports/reconciliation
 * Báo cáo đối soát theo ngày (quyền: ACCOUNTANT, MANAGER).
 */
router.get(
  '/reports/reconciliation',
  requireStaff('ACCOUNTANT', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const report = await getReconciliationReportData(from, to);
    sendOk(res, report);
  })
);

/**
 * GET /admin/reports/overview
 * Báo cáo tổng hợp toàn diện (Doanh thu theo ngày/phim/rạp, Đối soát, Hoàn tiền & SLA, CSKH Ticket, Tỷ lệ lấp đầy ghế).
 * Quyền: ACCOUNTANT, MANAGER.
 */
router.get(
  '/reports/overview',
  requireStaff('ACCOUNTANT', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const [revenue, recon, refunds, tickets, occupancy] = await Promise.all([
      getRevenueReportData(from, to),
      getReconciliationReportData(from, to),
      getRefundsReportData(from, to),
      getTicketsReportData(from, to),
      getOccupancyReportData(from, to),
    ]);

    sendOk(res, {
      revenue,
      recon,
      refunds,
      tickets,
      occupancy,
    });
  })
);

/**
 * GET /admin/reports/export.csv
 * Xuất file CSV báo cáo theo loại (type: revenue_daily, revenue_movie, revenue_cinema, recon, refunds, tickets, occupancy).
 * Quyền: ACCOUNTANT, MANAGER.
 */
router.get(
  '/reports/export.csv',
  requireStaff('ACCOUNTANT', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { type = 'recon', from, to } = req.query;
    const BOM = '\uFEFF';
    let filename = 'report.csv';
    let header = '';
    let rows = '';

    if (type === 'revenue_daily') {
      filename = 'revenue-by-day.csv';
      const data = await getRevenueReportData(from, to);
      header = 'Ngày,Số đơn hàng,Tiền vé (VND),Tiền bắp nước (VND),Tổng doanh thu (VND)\r\n';
      rows = data.by_day
        .map((r) => toCsvRow([r.date, r.orders_count, r.amount_tickets, r.amount_combos, r.total_revenue]))
        .join('\r\n');
    } else if (type === 'revenue_movie') {
      filename = 'revenue-by-movie.csv';
      const data = await getRevenueReportData(from, to);
      header = 'Mã phim,Tên phim,Số đơn hàng,Số vé bán ra,Tiền vé (VND),Tiền bắp nước (VND),Tổng doanh thu (VND)\r\n';
      rows = data.by_movie
        .map((r) => toCsvRow([r.movie_id, r.movie_title, r.orders_count, r.tickets_count, r.amount_tickets, r.amount_combos, r.total_revenue]))
        .join('\r\n');
    } else if (type === 'revenue_cinema') {
      filename = 'revenue-by-cinema.csv';
      const data = await getRevenueReportData(from, to);
      header = 'Mã rạp,Tên rạp,Thành phố,Số đơn hàng,Số vé bán ra,Tiền vé (VND),Tiền bắp nước (VND),Tổng doanh thu (VND)\r\n';
      rows = data.by_cinema
        .map((r) => toCsvRow([r.cinema_id, r.cinema_name, r.cinema_city, r.orders_count, r.tickets_count, r.amount_tickets, r.amount_combos, r.total_revenue]))
        .join('\r\n');
    } else if (type === 'recon') {
      filename = 'reconciliation-report.csv';
      const report = await getReconciliationReportData(from, to);
      header = 'Ngày,Tổng tiền Cổng (VND),Tổng tiền Beta (VND),Chênh lệch (VND),Số GD treo,Đã hoàn,Đang hoàn\r\n';
      rows = report
        .map((r) => toCsvRow([r.date, r.gateway_total, r.beta_total, r.difference, r.hanging_count, r.refunded_count, r.refunding_count]))
        .join('\r\n');
    } else if (type === 'refunds') {
      filename = 'refunds-sla-report.csv';
      const data = await getRefundsReportData(from, to);
      header = 'Mã lệnh hoàn,Mã đơn hàng,Số tiền (VND),Trạng thái,Hình thức,Thời gian phát hiện,Hạn SLA 24H,Thời gian gửi hoàn,Thời gian hoàn tất,Quá hạn SLA,Thời gian từ phát hiện đến gửi lệnh (phút)\r\n';
      rows = data.items
        .map((r) => toCsvRow([
          r.refund_id,
          r.order_id,
          r.amount,
          r.status,
          r.type,
          r.detected_at,
          r.send_due_at,
          r.sent_at || '',
          r.completed_at || '',
          r.is_overdue ? 'CÓ' : 'KHÔNG',
          r.turnaround_minutes !== null ? r.turnaround_minutes : ''
        ]))
        .join('\r\n');
    } else if (type === 'tickets') {
      filename = 'support-tickets-report.csv';
      const data = await getTicketsReportData(from, to);
      header = 'Mã ticket,Mã đơn hàng,Nguồn,Trạng thái,Loại sự cố,Thời gian tạo,Thời gian giải quyết,Thời gian xử lý (giờ)\r\n';
      rows = data.items
        .map((r) => toCsvRow([
          r.ticket_id,
          r.order_id || '',
          r.source,
          r.status,
          r.issue_type || '',
          r.created_at,
          r.resolved_at || '',
          r.resolution_hours !== null ? r.resolution_hours : ''
        ]))
        .join('\r\n');
    } else if (type === 'occupancy') {
      filename = 'showtimes-occupancy-report.csv';
      const data = await getOccupancyReportData(from, to);
      header = 'Mã suất,Tên phim,Cụm rạp,Phòng chiếu,Suất chiếu,Định dạng,Tổng số ghế,Số ghế đã bán,Tỷ lệ lấp đầy (%),Doanh thu (VND)\r\n';
      rows = data
        .map((r) => toCsvRow([
          r.showtime_id,
          r.movie_title,
          r.cinema_name,
          r.room_name,
          r.starts_at,
          r.format,
          r.total_seats,
          r.booked_seats,
          `${r.occupancy_rate}%`,
          r.revenue
        ]))
        .join('\r\n');
    } else {
      throw new AppError('VALIDATION_ERROR', 400, 'Loại báo cáo không hợp lệ');
    }

    const csv = BOM + header + rows;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  })
);

/**
 * GET /admin/refunds
 * Danh sách các lệnh hoàn tiền kèm theo dõi SLA 24h và đánh dấu quá hạn.
 * Quyền: ACCOUNTANT, CSKH, MANAGER.
 */
router.get(
  '/refunds',
  requireStaff('ACCOUNTANT', 'CSKH', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { status, orderId, refundId, overdue, from, to, page, limit = 10 } = req.query;
    const nowIso = clock.nowIso();
    const nowMs = clock.nowMs();

    let query = knex('refunds as rf')
      .leftJoin('orders as o', 'rf.order_id', 'o.order_id')
      .select(
        'rf.*',
        'o.customer_name',
        'o.customer_phone',
        'o.customer_email',
        'o.status as order_status'
      )
      .orderBy('rf.detected_at', 'desc');

    if (status) {
      query = query.where('rf.status', status);
    }
    if (orderId) {
      query = query.where('rf.order_id', orderId);
    }
    if (refundId) {
      query = query.where('rf.refund_id', refundId);
    }
    if (from) {
      query = query.whereRaw('SUBSTR(rf.detected_at, 1, 10) >= ?', [from]);
    }
    if (to) {
      query = query.whereRaw('SUBSTR(rf.detected_at, 1, 10) <= ?', [to]);
    }

    const rawRefunds = await query;

    // Tính toán SLA 24h và đánh dấu quá hạn cho từng lệnh hoàn tiền
    const refunds = [];
    for (const r of rawRefunds) {
      const isTerminal = r.status === 'COMPLETED' || r.status === 'REJECTED';
      let isOverdue = Boolean(r.sla_breached);
      let remainingMinutes = null;

      if (r.send_due_at) {
        const dueMs = new Date(r.send_due_at).getTime();
        remainingMinutes = Math.round((dueMs - nowMs) / 60000);

        if (!isTerminal && nowMs > dueMs) {
          isOverdue = true;
          if (!r.sla_breached) {
            // Tự động cập nhật cờ sla_breached trong CSDL nếu quá hạn
            await knex('refunds').where({ refund_id: r.refund_id }).update({ sla_breached: true });
            r.sla_breached = true;
          }
        }
      }

      // Nếu có filter overdue=true thì chỉ lấy các ca quá hạn
      if (overdue === 'true' && !isOverdue) {
        continue;
      }

      refunds.push({
        ...r,
        is_overdue: isOverdue,
        remaining_sla_minutes: isTerminal ? null : remainingMinutes,
      });
    }

    if (page) {
      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Math.min(Number(limit) || 10, 100));
      const total = refunds.length;
      const offset = (pageNum - 1) * limitNum;
      const items = refunds.slice(offset, offset + limitNum);

      return sendOk(res, {
        items,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum) || 1,
        },
      });
    }

    sendOk(res, refunds);
  })
);

/**
 * POST /admin/refunds/:id/approve
 * Phê duyệt và thực thi lệnh hoàn tiền ngay lập tức (quyền: ACCOUNTANT, CSKH, MANAGER).
 * Ghi nhận audit_log trước và sau khi duyệt.
 */
router.post(
  '/refunds/:id/approve',
  requireStaff('ACCOUNTANT', 'CSKH', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const refundId = req.params.id;
    const beforeRefund = await knex('refunds').where({ refund_id: refundId }).first();

    if (!beforeRefund) {
      throw new AppError('NOT_FOUND');
    }

    if (beforeRefund.status === 'COMPLETED') {
      return sendOk(res, beforeRefund);
    }

    // Thực thi hoàn tiền ngay lập tức
    const { processRefundQueue } = require('../services/refundService');
    await processRefundQueue({
      targetRefundId: refundId,
      completeImmediately: true,
      advanceBankProcessing: true,
    });

    const afterRefund = await knex('refunds').where({ refund_id: refundId }).first();

    // Ghi nhận audit_log (trước/sau)
    await knex('audit_log').insert({
      at: clock.nowIso(),
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'REFUND_APPROVE',
      entity: 'REFUND',
      entity_id: String(refundId),
      before_json: JSON.stringify({
        refund_id: beforeRefund.refund_id,
        order_id: beforeRefund.order_id,
        amount: beforeRefund.amount,
        status: beforeRefund.status,
        type: beforeRefund.type,
        send_due_at: beforeRefund.send_due_at,
        sla_breached: Boolean(beforeRefund.sla_breached),
      }),
      after_json: JSON.stringify({
        refund_id: afterRefund.refund_id,
        order_id: afterRefund.order_id,
        amount: afterRefund.amount,
        status: afterRefund.status,
        completed_at: afterRefund.completed_at,
        type: afterRefund.type,
      }),
    });

    sendOk(res, afterRefund);
  })
);

/**
 * GET /admin/recon/runs
 * Danh sách các phiên đối soát có bộ lọc trạng thái, trigger, ngày và phân trang.
 * Quyền: IT, ACCOUNTANT, MANAGER.
 */
router.get(
  '/recon/runs',
  requireStaff('IT', 'ACCOUNTANT', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { status, trigger, from, to, page = 1, limit = 10 } = req.query;

    let baseQuery = knex('recon_runs');

    if (status) {
      baseQuery = baseQuery.where({ status });
    }

    if (trigger) {
      baseQuery = baseQuery.where({ trigger });
    }

    if (from) {
      baseQuery = baseQuery.whereRaw('SUBSTR(started_at, 1, 10) >= ?', [from]);
    }

    if (to) {
      baseQuery = baseQuery.whereRaw('SUBSTR(started_at, 1, 10) <= ?', [to]);
    }

    const countRow = await baseQuery.clone().count('* as count').first();
    const total = Number(countRow?.count || 0);

    const limitNum = Math.max(1, Math.min(Number(limit) || 10, 100));
    const pageNum = Math.max(1, Number(page) || 1);
    const offset = (pageNum - 1) * limitNum;

    const items = await baseQuery
      .clone()
      .select('*')
      .orderBy('started_at', 'desc')
      .limit(limitNum)
      .offset(offset);

    sendOk(res, {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  })
);

/**
 * GET /admin/recon/items
 * Chi tiết từng dòng đối soát (các ca lệch giữa tiền cổng ghi nhận và tiền Beta thu).
 * Quyền: IT, ACCOUNTANT, MANAGER.
 */
router.get(
  '/recon/items',
  requireStaff('IT', 'ACCOUNTANT', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { runId, classification, onlyMismatched, from, to, page = 1, limit = 10 } = req.query;

    let baseQuery = knex('recon_items as ri')
      .leftJoin('recon_runs as rr', 'ri.run_id', 'rr.run_id')
      .leftJoin('orders as o', 'ri.order_id', 'o.order_id');

    if (runId) {
      baseQuery = baseQuery.where('ri.run_id', Number(runId));
    }

    if (classification && classification !== 'ALL') {
      baseQuery = baseQuery.where('ri.classification', classification);
    } else if (onlyMismatched === 'true' || onlyMismatched === true) {
      // Chỉ lấy các ca có sai lệch (khác MATCHED và ALREADY_HANDLED)
      baseQuery = baseQuery.whereNotIn('ri.classification', ['MATCHED', 'ALREADY_HANDLED']);
    }

    if (from) {
      baseQuery = baseQuery.whereRaw('SUBSTR(rr.started_at, 1, 10) >= ?', [from]);
    }

    if (to) {
      baseQuery = baseQuery.whereRaw('SUBSTR(rr.started_at, 1, 10) <= ?', [to]);
    }

    const countRow = await baseQuery.clone().count('ri.id as count').first();
    const total = Number(countRow?.count || 0);

    const limitNum = Math.max(1, Math.min(Number(limit) || 10, 100));
    const pageNum = Math.max(1, Number(page) || 1);
    const offset = (pageNum - 1) * limitNum;

    const rows = await baseQuery
      .clone()
      .select(
        'ri.id',
        'ri.run_id',
        'ri.order_id',
        'ri.gateway_txn_id',
        'ri.beta_status',
        'ri.gateway_status',
        'ri.gateway_debited',
        'ri.amount_beta',
        'ri.amount_gateway',
        'ri.classification',
        'ri.action',
        'rr.started_at as run_started_at',
        'rr.trigger as run_trigger',
        'o.customer_name',
        'o.customer_phone',
        'o.customer_email'
      )
      .orderBy('ri.id', 'desc')
      .limit(limitNum)
      .offset(offset);

    const items = rows.map((r) => ({
      ...r,
      difference: Number(r.amount_gateway || 0) - Number(r.amount_beta || 0),
    }));

    sendOk(res, {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  })
);

/**
 * POST /admin/recon/run
 * Kích hoạt đối soát thủ công ngay lập tức và ghi nhận vào audit_log.
 * Quyền: IT, ACCOUNTANT, MANAGER.
 */
router.post(
  '/recon/run',
  requireStaff('IT', 'ACCOUNTANT', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { runRecon } = require('../services/reconService');
    const result = await runRecon('MANUAL');

    // Ghi nhận vào audit_log
    await knex('audit_log').insert({
      at: clock.nowIso(),
      actor_type: 'STAFF',
      actor_id: String(req.user.id),
      action: 'MANUAL_RECON_RUN',
      entity: 'RECON_RUN',
      entity_id: result && result.runId ? String(result.runId) : 'UNKNOWN',
      after_json: JSON.stringify({
        trigger: 'MANUAL',
        scanned: result?.scanned || 0,
        matched: result?.matched || 0,
        mismatched: result?.mismatched || 0,
        auto_refunds: result?.autoRefunds || 0,
        flagged: result?.flagged || 0,
        status: result?.status || 'DONE',
      }),
    });

    sendOk(res, result);
  })
);

/**
 * GET /admin/settings
 * Lấy cấu hình hệ thống (quyền: IT, MANAGER).
 */
router.get(
  '/settings',
  requireStaff('IT', 'MANAGER'),
  asyncHandler(async (_req, res) => {
    const rows = await knex('settings').select('key', 'value');
    const settings = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }
    sendOk(res, settings);
  })
);

/**
 * PATCH /admin/settings
 * Cập nhật cấu hình hệ thống và ghi nhận vào audit_log (quyền: IT, MANAGER).
 */
router.patch(
  '/settings',
  requireStaff('IT', 'MANAGER'),
  validate({ body: updateSettingsSchema }),
  asyncHandler(async (req, res) => {
    const updates = { ...req.body };
    if (updates.timeout !== undefined && updates.callbackTimeoutSec === undefined) {
      updates.callbackTimeoutSec = updates.timeout;
      delete updates.timeout;
    }
    const nowIso = clock.nowIso();

    const result = await knex.transaction(async (trx) => {
      // 1. Đọc settings trước khi cập nhật
      const currentRows = await trx('settings').select('key', 'value');
      const beforeSettings = {};
      for (const r of currentRows) {
        beforeSettings[r.key] = r.value;
      }

      // 2. Cập nhật các settings mới
      for (const [key, val] of Object.entries(updates)) {
        await trx('settings')
          .insert({
            key,
            value: String(val),
            updated_at: nowIso,
          })
          .onConflict('key')
          .merge();
      }

      // 3. Đọc settings sau khi cập nhật
      const afterRows = await trx('settings').select('key', 'value');
      const afterSettings = {};
      for (const r of afterRows) {
        afterSettings[r.key] = r.value;
      }

      // 4. Ghi audit_log kèm giá trị cũ và mới
      await trx('audit_log').insert({
        at: nowIso,
        actor_type: 'USER',
        actor_id: String(req.user.id),
        action: 'UPDATE_SETTINGS',
        entity: 'SETTINGS',
        entity_id: 'SYSTEM',
        before_json: JSON.stringify(beforeSettings),
        after_json: JSON.stringify(afterSettings),
      });

      return afterSettings;
    });

    sendOk(res, result);
  })
);

/**
 * GET /admin/tickets
 * Danh sách support tickets kèm thông tin đơn hàng và lệnh hoàn tiền (quyền: CSKH, MANAGER).
 */
router.get(
  '/tickets',
  requireStaff('CSKH', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { status, source, orderId } = req.query;

    let query = knex('support_tickets as st')
      .leftJoin('orders as o', 'st.order_id', 'o.order_id')
      .leftJoin('refunds as rf', 'st.order_id', 'rf.order_id')
      .select(
        'st.*',
        'o.customer_name',
        'o.customer_phone',
        'o.customer_email',
        'o.amount_total',
        'o.status as order_status',
        'rf.refund_id',
        'rf.status as refund_status',
        'rf.amount as refund_amount'
      )
      .orderBy('st.created_at', 'desc');

    if (status) {
      query = query.where('st.status', status);
    }
    if (source) {
      query = query.where('st.source', source);
    }
    if (orderId) {
      query = query.where('st.order_id', orderId);
    }

    const tickets = await query;
    sendOk(res, tickets);
  })
);

/**
 * GET /admin/tickets/:id
 * Chi tiết support ticket kèm danh sách ghi chú nội bộ và liên kết đơn/hoàn tiền (quyền: CSKH, MANAGER).
 */
router.get(
  '/tickets/:id',
  requireStaff('CSKH', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const ticket = await knex('support_tickets as st')
      .leftJoin('orders as o', 'st.order_id', 'o.order_id')
      .leftJoin('refunds as rf', 'st.order_id', 'rf.order_id')
      .where({ 'st.ticket_id': req.params.id })
      .select(
        'st.*',
        'o.customer_name',
        'o.customer_phone',
        'o.customer_email',
        'o.amount_total',
        'o.status as order_status',
        'rf.refund_id',
        'rf.status as refund_status',
        'rf.amount as refund_amount'
      )
      .first();

    if (!ticket) {
      throw new AppError('NOT_FOUND');
    }

    const notes = await knex('support_ticket_notes as stn')
      .leftJoin('users as u', 'stn.author_id', 'u.id')
      .where({ 'stn.ticket_id': req.params.id })
      .select('stn.*', 'u.full_name as author_name', 'u.role as author_role')
      .orderBy('stn.created_at', 'asc');

    sendOk(res, { ticket, notes });
  })
);

const TICKET_TRANSITIONS = Object.freeze({
  NEW: ['IN_REVIEW', 'REJECTED'],
  IN_REVIEW: ['WAITING_REFUND', 'RESOLVED', 'REJECTED'],
  WAITING_REFUND: ['RESOLVED', 'REJECTED'],
  RESOLVED: [],
  REJECTED: [],
});

/**
 * PATCH /admin/tickets/:id
 * Cập nhật support ticket theo đúng luồng chuyển trạng thái, ghi nhận ghi chú nội bộ và gửi phản hồi khách (quyền: CSKH, MANAGER).
 */
router.patch(
  '/tickets/:id',
  requireStaff('CSKH', 'MANAGER'),
  validate({ body: updateTicketSchema }),
  asyncHandler(async (req, res) => {
    const ticketId = req.params.id;
    const { status, assigned_to, resolution, note } = req.body;

    const result = await knex.transaction(async (trx) => {
      const ticket = await trx('support_tickets').where({ ticket_id: ticketId }).first();
      if (!ticket) {
        throw new AppError('NOT_FOUND');
      }

      // Kiểm tra luồng chuyển đổi trạng thái hợp lệ
      if (status !== undefined && status !== ticket.status) {
        const allowedNext = TICKET_TRANSITIONS[ticket.status] || [];
        if (!allowedNext.includes(status)) {
          throw new AppError(
            'VALIDATION_ERROR',
            400,
            `Không thể chuyển trạng thái ticket từ "${ticket.status}" sang "${status}". Luồng hợp lệ: ${allowedNext.join(', ') || 'Không thể chuyển tiếp'}`
          );
        }
      }

      const updates = {};
      if (status !== undefined) updates.status = status;
      if (assigned_to !== undefined) updates.assigned_to = assigned_to;
      if (resolution !== undefined) updates.resolution = resolution;

      if (status === 'RESOLVED' && !ticket.resolved_at) {
        updates.resolved_at = clock.nowIso();
      }

      if (Object.keys(updates).length > 0) {
        await trx('support_tickets').where({ ticket_id: ticketId }).update(updates);
      }

      // Ghi chú nội bộ nếu có
      if (note && note.trim()) {
        await trx('support_ticket_notes').insert({
          ticket_id: ticketId,
          author_id: req.user.id,
          note: note.trim(),
          created_at: clock.nowIso(),
        });
      }

      // Gửi thông báo phản hồi đến khách hàng nếu có cập nhật resolution
      if (resolution && resolution.trim() && (ticket.user_id || ticket.order_id)) {
        let recipientUserId = ticket.user_id;
        if (!recipientUserId && ticket.order_id) {
          const ord = await trx('orders').where({ order_id: ticket.order_id }).first();
          recipientUserId = ord?.user_id;
        }
        if (recipientUserId) {
          await trx('notifications').insert({
            user_id: recipientUserId,
            order_id: ticket.order_id || null,
            channel: 'WEB',
            title: `Phản hồi khiếu nại #${ticketId}`,
            body: `CSKH phản hồi: ${resolution.trim()} (Trạng thái: ${status || ticket.status})`,
            status: 'SENT',
            scheduled_at: clock.nowIso(),
            sent_at: clock.nowIso(),
          });
        }
      }

      // Ghi audit_log nếu có chuyển trạng thái
      if (status !== undefined && status !== ticket.status) {
        await trx('audit_log').insert({
          at: clock.nowIso(),
          actor_type: 'STAFF',
          actor_id: String(req.user.id),
          action: 'TICKET_STATUS_CHANGE',
          entity: 'SUPPORT_TICKET',
          entity_id: String(ticketId),
          before_json: JSON.stringify({ status: ticket.status }),
          after_json: JSON.stringify({ status, resolution, note }),
        });
      }

      const updatedTicket = await trx('support_tickets').where({ ticket_id: ticketId }).first();
      const notes = await trx('support_ticket_notes')
        .where({ ticket_id: ticketId })
        .orderBy('created_at', 'asc');

      return {
        ticket: updatedTicket,
        notes,
      };
    });

    sendOk(res, result);
  })
);

/**
 * GET /admin/audit-logs
 * Xem và lọc nhật ký hoạt động hệ thống theo người, hành động, thời gian (quyền: IT, MANAGER).
 */
router.get(
  '/audit-logs',
  requireStaff('IT', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const {
      actorId,
      actor_id,
      actorType,
      actor_type,
      action,
      entity,
      from,
      to,
      search,
      page,
      limit = 50,
      offset = 0,
    } = req.query;

    const finalActorId = actorId || actor_id;
    const finalActorType = actorType || actor_type;

    let query = knex('audit_log as al')
      .leftJoin('users as u', knex.raw('CAST(al.actor_id AS INTEGER)'), 'u.id')
      .select(
        'al.*',
        'u.full_name as actor_name',
        'u.email as actor_email',
        'u.role as actor_role'
      );

    if (finalActorId) {
      query = query.where('al.actor_id', String(finalActorId));
    }
    if (finalActorType) {
      query = query.where('al.actor_type', finalActorType);
    }
    if (action && action !== 'ALL') {
      query = query.where('al.action', action);
    }
    if (entity && entity !== 'ALL') {
      query = query.where('al.entity', entity);
    }
    if (from) {
      query = query.whereRaw('SUBSTR(al.at, 1, 10) >= ?', [String(from).slice(0, 10)]);
    }
    if (to) {
      query = query.whereRaw('SUBSTR(al.at, 1, 10) <= ?', [String(to).slice(0, 10)]);
    }
    if (search) {
      const q = `%${search.trim()}%`;
      query = query.where(function () {
        this.where('al.action', 'like', q)
          .orWhere('al.entity', 'like', q)
          .orWhere('al.entity_id', 'like', q)
          .orWhere('al.actor_id', 'like', q)
          .orWhere('u.full_name', 'like', q)
          .orWhere('u.email', 'like', q)
          .orWhere('al.after_json', 'like', q);
      });
    }

    if (page) {
      const countRow = await query.clone().count('al.id as count').first();
      const total = Number(countRow?.count || 0);
      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Math.min(Number(limit) || 20, 100));
      const pageOffset = (pageNum - 1) * limitNum;

      const items = await query
        .clone()
        .orderBy('al.at', 'desc')
        .limit(limitNum)
        .offset(pageOffset);

      return sendOk(res, {
        items,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum) || 1,
        },
      });
    }

    const logs = await query
      .clone()
      .orderBy('al.at', 'desc')
      .limit(Math.min(Number(limit) || 50, 100))
      .offset(Number(offset) || 0);

    sendOk(res, logs);
  })
);

module.exports = router;
module.exports.getRevenueReportData = getRevenueReportData;
module.exports.getReconciliationReportData = getReconciliationReportData;
module.exports.getRefundsReportData = getRefundsReportData;
module.exports.getTicketsReportData = getTicketsReportData;
module.exports.getOccupancyReportData = getOccupancyReportData;
