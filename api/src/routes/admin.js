'use strict';

const express = require('express');
const { z } = require('zod');
const knex = require('../db/knex');
const clock = require('../lib/clock');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, sendOk } = require('../lib/http');
const { AppError } = require('../lib/errors');

const router = express.Router();

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
  holdMinutes: z.number().int().min(1).optional(),
  pendingVerifyHoldMin: z.number().int().min(1).optional(),
  refundSendDelayMin: z.number().int().min(0).optional(),
  clock_offset_ms: z.number().int().optional(),
});

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
  requireAuth,
  requireRole('ACCOUNTANT', 'MANAGER'),
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
  requireAuth,
  requireRole('ACCOUNTANT', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const report = await getReconciliationReportData(from, to);
    sendOk(res, report);
  })
);

/**
 * GET /admin/refunds
 * Danh sách các lệnh hoàn tiền (quyền: CSKH, ACCOUNTANT, MANAGER).
 */
router.get(
  '/refunds',
  requireAuth,
  requireRole('CSKH', 'ACCOUNTANT', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { status, orderId } = req.query;

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

    const refunds = await query;
    sendOk(res, refunds);
  })
);

/**
 * POST /admin/refunds/:id/approve
 * Phê duyệt và thực thi lệnh hoàn tiền ngay lập tức (quyền: CSKH, ACCOUNTANT, MANAGER).
 */
router.post(
  '/refunds/:id/approve',
  requireAuth,
  requireRole('CSKH', 'ACCOUNTANT', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const refundId = req.params.id;
    const refund = await knex('refunds').where({ refund_id: refundId }).first();

    if (!refund) {
      throw new AppError('NOT_FOUND');
    }

    if (refund.status === 'COMPLETED') {
      return sendOk(res, refund);
    }

    // Thực thi hoàn tiền ngay lập tức
    const { processRefundQueue } = require('../services/refundService');
    await processRefundQueue({
      targetRefundId: refundId,
      completeImmediately: true,
      advanceBankProcessing: true,
    });

    const updatedRefund = await knex('refunds').where({ refund_id: refundId }).first();
    sendOk(res, updatedRefund);
  })
);

/**
 * POST /admin/recon/run
 * Kích hoạt đối soát thủ công ngay lập tức (quyền: IT, MANAGER).
 */
router.post(
  '/recon/run',
  requireAuth,
  requireRole('IT', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { runRecon } = require('../services/reconService');
    const result = await runRecon('MANUAL');
    sendOk(res, result);
  })
);

/**
 * PATCH /admin/settings
 * Cập nhật cấu hình hệ thống và ghi nhận vào audit_log (quyền: IT, MANAGER).
 */
router.patch(
  '/settings',
  requireAuth,
  requireRole('IT', 'MANAGER'),
  validate({ body: updateSettingsSchema }),
  asyncHandler(async (req, res) => {
    const updates = req.body;
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

      // 4. Ghi audit_log
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
 * Danh sách support tickets (quyền: CSKH, MANAGER).
 */
router.get(
  '/tickets',
  requireAuth,
  requireRole('CSKH', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { status, source, orderId } = req.query;

    let query = knex('support_tickets as st')
      .leftJoin('orders as o', 'st.order_id', 'o.order_id')
      .select(
        'st.*',
        'o.customer_name',
        'o.customer_phone',
        'o.customer_email',
        'o.amount_total',
        'o.status as order_status'
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
 * PATCH /admin/tickets/:id
 * Cập nhật support ticket và ghi nhận ghi chú vào support_ticket_notes (quyền: CSKH, MANAGER).
 */
router.patch(
  '/tickets/:id',
  requireAuth,
  requireRole('CSKH', 'MANAGER'),
  validate({ body: updateTicketSchema }),
  asyncHandler(async (req, res) => {
    const ticketId = req.params.id;
    const { status, assigned_to, resolution, note } = req.body;

    const result = await knex.transaction(async (trx) => {
      const ticket = await trx('support_tickets').where({ ticket_id: ticketId }).first();
      if (!ticket) {
        throw new AppError('NOT_FOUND');
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

      // Ghi chú nếu có
      if (note && note.trim()) {
        await trx('support_ticket_notes').insert({
          ticket_id: ticketId,
          author_id: req.user.id,
          note: note.trim(),
          created_at: clock.nowIso(),
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

module.exports = router;
