'use strict';

const knex = require('../db/knex');
const clock = require('../lib/clock');
const { AppError } = require('../lib/errors');

/**
 * Ghi nhận thông báo đa kênh vào bảng notifications theo thứ tự:
 * WEB -> EMAIL -> SMS (thực thi BR-09).
 *
 * Hỗ trợ các mốc sự kiện:
 * - PENDING_VERIFY: "Đang xử lý"
 * - PAID: Đặt vé thành công
 * - FAILED: "Thất bại - đã tạo lệnh hoàn" (nếu có refund) hoặc "Thanh toán thất bại"
 * - REFUND_SENT / SENT: "Đã gửi lệnh hoàn tiền"
 * - REFUND_COMPLETED / COMPLETED: "Hoàn tiền thành công"
 *
 * @param {import('knex').Knex|import('knex').Knex.Transaction} trx
 * @param {object} order - Bản ghi đơn hàng từ bảng orders
 * @param {'PENDING_VERIFY'|'PAID'|'FAILED'|'REFUND_SENT'|'SENT'|'REFUND_COMPLETED'|'COMPLETED'} event
 * @param {object} [extra={}]
 * @param {object} [extra.refund] - Bản ghi refund kèm theo nếu có
 * @returns {Promise<Array<object>>} Danh sách bản ghi thông báo đã được chèn
 */
async function notify(trx, order, event, extra = {}) {
  if (!order || !order.user_id) {
    return [];
  }

  let title = '';
  let body = '';
  const nowIso = clock.nowIso();
  const orderId = order.order_id;
  const amountStr = Number(order.amount_total || 0).toLocaleString('vi-VN');

  switch (event) {
    case 'PENDING_VERIFY': {
      title = 'Đang xử lý';
      body = `Giao dịch đơn hàng ${orderId} đang được xác thực, vui lòng chờ trong giây lát. Ghế của bạn đang được giữ an toàn.`;
      break;
    }

    case 'PAID': {
      title = 'Đặt vé thành công';
      body = `Đơn hàng ${orderId} đã thanh toán thành công ${amountStr} đ. Vé xem phim của bạn đã được xuất trong mục Vé của tôi.`;
      break;
    }

    case 'FAILED': {
      // Kiểm tra xem đơn hàng đã có lệnh refund hay chưa
      let refund = extra.refund;
      if (!refund) {
        refund = await trx('refunds')
          .where({ order_id: orderId })
          .whereNot('status', 'REJECTED')
          .first();
      }

      if (refund) {
        const refundAmountStr = Number(refund.amount || order.amount_total).toLocaleString('vi-VN');
        title = 'Thất bại - đã tạo lệnh hoàn';
        body = `Giao dịch mua vé ${orderId} của bạn đã thất bại. Hệ thống đối soát đã tự động tạo lệnh hoàn lại ${refundAmountStr} đ vào tài khoản của bạn.`;
      } else {
        title = 'Thanh toán thất bại';
        body = `Đơn hàng ${orderId} thanh toán không thành công. Ghế giữ chỗ đã được nhả lại cho các khách hàng khác.`;
      }
      break;
    }

    case 'REFUND_SENT':
    case 'SENT': {
      title = 'Đã gửi lệnh hoàn tiền';
      body = `Lệnh hoàn tiền cho đơn hàng ${orderId} trị giá ${amountStr} đ đã được gửi sang cổng thanh toán và ngân hàng tiếp nhận xử lý.`;
      break;
    }

    case 'REFUND_COMPLETED':
    case 'COMPLETED': {
      title = 'Hoàn tiền thành công';
      body = `Số tiền ${amountStr} đ của đơn hàng ${orderId} đã được hoàn tất chuyển về tài khoản/thẻ của bạn.`;
      break;
    }

    default:
      return [];
  }

  const channels = ['WEB', 'EMAIL', 'SMS'];
  const createdRecords = [];

  for (const channel of channels) {
    const [insertedId] = await trx('notifications').insert({
      order_id: orderId,
      user_id: order.user_id,
      channel,
      title,
      body,
      status: 'SENT',
      scheduled_at: nowIso,
      sent_at: nowIso,
      read_at: null,
    });

    createdRecords.push({
      id: insertedId,
      order_id: orderId,
      user_id: order.user_id,
      channel,
      title,
      body,
    });
  }

  return createdRecords;
}

/**
 * Lấy danh sách thông báo của người dùng.
 * @param {number} userId
 * @returns {Promise<Array<object>>}
 */
async function getNotifications(userId) {
  return await knex('notifications')
    .where({ user_id: userId })
    .orderBy('id', 'desc');
}

/**
 * Đánh dấu một thông báo là đã đọc.
 * @param {number} notificationId
 * @param {number} userId
 * @returns {Promise<object>}
 */
async function markAsRead(notificationId, userId) {
  const notif = await knex('notifications')
    .where({ id: notificationId })
    .first();

  if (!notif || Number(notif.user_id) !== Number(userId)) {
    throw new AppError('NOT_FOUND');
  }

  const readAt = clock.nowIso();
  await knex('notifications')
    .where({ id: notificationId })
    .update({ read_at: readAt });

  return {
    ...notif,
    read_at: readAt,
  };
}

module.exports = {
  notify,
  getNotifications,
  markAsRead,
};
