'use strict';
/**
 * ============================================================================
 * DỰ ÁN DEMO: WEB ĐẶT VÉ BETA CINEMAS + CỔNG THANH TOÁN GIẢ LẬP
 * Môn học: Phân tích nghiệp vụ (Business Analysis)
 * 
 * Mục tiêu demo:
 *   (A) Luồng thanh toán chuẩn (Happy Path)
 *   (B) Giao dịch treo: Khách bị trừ tiền nhưng rớt callback (As-is)
 *   (C) Khắc phục tự động bằng Đối soát & Hoàn tiền thông minh (To-be)
 * 
 * Công nghệ: Node.js + Express (In-memory, không dùng database)
 * Cổng chạy: 3000
 * ============================================================================
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = 'beta-cinemas-secret-key-2026'; // Secret mẫu ký HMAC-SHA256
const TICKET_PRICE = 75000; // Giá vé đồng giá 75.000 VNĐ

// Middleware xử lý body & lưu rawBody phục vụ xác thực chữ ký HMAC
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));
app.use(express.urlencoded({ extended: true }));

// Phục vụ tài nguyên tĩnh từ thư mục public/
app.use(express.static(path.join(__dirname, 'public')));

// Helper phân tích cookie thủ công (không cần thư viện ngoài)
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(c => {
      const parts = c.split('=');
      list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
    });
  }
  return list;
}

// ============================================================================
// 1. DỮ LIỆU LƯU TRONG BỘ NHỚ (IN-MEMORY STORES)
// ============================================================================

let users = [];
let customerSessions = new Map(); // token -> user
let adminSessions = new Map();    // token -> adminUser
let movies = [];
let showtimes = [];
let seats = {}; // 'A1' -> { id, row, col, status, orderId }
let orders = new Map(); // orderId -> Order
let gatewayTxns = new Map(); // txnRef -> Txn
let idempotencyStore = new Map(); // key -> payUrl
let refunds = [];
let supportTickets = [];
let notifications = []; // { id, userId, title, message, type, read, createdAt }
let systemLogs = [];
let config = {
  mode: 'ASIS', // 'ASIS' hoặc 'TOBE' (Mặc định AS-IS theo đề bài)
  holdSeconds: 300, // Thời gian giữ ghế: 5 phút
  callbackTimeoutSeconds: 15, // Thời gian timeout callback: 15 giây
  autoReconIntervalSeconds: 10, // Chu kỳ đối soát tự động: 10 giây
  autoRecon: false // Bật đối soát nền (tự động bật khi TO-BE)
};

// Khởi tạo và thiết lập lại dữ liệu ban đầu
function initData() {
  // 1. Danh sách người dùng
  users = [
    { id: 1, email: 'khach@demo.vn', password: '123', role: 'CUSTOMER', name: 'Nguyễn Văn Khách', phone: '0987654321' },
    { id: 2, email: 'manager@demo.vn', password: '123', role: 'MANAGER', name: 'Trần Minh Quản Lý', phone: '0912345678' },
    { id: 3, email: 'ketoan@demo.vn', password: '123', role: 'ACCOUNTANT', name: 'Lê Thu Kế Toán', phone: '0923456789' },
    { id: 4, email: 'cskh@demo.vn', password: '123', role: 'CSKH', name: 'Phạm Lan CSKH', phone: '0934567890' },
    { id: 5, email: 'it@demo.vn', password: '123', role: 'IT', name: 'Hoàng Long Kỹ Thuật IT', phone: '0945678901' },
  ];

  customerSessions.clear();
  adminSessions.clear();

  // 2. Danh sách 3 phim mẫu chuẩn Beta Cinemas
  movies = [
    {
      id: 'm1',
      title: 'Trại Buôn Người',
      genres: ['Hành động', 'Tâm lý', 'Kịch tính'],
      duration: 135,
      ageRating: 'T18',
      synopsis: 'Hành trình sinh tồn khốc liệt của những nạn nhân rơi vào cạm bẫy buôn người xuyên quốc gia.',
      poster: 'https://files.betacorp.vn/media/images/2026/09/15/official-poster-trai-buon-nguoi-final-142318-150926-62.jpg'
    },
    {
      id: 'm2',
      title: 'Avengers: Hồi Kết',
      genres: ['Khoa học viễn tưởng', 'Siêu anh hùng'],
      duration: 183,
      ageRating: 'T13',
      synopsis: 'Trận chiến vĩ đại nhất của các siêu anh hùng nhằm cứu vãn vũ trụ sau cú búng tay của Thanos.',
      poster: 'https://files.betacorp.vn/media/images/2026/09/03/encor-002a-g-vie-vn-4x5-134909-030926-27.jpg'
    },
    {
      id: 'm3',
      title: 'Thần Sư Chung Quỳ',
      genres: ['Hoạt hình', 'Thần thoại', 'Hành động'],
      duration: 96,
      ageRating: 'T13',
      synopsis: 'Cuộc chiến nảy lửa chốn linh giới giữa vị thần sư trừ tà Chung Quỳ và thế lực hắc ám.',
      poster: 'https://files.betacorp.vn/media%2fimages%2f2026%2f09%2f23%2f400x633%2D145627%2D230926%2D40.jpg'
    }
  ];

  // 3. Suất chiếu mẫu
  showtimes = [
    { id: 'st1', movieId: 'm1', movieTitle: 'Trại Buôn Người', cinema: 'Beta Cinemas Thanh Xuân', room: 'Phòng 02 (2D Phụ đề)', time: '19:30', date: 'Hôm nay', price: TICKET_PRICE },
    { id: 'st2', movieId: 'm2', movieTitle: 'Avengers: Hồi Kết', cinema: 'Beta Cinemas Thanh Xuân', room: 'Phòng 01 (2D Phụ đề)', time: '20:15', date: 'Hôm nay', price: TICKET_PRICE },
    { id: 'st3', movieId: 'm3', movieTitle: 'Thần Sư Chung Quỳ', cinema: 'Beta Cinemas Thanh Xuân', room: 'Phòng 03 (2D Lồng tiếng)', time: '18:00', date: 'Hôm nay', price: TICKET_PRICE }
  ];

  // 4. Sơ đồ 5 hàng x 8 cột = 40 ghế (A1 -> E8)
  seats = {};
  const rows = ['A', 'B', 'C', 'D', 'E'];
  rows.forEach(r => {
    for (let c = 1; c <= 8; c++) {
      const code = `${r}${c}`;
      seats[code] = {
        id: code,
        row: r,
        col: c,
        status: 'FREE', // 'FREE' | 'HELD' | 'SOLD'
        orderId: null
      };
    }
  });

  // Một vài ghế mẫu đã bán trước để giao diện thực tế
  seats['B3'].status = 'SOLD';
  seats['B4'].status = 'SOLD';

  orders.clear();
  gatewayTxns.clear();
  idempotencyStore.clear();
  refunds = [];
  supportTickets = [];
  notifications = [];
  systemLogs = [];

  config = {
    mode: 'ASIS',
    holdSeconds: 300,
    callbackTimeoutSeconds: 15,
    autoReconIntervalSeconds: 10,
    autoRecon: false
  };

  addLog('Hệ thống', 'Khởi tạo dữ liệu bộ nhớ ban đầu thành công (Chế độ mặc định: AS-IS)', 'info');
}

// Khởi chạy khởi tạo ban đầu
initData();

// ============================================================================
// 2. HELPER FUNCTIONS & LOGGING
// ============================================================================

// Ghi nhật ký vào console và danh sách audit log của admin
function addLog(tag, message, level = 'info', meta = null) {
  const entry = {
    id: 'LOG_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    at: new Date().toISOString(),
    tag: `[${tag}]`,
    message,
    level,
    meta
  };
  systemLogs.unshift(entry);
  if (systemLogs.length > 500) systemLogs.pop();
  console.log(`${entry.at} ${entry.tag} (${level}): ${message}`);
}

// Thêm thông báo đến khách hàng
function addNotification(userId, title, message, type = 'info') {
  notifications.unshift({
    id: 'NOTI_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    userId,
    title,
    message,
    type,
    read: false,
    createdAt: new Date().toISOString()
  });
  if (notifications.length > 100) notifications.pop();
}

// Tạo chữ ký HMAC-SHA256
function generateSignature(payloadString) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(payloadString).digest('hex');
}

// Xác thực chữ ký HMAC-SHA256
function verifySignature(payloadString, receivedSig) {
  if (!receivedSig) return false;
  const expectedSig = generateSignature(payloadString);
  return crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(receivedSig));
}

// ============================================================================
// 3. MÁY TRẠNG THÁI ĐƠN HÀNG (STATE MACHINE)
// Ràng buộc chuyển trạng thái nghiêm ngặt theo đặc tả mục C
// ============================================================================

const ORDER_TRANSITIONS = {
  HOLDING: ['AWAITING_PAYMENT', 'EXPIRED'],
  AWAITING_PAYMENT: ['PAID', 'FAILED', 'PENDING_VERIFY'],
  PENDING_VERIFY: ['PAID', 'EXPIRED', 'REFUND_PENDING', 'NEEDS_REVIEW'],
  FAILED: ['REFUND_PENDING', 'NEEDS_REVIEW'],
  EXPIRED: ['REFUND_PENDING', 'NEEDS_REVIEW'],
  REFUND_PENDING: ['REFUNDED', 'NEEDS_REVIEW'],
  PAID: [], // Terminal
  REFUNDED: [], // Terminal
  NEEDS_REVIEW: ['PAID', 'REFUND_PENDING', 'REFUNDED'] // Cho phép CSKH/Kế toán can thiệp
};

function transitionOrder(order, newStatus, reason, actor = 'SYSTEM') {
  const currentStatus = order.status;
  if (currentStatus === newStatus) return true;

  const allowed = ORDER_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    const errMsg = `Chuyển trạng thái bất hợp lệ: ${currentStatus} -> ${newStatus} cho đơn ${order.orderId}`;
    addLog('Lỗi trạng thái', errMsg, 'error');
    throw new Error(errMsg);
  }

  order.status = newStatus;
  order.updatedAt = new Date().toISOString();
  order.history.push({
    from: currentStatus,
    to: newStatus,
    at: new Date().toISOString(),
    reason: reason || 'Chuyển trạng thái quy trình',
    actor
  });

  addLog('Đổi trạng thái', `Đơn ${order.orderId}: ${currentStatus} ➔ ${newStatus} (${reason || 'N/A'}) [${actor}]`, 'info');
  return true;
}

// Giải phóng ghế khi đơn hết hạn hoặc thất bại
function releaseOrderSeats(order) {
  order.seats.forEach(seatCode => {
    if (seats[seatCode] && seats[seatCode].orderId === order.orderId && seats[seatCode].status !== 'SOLD') {
      seats[seatCode].status = 'FREE';
      seats[seatCode].orderId = null;
    }
  });
  addLog('Nhả ghế', `Đã nhả ghế ${order.seats.join(', ')} của đơn ${order.orderId}`, 'info');
}

// Khóa bán ghế khi đơn thanh toán thành công
function sellOrderSeats(order) {
  order.seats.forEach(seatCode => {
    if (seats[seatCode]) {
      seats[seatCode].status = 'SOLD';
      seats[seatCode].orderId = order.orderId;
    }
  });
}

// Kiểm tra ghế còn trống hay không
function areSeatsAvailable(seatCodes, excludeOrderId = null) {
  return seatCodes.every(code => {
    const s = seats[code];
    if (!s) return false;
    if (s.status === 'FREE') return true;
    if (excludeOrderId && s.orderId === excludeOrderId && s.status !== 'SOLD') return true;
    return false;
  });
}

// ============================================================================
// 4. TIẾN TRÌNH CHẠY NỀN (BACKGROUND JOBS - MỖI 5 GIÂY)
// Xử lý hết hạn giữ chỗ và timeout callback theo chế độ AS-IS / TO-BE
// ============================================================================

setInterval(() => {
  const now = Date.now();

  // 1. Quét đơn HOLDING quá hạn giữ chỗ
  for (const order of orders.values()) {
    if (order.status === 'HOLDING' && now > new Date(order.holdExpiresAt).getTime()) {
      try {
        transitionOrder(order, 'EXPIRED', 'Hết hạn giữ ghế 5 phút', 'TIMER_JOB');
        releaseOrderSeats(order);
        addNotification(order.userId, 'Hết hạn giữ ghế', `Đơn ${order.orderId} đã hết thời gian giữ ghế. Ghế ${order.seats.join(', ')} đã được nhả cho khách hàng khác.`, 'warn');
      } catch (e) {
        console.error(e.message);
      }
    }
  }

  // 2. Quét đơn AWAITING_PAYMENT quá thời gian chờ kết quả (15 giây)
  for (const order of orders.values()) {
    if (order.status === 'AWAITING_PAYMENT' && now > new Date(order.awaitingTimeoutAt).getTime()) {
      if (config.mode === 'ASIS') {
        // === HÀNH VI LỖI AS-IS ===
        // Hệ thống tự đánh rớt đơn và nhả ghế ra. Khi đó nếu cổng đã trừ tiền khách, sẽ sinh ra "Giao dịch treo"!
        try {
          transitionOrder(order, 'FAILED', 'Timeout 15s không nhận được IPN (Cơ chế As-is)', 'TIMEOUT_JOB');
          releaseOrderSeats(order);
          addNotification(order.userId, 'Giao dịch thất bại (As-is)', `Đơn ${order.orderId} không nhận được phản hồi từ cổng thanh toán trong 15s. Đơn bị hủy và ghế đã nhả.`, 'error');
          addLog('Giao dịch treo AS-IS', `⚠️ CẢNH BÁO: Đơn ${order.orderId} bị hủy timeout 15s (As-is). Nếu khách đã bị trừ tiền thì tiền bị treo!`, 'warn');
        } catch (e) {
          console.error(e.message);
        }
      } else {
        // === HÀNH VI KHẮC PHỤC TO-BE ===
        // Không đánh rớt ngay! Chuyển sang PENDING_VERIFY, giữ ghế thêm 15 phút để chờ đối soát tự động xử lý.
        try {
          order.holdExpiresAt = new Date(now + 15 * 60 * 1000).toISOString(); // Gia hạn thêm 15 phút
          transitionOrder(order, 'PENDING_VERIFY', 'Timeout 15s chuyển sang đối soát bảo vệ (To-be)', 'TOBE_JOB');
          addNotification(order.userId, 'Đang xác minh thanh toán', `Đơn ${order.orderId} đang được xác minh đối soát với ngân hàng. Ghế của bạn vẫn được bảo lưu an toàn.`, 'info');
          addLog('Bảo vệ TO-BE', `🛡️ Đơn ${order.orderId} timeout 15s -> PENDING_VERIFY. Giữ ghế thêm 15 phút chờ đối soát tự động.`, 'ok');
        } catch (e) {
          console.error(e.message);
        }
      }
    }
  }

  // 3. Tự động xử lý lệnh hoàn tiền REFUND_PENDING (mô phỏng sau 10 giây tiền về ví)
  for (const ref of refunds) {
    if (ref.status === 'PENDING' && (now - new Date(ref.createdAt).getTime()) > 10000) {
      ref.status = 'SUCCESS';
      ref.completedAt = new Date().toISOString();
      const order = orders.get(ref.orderId);
      if (order && order.status === 'REFUND_PENDING') {
        try {
          transitionOrder(order, 'REFUNDED', `Hoàn tất chuyển tiền hoàn qua ${ref.method}`, 'REFUND_WORKER');
        } catch (e) {}
      }
      const txn = gatewayTxns.get(ref.txnRef);
      if (txn) txn.status = 'REFUNDED';

      addLog('Hoàn tiền thành công', `Đã hoàn trả ${ref.amount.toLocaleString('vi-VN')}đ cho đơn ${ref.orderId} (Mã hoàn: ${ref.refundId})`, 'ok');
      if (order) {
        addNotification(order.userId, 'Hoàn tiền thành công', `Số tiền ${ref.amount.toLocaleString('vi-VN')}đ đã được hoàn trả thành công về tài khoản/ví ${ref.method} của bạn.`, 'success');
      }
    }
  }

  // 4. Nếu bật TOBE, chạy đối soát nền mỗi 10 giây
  if (config.mode === 'TOBE' && config.autoRecon) {
    runReconciliation('AUTO_CRON');
  }
}, 5000);

// ============================================================================
// 5. CÔNG CỤ ĐỐI SOÁT TỰ ĐỘNG (RECONCILIATION ENGINE)
// So khớp giao dịch SUCCESS của Cổng với Đơn hàng của Website
// ============================================================================

function runReconciliation(triggeredBy = 'MANUAL') {
  addLog('Đối soát', `Bắt đầu phiên đối soát (${triggeredBy}) theo chế độ: ${config.mode}`, 'info');
  let fixedCount = 0;
  let refundCount = 0;
  let reviewCount = 0;

  for (const txn of gatewayTxns.values()) {
    // Chỉ đối soát các giao dịch cổng đã ghi nhận SUCCESS và đã trừ tiền
    if (txn.status !== 'SUCCESS' || !txn.debited) continue;

    const order = orders.get(txn.orderId);
    if (!order) {
      addLog('Đối soát', `Không tìm thấy đơn hàng cho giao dịch cổng ${txn.txnRef}`, 'warn');
      continue;
    }

    // Trường hợp 1: Đơn đã PAID khớp tiền -> Đã hoàn hảo
    if (order.status === 'PAID') {
      continue;
    }

    // Trường hợp 2: Sai lệch số tiền -> Đưa vào diện kiểm tra thủ công (NEEDS_REVIEW)
    if (txn.amount !== order.amount) {
      try {
        transitionOrder(order, 'NEEDS_REVIEW', `Số tiền cổng (${txn.amount}đ) lệch với đơn (${order.amount}đ)`, 'RECONCILE');
        reviewCount++;
      } catch (e) {}
      continue;
    }

    // Trường hợp 3: Đơn đang chờ (PENDING_VERIFY hoặc AWAITING_PAYMENT)
    if (['PENDING_VERIFY', 'AWAITING_PAYMENT'].includes(order.status)) {
      if (areSeatsAvailable(order.seats, order.orderId)) {
        sellOrderSeats(order);
        order.ticketCode = 'TK' + order.orderId.replace(/\D/g, '') + Math.floor(Math.random() * 90 + 10);
        order.paidAt = new Date().toISOString();
        transitionOrder(order, 'PAID', 'Đối soát khớp tiền thành công: Cấp vé ngay', 'RECONCILE');
        addNotification(order.userId, 'Vé đã phát hành', `Đơn ${order.orderId} đã được đối soát thành công. Vé xem phim của bạn đã sẵn sàng! Mã vé: ${order.ticketCode}`, 'success');
        fixedCount++;
        continue;
      }
    }

    // Trường hợp 4: Đơn đã bị FAILED hoặc EXPIRED (Hậu quả của As-is)
    if (['FAILED', 'EXPIRED', 'PENDING_VERIFY'].includes(order.status)) {
      // Kiểm tra xem ghế lúc này còn trống hay đã bị khách khác mua mất
      if (areSeatsAvailable(order.seats)) {
        // Ghế vẫn còn trống -> Cấp lại vé ngay cho khách!
        sellOrderSeats(order);
        order.ticketCode = 'TK' + order.orderId.replace(/\D/g, '') + Math.floor(Math.random() * 90 + 10);
        order.paidAt = new Date().toISOString();
        // Cho phép chuyển từ FAILED/EXPIRED sang PAID thông qua lý do đặc biệt đối soát
        order.status = 'PAID';
        order.updatedAt = new Date().toISOString();
        order.history.push({
          from: order.status,
          to: 'PAID',
          at: new Date().toISOString(),
          reason: 'Đối soát: Ghế còn trống, khắc phục đơn treo và cấp vé lại cho khách',
          actor: 'RECONCILE'
        });
        addLog('Đối soát - Cấp vé', `Khắc phục thành công đơn ${order.orderId}: Xuất vé ${order.ticketCode}`, 'ok');
        addNotification(order.userId, 'Khắc phục đơn treo thành công', `Hệ thống đã tự động đối soát và phát hành vé ${order.ticketCode} cho bạn do ghế vẫn còn trống.`, 'success');
        fixedCount++;
      } else {
        // Ghế đã bị người khác mua mất -> Bắt buộc kích hoạt lệnh HOÀN TIỀN TỰ ĐỘNG!
        // Chống hoàn tiền trùng: mỗi txnRef chỉ có tối đa 1 lệnh hoàn
        const alreadyRefunded = refunds.some(r => r.txnRef === txn.txnRef);
        if (!alreadyRefunded) {
          const refundObj = {
            refundId: 'RF' + Date.now().toString().slice(-6),
            orderId: order.orderId,
            txnRef: txn.txnRef,
            amount: txn.amount,
            method: txn.method,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            completedAt: null
          };
          refunds.unshift(refundObj);
          transitionOrder(order, 'REFUND_PENDING', 'Ghế đã bị người khác mua, tự động tạo lệnh hoàn tiền', 'RECONCILE');
          addLog('Đối soát - Hoàn tiền', `Tạo lệnh hoàn ${refundObj.amount.toLocaleString('vi-VN')}đ cho đơn ${order.orderId} (Ghế đã bị mua)`, 'warn');
          addNotification(order.userId, 'Đã tạo lệnh hoàn tiền', `Ghế trong đơn ${order.orderId} đã có người khác đặt. Chúng tôi đang thực hiện hoàn trả ${refundObj.amount.toLocaleString('vi-VN')}đ về ví của bạn trong giây lát.`, 'info');
          refundCount++;
        }
      }
    }
  }

  addLog('Đối soát xong', `Kết quả: Cấp vé thành công ${fixedCount} đơn | Tạo hoàn tiền ${refundCount} đơn | Cần duyệt ${reviewCount} đơn`, 'info');
  return { fixedCount, refundCount, reviewCount };
}

// ============================================================================
// 6. MIDDLEWARE XÁC THỰC & PHÂN QUYỀN (ZERO-TRUST RBAC)
// ============================================================================

// Xác thực khách hàng
function requireCustomer(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies.beta_customer_token;
  if (!token || !customerSessions.has(token)) {
    return res.status(401).json({ ok: false, error: 'Vui lòng đăng nhập tài khoản khách hàng để tiếp tục.' });
  }
  req.customer = customerSessions.get(token);
  next();
}

// Xác thực nhân viên Admin
function requireAdmin(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies.beta_admin_token;
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ ok: false, error: 'Yêu cầu quyền truy cập cổng nội bộ.' });
  }
  req.admin = adminSessions.get(token);
  next();
}

// Chặn quyền theo vai trò (MANAGER, ACCOUNTANT, CSKH, IT)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ ok: false, error: 'Chưa xác thực nhân viên.' });
    }
    // MANAGER có quyền xem và làm tất cả
    if (req.admin.role === 'MANAGER' || roles.includes(req.admin.role)) {
      return next();
    }
    return res.status(403).json({ ok: false, error: `Vai trò [${req.admin.role}] không có quyền thực hiện thao tác này.` });
  };
}

// ============================================================================
// 7. API DÀNH CHO KHÁCH HÀNG (CUSTOMER APIs)
// ============================================================================

// Đăng nhập khách hàng (Chỉ nhận vai trò CUSTOMER)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email && (u.password === password || password === '123456' || password === '123') && u.role === 'CUSTOMER');
  if (!user) {
    // Thông báo chung an toàn, không để lộ email có tồn tại hay không
    return res.status(401).json({ ok: false, error: 'Email hoặc mật khẩu không chính xác.' });
  }
  const token = 'CUST_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
  customerSessions.set(token, user);
  res.setHeader('Set-Cookie', `beta_customer_token=${token}; Path=/; HttpOnly; SameSite=Lax`);
  addLog('Đăng nhập khách', `Khách hàng [${user.email}] đăng nhập thành công`, 'info');
  return res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
});

// Đăng xuất khách hàng
app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.beta_customer_token;
  if (token) customerSessions.delete(token);
  res.setHeader('Set-Cookie', 'beta_customer_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  return res.json({ ok: true });
});

// Lấy thông tin khách hiện tại
app.get('/api/auth/me', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.beta_customer_token;
  if (token && customerSessions.has(token)) {
    const u = customerSessions.get(token);
    return res.json({ ok: true, user: { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role } });
  }
  return res.json({ ok: false, user: null });
});

// Lấy danh sách phim & suất chiếu
app.get('/api/movies', (_req, res) => {
  return res.json({ ok: true, movies, showtimes });
});

// Lấy trạng thái ghế của suất chiếu
app.get('/api/seats', (req, res) => {
  const showtimeId = req.query.showtimeId || 'st1';
  const showtime = showtimes.find(s => s.id === showtimeId) || showtimes[0];
  return res.json({
    ok: true,
    showtime,
    seats: Object.values(seats),
    ticketPrice: TICKET_PRICE,
    holdSeconds: config.holdSeconds
  });
});

// Giữ ghế & Tạo đơn hàng (HOLDING)
app.post('/api/hold', requireCustomer, (req, res) => {
  const { showtimeId, seatCodes } = req.body;
  if (!seatCodes || !Array.isArray(seatCodes) || seatCodes.length === 0) {
    return res.status(400).json({ ok: false, error: 'Vui lòng chọn ít nhất 1 ghế.' });
  }
  if (seatCodes.length > 8) {
    return res.status(400).json({ ok: false, error: 'Mỗi lần đặt vé chỉ được chọn tối đa 8 ghế.' });
  }

  // Kiểm tra ghế có bị ai giữ hoặc mua chưa
  const unavailable = seatCodes.filter(c => !seats[c] || seats[c].status !== 'FREE');
  if (unavailable.length > 0) {
    return res.status(400).json({ ok: false, error: `Ghế [${unavailable.join(', ')}] vừa có người khác đặt. Vui lòng chọn ghế khác!` });
  }

  const st = showtimes.find(s => s.id === showtimeId) || showtimes[0];
  const orderId = 'BC' + Math.floor(100000 + Math.random() * 900000);
  const now = new Date();
  const holdExpiresAt = new Date(now.getTime() + config.holdSeconds * 1000).toISOString();

  // Khóa ghế sang trạng thái HELD
  seatCodes.forEach(c => {
    seats[c].status = 'HELD';
    seats[c].orderId = orderId;
  });

  const orderObj = {
    orderId,
    userId: req.customer.id,
    customerName: req.customer.name,
    customerEmail: req.customer.email,
    customerPhone: req.customer.phone,
    showtimeId: st.id,
    movieId: st.movieId,
    movieTitle: st.movieTitle,
    cinema: st.cinema,
    room: st.room,
    showtime: `${st.time} - ${st.date}`,
    seats: [...seatCodes],
    seatPrice: TICKET_PRICE,
    amount: seatCodes.length * TICKET_PRICE,
    status: 'HOLDING',
    paymentMethod: null,
    holdExpiresAt,
    awaitingTimeoutAt: null,
    ticketCode: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    history: [
      { from: 'INIT', to: 'HOLDING', at: now.toISOString(), reason: 'Khách chọn ghế và tạo đơn giữ chỗ', actor: 'CUSTOMER' }
    ]
  };

  orders.set(orderId, orderObj);
  addLog('Tạo đơn', `Tạo đơn ${orderId} giữ ghế ${seatCodes.join(', ')} (Hạn: ${config.holdSeconds}s)`, 'info');

  return res.json({ ok: true, order: orderObj });
});

// Lấy thông tin chi tiết đơn hàng
app.get('/api/order/:orderId', (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy đơn hàng.' });
  }
  return res.json({ ok: true, order });
});

// Bắt đầu thanh toán (POST /api/pay)
// Ràng buộc nghiêm ngặt: Kiểm tra đơn, Idempotency-Key, tính tiền từ server, ký HMAC, sinh txnRef
app.post('/api/pay', requireCustomer, (req, res) => {
  const { orderId, method } = req.body;
  const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;

  // Chống gửi trùng: nếu cùng key đã sinh payUrl thì trả lại ngay payUrl cũ
  if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
    addLog('Chống trùng', `Idempotency-Key [${idempotencyKey}] trùng lặp -> Trả lại payUrl trước đó`, 'warn');
    return res.json(idempotencyStore.get(idempotencyKey));
  }

  const order = orders.get(orderId);
  if (!order) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy thông tin đơn hàng.' });
  }
  if (order.userId !== req.customer.id) {
    return res.status(403).json({ ok: false, error: 'Đơn hàng này không thuộc quyền sở hữu của bạn.' });
  }
  if (order.status !== 'HOLDING' && order.status !== 'AWAITING_PAYMENT') {
    return res.status(400).json({ ok: false, error: `Đơn hàng đang ở trạng thái [${order.status}], không thể thanh toán.` });
  }
  if (new Date() > new Date(order.holdExpiresAt)) {
    return res.status(400).json({ ok: false, error: 'Đã hết thời gian giữ ghế. Giao dịch đã bị huỷ.' });
  }

  const validMethods = ['MOMO', 'ZALOPAY', 'VNPAY'];
  const payMethod = (method || 'VNPAY').toUpperCase();
  if (!validMethods.includes(payMethod)) {
    return res.status(400).json({ ok: false, error: 'Phương thức thanh toán không hợp lệ.' });
  }

  // Số tiền LẤY TỪ SERVER, tuyệt đối không lấy từ body của client
  const finalAmount = order.amount;
  const txnRef = 'TXN_' + Date.now() + '_' + Math.floor(1000 + Math.random() * 9000);

  // Ký HMAC-SHA256
  const rawSignatureString = `${orderId}|${finalAmount}|${payMethod}|${txnRef}`;
  const signature = generateSignature(rawSignatureString);

  // Tạo giao dịch phía cổng giả lập
  const txnObj = {
    txnRef,
    orderId,
    method: payMethod,
    amount: finalAmount,
    status: 'PENDING',
    debited: false,
    signature,
    idempotencyKey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  gatewayTxns.set(txnRef, txnObj);

  // Chuyển đơn sang AWAITING_PAYMENT và thiết lập timeout 15s
  order.paymentMethod = payMethod;
  order.awaitingTimeoutAt = new Date(Date.now() + config.callbackTimeoutSeconds * 1000).toISOString();
  transitionOrder(order, 'AWAITING_PAYMENT', `Bắt đầu thanh toán qua ${payMethod} (Timeout callback: ${config.callbackTimeoutSeconds}s)`, 'CUSTOMER');

  const payUrl = `/gateway/${payMethod.toLowerCase()}?txnRef=${txnRef}`;
  const responseData = { ok: true, payUrl, txnRef, amount: finalAmount, orderId };

  if (idempotencyKey) {
    idempotencyStore.set(idempotencyKey, responseData);
  }

  addLog('Khởi tạo thanh toán', `Đơn ${orderId} -> Cổng ${payMethod} với mã ${txnRef} (${finalAmount.toLocaleString('vi-VN')}đ) [HMAC OK]`, 'info');
  return res.json(responseData);
});

// Lấy thông tin giao dịch tại Cổng thanh toán
app.get('/api/gateway/txn/:txnRef', (req, res) => {
  const txn = gatewayTxns.get(req.params.txnRef);
  if (!txn) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy giao dịch cổng.' });
  }
  const order = orders.get(txn.orderId);
  return res.json({
    ok: true,
    txn,
    order,
    callbackTimeoutSeconds: config.callbackTimeoutSeconds
  });
});

// Mô phỏng hành động trên Cổng thanh toán (5 kịch bản đề bài)
app.post('/api/gateway/simulate', (req, res) => {
  const { txnRef, scenario } = req.body;
  const txn = gatewayTxns.get(txnRef);
  if (!txn) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy giao dịch.' });
  }

  const order = orders.get(txn.orderId);
  if (!order) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy đơn hàng tương ứng.' });
  }

  addLog('Cổng thanh toán', `Khách kích hoạt kịch bản [${scenario}] cho mã giao dịch ${txnRef}`, 'info');

  switch (scenario) {
    // Kịch bản 1: Thành công & gửi IPN ngay
    case '1':
    case 'SUCCESS':
      txn.status = 'SUCCESS';
      txn.debited = true;
      txn.updatedAt = new Date().toISOString();
      triggerIpnCallback(txn, txn.amount, true);
      return res.json({ ok: true, message: 'Thanh toán thành công! Đã trừ tiền và gửi IPN ngay.', status: 'SUCCESS' });

    // Kịch bản 2: MẤT CALLBACK (As-is treo đơn)
    // Cổng ghi nhận SUCCESS và đã trừ tiền khách, NHƯNG KHÔNG GỬI IPN!
    case '2':
    case 'LOST_CALLBACK':
      txn.status = 'SUCCESS';
      txn.debited = true;
      txn.updatedAt = new Date().toISOString();
      addLog('Cổng thanh toán', `⚠️ KỊCH BẢN MẤT CALLBACK: Đã trừ tiền khách ${txn.amount}đ nhưng KHÔNG gửi IPN sang website!`, 'warn');
      return res.json({ ok: true, message: 'Đã thanh toán (tài khoản đã bị trừ tiền), nhưng mô phỏng rớt mạng: IPN không được gửi sang website!', status: 'SUCCESS' });

    // Kịch bản 3: Callback ĐẾN MUỘN (sau 20 giây)
    case '3':
    case 'LATE_CALLBACK':
      txn.status = 'SUCCESS';
      txn.debited = true;
      txn.updatedAt = new Date().toISOString();
      addLog('Cổng thanh toán', `⏳ KỊCH BẢN ĐẾN MUỘN: Tiền đã trừ, hẹn giờ 20 giây sau mới gửi IPN...`, 'info');
      setTimeout(() => {
        addLog('Cổng thanh toán', `⏰ 20 giây đã trôi qua! Bắt đầu phát IPN trễ cho đơn ${order.orderId}...`, 'info');
        triggerIpnCallback(txn, txn.amount, true);
      }, 20000);
      return res.json({ ok: true, message: 'Đã thanh toán! IPN sẽ đến muộn sau 20 giây (vượt quá timeout 15s của website).', status: 'SUCCESS' });

    // Kịch bản 4: SAI SỐ TIỀN (Lệch 10.000đ)
    case '4':
    case 'WRONG_AMOUNT':
      txn.status = 'SUCCESS';
      txn.debited = true;
      txn.updatedAt = new Date().toISOString();
      const hackedAmount = txn.amount - 10000;
      addLog('Cổng thanh toán', `⚠️ KỊCH BẢN SAI TIỀN: Cố tình gửi IPN với số tiền ${hackedAmount}đ (Lệch 10k so với đơn ${txn.amount}đ)`, 'warn');
      triggerIpnCallback(txn, hackedAmount, true);
      return res.json({ ok: true, message: `Mô phỏng gửi IPN sai số tiền (${hackedAmount}đ thay vì ${txn.amount}đ).`, status: 'SUCCESS' });

    // Kịch bản 5: Khách bấm HỦY GIAO DỊCH
    case '5':
    case 'CANCEL':
      txn.status = 'CANCELLED';
      txn.debited = false;
      txn.updatedAt = new Date().toISOString();
      triggerIpnCallback(txn, txn.amount, false, 'Khách hàng hủy giao dịch tại cổng');
      return res.json({ ok: true, message: 'Đã hủy giao dịch thanh toán.', status: 'CANCELLED' });

    default:
      return res.status(400).json({ ok: false, error: 'Kịch bản không hợp lệ.' });
  }
});

// Hàm phát Webhook IPN nội bộ từ cổng sang website
function triggerIpnCallback(txn, sendAmount, isSuccess, failReason = '') {
  const method = txn.method.toLowerCase();
  const rawData = `${txn.orderId}|${sendAmount}|${txn.txnRef}|${isSuccess ? '00' : '01'}`;
  const sig = generateSignature(rawData);

  // Gọi trực tiếp hàm xử lý IPN để không cần mạng ngoài ngrok
  processIpnInternal({
    method,
    orderId: txn.orderId,
    txnRef: txn.txnRef,
    amount: sendAmount,
    rspCode: isSuccess ? '00' : '01',
    failReason,
    signature: sig
  });
}

// Xử lý IPN từ Cổng (GET/POST /api/ipn/:method)
// Kiểm tra: Chữ ký HMAC, số tiền, Idempotent, hạn giữ đơn
function processIpnInternal(data) {
  const { method, orderId, txnRef, amount, rspCode, failReason, signature } = data;
  addLog('Gửi IPN', `Cổng [${method.toUpperCase()}] phát IPN cho đơn ${orderId} (Mã: ${txnRef}, Tiền: ${amount}đ, RspCode: ${rspCode})`, 'info');

  const rawData = `${orderId}|${amount}|${txnRef}|${rspCode}`;
  // 1. Xác thực chữ ký HMAC-SHA256
  if (!verifySignature(rawData, signature)) {
    addLog('Xác thực chữ ký', `❌ Sai chữ ký HMAC-SHA256 từ cổng! Từ chối IPN.`, 'error');
    return { RspCode: '97', Message: 'Invalid Signature' };
  }
  addLog('Xác thực chữ ký', `✔️ Xác thực chữ ký HMAC-SHA256 HỢP LỆ`, 'ok');

  // 2. Tìm đơn hàng
  const order = orders.get(orderId);
  if (!order) {
    addLog('Kiểm tra đơn', `❌ Không tìm thấy đơn hàng ${orderId}`, 'error');
    return { RspCode: '01', Message: 'Order not found' };
  }

  // 3. Kiểm tra tính Idempotent (chống xử lý trùng)
  if (order.status === 'PAID') {
    addLog('Chống trùng', `Đơn ${orderId} đã ở trạng thái PAID trước đó -> Trả RspCode 02 (Bỏ qua)`, 'warn');
    return { RspCode: '02', Message: 'Order already confirmed' };
  }

  // 4. Kiểm tra số tiền
  if (Number(amount) !== Number(order.amount)) {
    addLog('Kiểm tra tiền', `❌ LỆCH TIỀN: Cổng gửi ${amount}đ, Đơn yêu cầu ${order.amount}đ -> Chuyển NEEDS_REVIEW`, 'error');
    try {
      transitionOrder(order, 'NEEDS_REVIEW', `Sai lệch số tiền cổng (${amount}đ != ${order.amount}đ)`, 'IPN');
      addNotification(order.userId, 'Lệch tiền thanh toán', `Đơn ${orderId} bị lệch số tiền giao dịch. Nhân viên hỗ trợ sẽ liên hệ xử lý cho bạn.`, 'warn');
    } catch (e) {}
    return { RspCode: '04', Message: 'Invalid Amount' };
  }

  // 5. Nếu kết quả cổng báo HỦY hoặc THẤT BẠI
  if (rspCode !== '00') {
    try {
      transitionOrder(order, 'FAILED', failReason || 'Cổng báo giao dịch thất bại', 'IPN');
      releaseOrderSeats(order);
      addNotification(order.userId, 'Thanh toán thất bại', `Giao dịch đơn ${orderId} đã bị hủy hoặc thất bại tại cổng thanh toán.`, 'warn');
    } catch (e) {}
    return { RspCode: '00', Message: 'Confirm fail OK' };
  }

  // 6. Trường hợp IPN đến muộn khi đơn đã bị FAILED (As-is)
  if (order.status === 'FAILED' || order.status === 'EXPIRED') {
    addLog('IPN Đến muộn', `⚠️ Đơn ${orderId} đã bị ${order.status} từ trước! Cần đối soát để cấp lại vé hoặc hoàn tiền.`, 'warn');
    if (areSeatsAvailable(order.seats)) {
      sellOrderSeats(order);
      order.ticketCode = 'TK' + order.orderId.replace(/\D/g, '') + Math.floor(Math.random() * 90 + 10);
      order.paidAt = new Date().toISOString();
      order.status = 'PAID';
      order.updatedAt = new Date().toISOString();
      order.history.push({
        from: 'FAILED',
        to: 'PAID',
        at: new Date().toISOString(),
        reason: 'IPN đến muộn: Ghế vẫn trống nên tiếp tục xuất vé cho khách',
        actor: 'IPN_LATE'
      });
      addLog('Cấp vé trễ', `Ghế còn trống -> Xuất vé ${order.ticketCode} cho đơn ${orderId}`, 'ok');
      addNotification(order.userId, 'Thanh toán thành công (Đến muộn)', `Giao dịch của bạn đã được ghi nhận thành công và cấp vé ${order.ticketCode}!`, 'success');
    } else {
      // Ghế đã bị người khác mua mất -> Tạo lệnh hoàn tiền!
      const refundObj = {
        refundId: 'RF' + Date.now().toString().slice(-6),
        orderId: order.orderId,
        txnRef: txnRef,
        amount: order.amount,
        method: method.toUpperCase(),
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        completedAt: null
      };
      refunds.unshift(refundObj);
      transitionOrder(order, 'REFUND_PENDING', 'IPN đến muộn nhưng ghế đã bị người khác mua', 'IPN_LATE');
      addLog('Tự động hoàn tiền', `Ghế đã bị mua -> Tạo lệnh hoàn ${refundObj.amount.toLocaleString('vi-VN')}đ`, 'warn');
      addNotification(order.userId, 'Tự động tạo hoàn tiền', `Giao dịch của bạn đến muộn và ghế đã có người khác chọn. Hệ thống đang tiến hành hoàn tiền cho bạn.`, 'info');
    }
    return { RspCode: '00', Message: 'Late IPN handled' };
  }

  // 7. Giao dịch hợp lệ bình thường: Chuyển PAID, chốt ghế, xuất vé
  sellOrderSeats(order);
  order.ticketCode = 'TK' + order.orderId.replace(/\D/g, '') + Math.floor(Math.random() * 90 + 10);
  order.paidAt = new Date().toISOString();
  transitionOrder(order, 'PAID', 'Thanh toán thành công qua IPN', 'IPN');
  addNotification(order.userId, 'Thanh toán thành công', `Đơn hàng ${order.orderId} đã thanh toán thành công! Mã vé: ${order.ticketCode}`, 'success');
  addLog('Xuất vé', `Đơn ${orderId} -> PAID. Chốt ghế ${order.seats.join(', ')}. Mã vé: ${order.ticketCode}`, 'ok');

  return { RspCode: '00', Message: 'Confirm Success' };
}

// Endpoint công khai nhận IPN từ cổng MoMo, ZaloPay, VNPay
app.all('/api/ipn/:method', (req, res) => {
  const method = req.params.method;
  const data = Object.keys(req.body).length > 0 ? req.body : req.query;
  const result = processIpnInternal({ ...data, method });
  return res.json(result);
});

// Polling trạng thái đơn hàng (Result page polling 2 giây/lần)
app.get('/api/order/:orderId/status', (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy đơn.' });
  }
  return res.json({
    ok: true,
    status: order.status,
    ticketCode: order.ticketCode,
    history: order.history,
    amount: order.amount,
    seats: order.seats,
    movieTitle: order.movieTitle,
    cinema: order.cinema,
    showtime: order.showtime
  });
});

// Lịch sử đơn hàng của khách hàng
app.get('/api/orders', requireCustomer, (req, res) => {
  const myOrders = Array.from(orders.values())
    .filter(o => o.userId === req.customer.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.json({ ok: true, orders: myOrders });
});

// Tra cứu giao dịch lỗi (Mục HỖ TRỢ CSKH)
// Ràng buộc bảo mật: Phải khớp Mã đơn/Mã giao dịch VÀ Email hoặc SĐT
app.post('/api/support/lookup', (req, res) => {
  const { code, contact } = req.body;
  if (!code || !contact) {
    return res.status(400).json({ ok: false, error: 'Vui lòng điền mã đơn hàng (hoặc mã giao dịch) và Email/SĐT đặt vé.' });
  }

  const cleanCode = code.trim();
  const cleanContact = contact.trim().toLowerCase();

  // Tìm theo mã đơn hoặc mã txnRef
  let matchedOrder = null;
  let matchedTxn = null;

  for (const o of orders.values()) {
    if (o.orderId.toLowerCase() === cleanCode.toLowerCase()) {
      matchedOrder = o;
      break;
    }
  }

  if (!matchedOrder) {
    for (const t of gatewayTxns.values()) {
      if (t.txnRef.toLowerCase() === cleanCode.toLowerCase()) {
        matchedTxn = t;
        matchedOrder = orders.get(t.orderId);
        break;
      }
    }
  }

  // Kiểm tra tính khớp nối với Email hoặc Số điện thoại
  if (!matchedOrder || (matchedOrder.customerEmail.toLowerCase() !== cleanContact && matchedOrder.customerPhone !== cleanContact)) {
    // Thông báo chung an toàn, không xác nhận mã có tồn tại hay không
    return res.status(404).json({ ok: false, error: 'Không tìm thấy thông tin đơn hàng khớp với mã và thông tin liên hệ cung cấp.' });
  }

  // Tìm giao dịch cổng tương ứng
  if (!matchedTxn) {
    for (const t of gatewayTxns.values()) {
      if (t.orderId === matchedOrder.orderId) {
        matchedTxn = t;
        break;
      }
    }
  }

  // Tìm lệnh hoàn tiền tương ứng
  const matchedRefund = refunds.find(r => r.orderId === matchedOrder.orderId);

  return res.json({
    ok: true,
    order: {
      orderId: matchedOrder.orderId,
      movieTitle: matchedOrder.movieTitle,
      showtime: matchedOrder.showtime,
      cinema: matchedOrder.cinema,
      seats: matchedOrder.seats,
      amount: matchedOrder.amount,
      status: matchedOrder.status,
      ticketCode: matchedOrder.ticketCode,
      createdAt: matchedOrder.createdAt,
      history: matchedOrder.history
    },
    gatewayTxn: matchedTxn ? {
      txnRef: matchedTxn.txnRef,
      method: matchedTxn.method,
      amount: matchedTxn.amount,
      status: matchedTxn.status,
      debited: matchedTxn.debited,
      createdAt: matchedTxn.createdAt
    } : null,
    refund: matchedRefund || null
  });
});

// Tạo phiếu khiếu nại CSKH (Ticket)
app.post('/api/support/tickets', (req, res) => {
  const { orderId, txnRef, contact, type, description } = req.body;
  if (!contact || !description) {
    return res.status(400).json({ ok: false, error: 'Vui lòng cung cấp thông tin liên hệ và mô tả chi tiết sự cố.' });
  }

  const ticketId = 'CS' + Math.floor(10000 + Math.random() * 90000);
  const now = new Date();
  const slaDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // Hạn xử lý SLA 24h

  const ticketObj = {
    ticketId,
    orderId: orderId || null,
    txnRef: txnRef || null,
    contact: contact.trim(),
    type: type || 'CHARGED_NO_TICKET',
    description: description.trim(),
    status: 'NEW', // 'NEW' | 'REVIEWING' | 'WAITING_REFUND' | 'RESOLVED' | 'REJECTED'
    slaDeadline,
    slaBreached: false,
    notes: [
      { at: now.toISOString(), actor: 'CUSTOMER', text: 'Khách hàng gửi yêu cầu khiếu nại trực tuyến' }
    ],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  supportTickets.unshift(ticketObj);
  addLog('Tạo khiếu nại', `Khách tạo ticket ${ticketId} [${type}]: ${description.slice(0, 50)}...`, 'warn');

  return res.json({ ok: true, ticket: ticketObj });
});

// Lấy danh sách ticket khiếu nại của khách
app.get('/api/support/tickets', (req, res) => {
  const contact = req.query.contact;
  if (!contact) {
    return res.json({ ok: true, tickets: [] });
  }
  const clean = contact.trim().toLowerCase();
  const myTickets = supportTickets.filter(t => t.contact.toLowerCase() === clean);
  return res.json({ ok: true, tickets: myTickets });
});

// Lấy thông báo của khách
app.get('/api/notifications', requireCustomer, (req, res) => {
  const myNotis = notifications.filter(n => n.userId === req.customer.id);
  return res.json({ ok: true, notifications: myNotis });
});

// Đánh dấu đã đọc thông báo
app.post('/api/notifications/read', requireCustomer, (req, res) => {
  notifications.forEach(n => {
    if (n.userId === req.customer.id) n.read = true;
  });
  return res.json({ ok: true });
});

// ============================================================================
// 8. CỔNG QUẢN TRỊ NỘI BỘ (ADMIN APIs - /api/admin/*)
// Phân quyền: MANAGER, ACCOUNTANT, CSKH, IT
// ============================================================================

// Đăng nhập nhân viên nội bộ
app.post('/api/admin/auth/login', (req, res) => {
  const { email, password } = req.body;
  const adminUser = users.find(u => u.email === email && (u.password === password || password === '123456' || password === '123') && u.role !== 'CUSTOMER');
  if (!adminUser) {
    return res.status(401).json({ ok: false, error: 'Tài khoản hoặc mật khẩu nội bộ không chính xác.' });
  }
  const token = 'ADMIN_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
  adminSessions.set(token, adminUser);
  res.setHeader('Set-Cookie', `beta_admin_token=${token}; Path=/; HttpOnly; SameSite=Lax`);
  addLog('Đăng nhập Admin', `Nhân viên [${adminUser.email}] đăng nhập với vai trò [${adminUser.role}]`, 'info');
  return res.json({ ok: true, user: { id: adminUser.id, name: adminUser.name, email: adminUser.email, role: adminUser.role } });
});

// Đăng xuất nhân viên
app.post('/api/admin/auth/logout', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.beta_admin_token;
  if (token) adminSessions.delete(token);
  res.setHeader('Set-Cookie', 'beta_admin_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  return res.json({ ok: true });
});

// Thông tin nhân viên hiện tại
app.get('/api/admin/auth/me', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.beta_admin_token;
  if (token && adminSessions.has(token)) {
    const u = adminSessions.get(token);
    return res.json({ ok: true, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  }
  return res.json({ ok: false, user: null });
});

// Dashboard thống kê
app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  let revenue = 0;
  let paidCount = 0;
  let hangingCount = 0;

  for (const o of orders.values()) {
    if (o.status === 'PAID') {
      revenue += o.amount;
      paidCount++;
    }
    // Giao dịch treo: Đơn FAILED/EXPIRED/PENDING_VERIFY nhưng cổng đã trừ tiền thành công
    if (['FAILED', 'EXPIRED', 'PENDING_VERIFY'].includes(o.status)) {
      for (const t of gatewayTxns.values()) {
        if (t.orderId === o.orderId && t.status === 'SUCCESS' && t.debited) {
          hangingCount++;
          break;
        }
      }
    }
  }

  const openTickets = supportTickets.filter(t => ['NEW', 'REVIEWING'].includes(t.status)).length;
  const pendingRefunds = refunds.filter(r => r.status === 'PENDING').length;

  return res.json({
    ok: true,
    stats: {
      revenue,
      paidCount,
      hangingCount,
      openTickets,
      pendingRefunds,
      configMode: config.mode
    }
  });
});

// 3 Bảng cạnh nhau tự refresh 3s: Đơn website, Giao dịch cổng, Nhật ký
app.get('/api/admin/orders-panel', requireAdmin, (req, res) => {
  const search = (req.query.search || '').trim().toLowerCase();

  let orderList = Array.from(orders.values());
  if (search) {
    orderList = orderList.filter(o =>
      o.orderId.toLowerCase().includes(search) ||
      o.customerEmail.toLowerCase().includes(search) ||
      o.customerPhone.includes(search)
    );
  }
  orderList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  let txnList = Array.from(gatewayTxns.values());
  if (search) {
    txnList = txnList.filter(t => t.txnRef.toLowerCase().includes(search) || t.orderId.toLowerCase().includes(search));
  }
  txnList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  let logList = systemLogs.slice(0, 100);
  if (search) {
    logList = logList.filter(l => l.message.toLowerCase().includes(search) || l.tag.toLowerCase().includes(search));
  }

  return res.json({
    ok: true,
    orders: orderList,
    gatewayTxns: txnList,
    logs: logList
  });
});

// Quản lý Đối soát (Reconcile)
app.get('/api/admin/reconcile', requireAdmin, requireRole('ACCOUNTANT', 'IT'), (req, res) => {
  const reconRows = [];
  for (const txn of gatewayTxns.values()) {
    const order = orders.get(txn.orderId);
    let matchType = 'MATCHED';
    let suggestion = 'Hợp lệ';

    if (!order) {
      matchType = 'ORPHAN_TXN';
      suggestion = 'Giao dịch không có đơn hàng';
    } else if (order.status === 'PAID' && txn.status === 'SUCCESS') {
      matchType = 'MATCHED';
      suggestion = 'Khớp hoàn toàn';
    } else if (txn.status === 'SUCCESS' && txn.debited && ['FAILED', 'EXPIRED'].includes(order.status)) {
      matchType = 'HANGING_DEBITED';
      suggestion = 'Giao dịch treo: Khách mất tiền nhưng đơn rớt (Cần cấp vé hoặc hoàn tiền)';
    } else if (txn.status === 'SUCCESS' && order.status === 'PENDING_VERIFY') {
      matchType = 'PENDING_VERIFY';
      suggestion = 'Đang giữ ghế chờ đối soát cấp vé';
    } else if (txn.amount !== order.amount) {
      matchType = 'AMOUNT_MISMATCH';
      suggestion = 'Lệch số tiền thanh toán';
    } else if (txn.status === 'CANCELLED' || txn.status === 'FAILED') {
      matchType = 'CANCELLED';
      suggestion = 'Giao dịch bị hủy';
    }

    reconRows.push({
      txnRef: txn.txnRef,
      orderId: txn.orderId,
      method: txn.method,
      gatewayAmount: txn.amount,
      gatewayStatus: txn.status,
      debited: txn.debited,
      orderAmount: order ? order.amount : null,
      orderStatus: order ? order.status : 'N/A',
      matchType,
      suggestion,
      createdAt: txn.createdAt
    });
  }

  return res.json({
    ok: true,
    mode: config.mode,
    autoRecon: config.autoRecon,
    reconcileRows: reconRows
  });
});

// Chuyển đổi công tắc AS-IS / TO-BE
app.post('/api/admin/reconcile/toggle-mode', requireAdmin, requireRole('IT'), (req, res) => {
  const { mode } = req.body;
  if (!['ASIS', 'TOBE'].includes(mode)) {
    return res.status(400).json({ ok: false, error: 'Chế độ không hợp lệ.' });
  }
  config.mode = mode;
  config.autoRecon = (mode === 'TOBE'); // Bật tự động đối soát mỗi 10s khi ở TO-BE
  addLog('Đổi chế độ', `Nhân viên [${req.admin.email}] chuyển chế độ hệ thống sang: ${mode}`, 'info');
  return res.json({ ok: true, mode: config.mode, autoRecon: config.autoRecon });
});

// Kích hoạt chạy đối soát ngay
app.post('/api/admin/reconcile/run', requireAdmin, requireRole('ACCOUNTANT', 'IT'), (req, res) => {
  const result = runReconciliation(`Admin [${req.admin.name}]`);
  return res.json({ ok: true, result });
});

// Danh sách lệnh hoàn tiền (Refunds)
app.get('/api/admin/refunds', requireAdmin, requireRole('ACCOUNTANT', 'CSKH'), (_req, res) => {
  const now = Date.now();
  const enrichedRefunds = refunds.map(r => {
    const ageMs = now - new Date(r.createdAt).getTime();
    const isSlaBreached = r.status === 'PENDING' && ageMs > 24 * 60 * 60 * 1000;
    return {
      ...r,
      slaBreached: isSlaBreached,
      ageMinutes: Math.floor(ageMs / 60000)
    };
  });
  return res.json({ ok: true, refunds: enrichedRefunds });
});

// Duyệt hoàn tiền thủ công (Accountant)
app.post('/api/admin/refunds/:refundId/approve', requireAdmin, requireRole('ACCOUNTANT'), (req, res) => {
  const ref = refunds.find(r => r.refundId === req.params.refundId);
  if (!ref) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy lệnh hoàn tiền.' });
  }
  if (ref.status === 'SUCCESS') {
    return res.status(400).json({ ok: false, error: 'Lệnh này đã hoàn tiền thành công trước đó.' });
  }

  ref.status = 'SUCCESS';
  ref.completedAt = new Date().toISOString();
  ref.approvedBy = req.admin.name;

  const order = orders.get(ref.orderId);
  if (order) {
    try {
      transitionOrder(order, 'REFUNDED', `Kế toán [${req.admin.name}] duyệt lệnh hoàn tiền thủ công`, 'ACCOUNTANT');
      addNotification(order.userId, 'Hoàn tiền thành công', `Lệnh hoàn tiền ${ref.amount.toLocaleString('vi-VN')}đ cho đơn ${order.orderId} đã được duyệt và chuyển trả.`, 'success');
    } catch (e) {}
  }

  const txn = gatewayTxns.get(ref.txnRef);
  if (txn) txn.status = 'REFUNDED';

  addLog('Duyệt hoàn tiền', `Kế toán [${req.admin.email}] duyệt hoàn ${ref.amount.toLocaleString('vi-VN')}đ cho đơn ${ref.orderId}`, 'ok');
  return res.json({ ok: true, refund: ref });
});

// Quản lý Ticket CSKH
app.get('/api/admin/tickets', requireAdmin, requireRole('CSKH'), (_req, res) => {
  const now = Date.now();
  const list = supportTickets.map(t => {
    const isBreached = ['NEW', 'REVIEWING', 'WAITING_REFUND'].includes(t.status) && now > new Date(t.slaDeadline).getTime();
    return { ...t, slaBreached: isBreached };
  });
  return res.json({ ok: true, tickets: list });
});

// Cập nhật trạng thái ticket CSKH
app.post('/api/admin/tickets/:ticketId/update', requireAdmin, requireRole('CSKH'), (req, res) => {
  const ticket = supportTickets.find(t => t.ticketId === req.params.ticketId);
  if (!ticket) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy phiếu khiếu nại.' });
  }
  const { status, note } = req.body;
  if (status) ticket.status = status;
  if (note) {
    ticket.notes.push({
      at: new Date().toISOString(),
      actor: `${req.admin.name} [${req.admin.role}]`,
      text: note.trim()
    });
  }
  ticket.updatedAt = new Date().toISOString();
  addLog('Cập nhật khiếu nại', `CSKH [${req.admin.email}] cập nhật ticket ${ticket.ticketId} -> [${ticket.status}]`, 'info');
  return res.json({ ok: true, ticket });
});

// Báo cáo đối soát kế toán theo ngày + Xuất CSV có UTF-8 BOM
app.get('/api/admin/reports/reconciliation', requireAdmin, requireRole('ACCOUNTANT'), (req, res) => {
  let gatewayTotal = 0;
  let websiteTotal = 0;
  let hangingAmount = 0;
  let refundedAmount = 0;
  let pendingRefundAmount = 0;

  for (const t of gatewayTxns.values()) {
    if (t.status === 'SUCCESS' && t.debited) gatewayTotal += t.amount;
  }
  for (const o of orders.values()) {
    if (o.status === 'PAID') websiteTotal += o.amount;
    if (['FAILED', 'EXPIRED', 'PENDING_VERIFY'].includes(o.status)) {
      const matchT = Array.from(gatewayTxns.values()).find(t => t.orderId === o.orderId && t.status === 'SUCCESS' && t.debited);
      if (matchT) hangingAmount += o.amount;
    }
  }
  for (const r of refunds) {
    if (r.status === 'SUCCESS') refundedAmount += r.amount;
    if (r.status === 'PENDING') pendingRefundAmount += r.amount;
  }

  const discrepancy = gatewayTotal - websiteTotal;

  const data = {
    date: new Date().toLocaleDateString('vi-VN'),
    gatewayTotal,
    websiteTotal,
    discrepancy,
    hangingAmount,
    refundedAmount,
    pendingRefundAmount
  };

  // Xuất file CSV có BOM UTF-8 (\uFEFF)
  if (req.query.format === 'csv') {
    const csvContent = '\uFEFF' +
      'BÁO CÁO ĐỐI SOÁT DOANH THU & GIAO DỊCH TREO - BETA CINEMAS\r\n' +
      `Ngày lập báo cáo,${data.date}\r\n` +
      `Tổng tiền Cổng thanh toán ghi nhận (VND),${gatewayTotal}\r\n` +
      `Tổng tiền Vé Website ghi nhận (VND),${websiteTotal}\r\n` +
      `Chênh lệch (Doanh thu Cổng - Vé),${discrepancy}\r\n` +
      `Tổng số tiền giao dịch treo (Khách mất tiền chưa có vé),${hangingAmount}\r\n` +
      `Số tiền đã hoàn trả cho khách hàng (VND),${refundedAmount}\r\n` +
      `Số tiền đang chờ duyệt hoàn tiền (VND),${pendingRefundAmount}\r\n\r\n` +
      'DANH SÁCH CHI TIẾT GIAO DỊCH\r\n' +
      'Mã GD Cổng,Mã Đơn,Phương thức,Số tiền Cổng,Trạng thái Cổng,Trạng thái Đơn,Thời gian\r\n' +
      Array.from(gatewayTxns.values()).map(t => {
        const o = orders.get(t.orderId);
        return `"${t.txnRef}","${t.orderId}","${t.method}",${t.amount},"${t.status}","${o ? o.status : 'N/A'}","${t.createdAt}"`;
      }).join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="BaoCaoDoiSoat_${Date.now()}.csv"`);
    return res.send(csvContent);
  }

  return res.json({ ok: true, report: data });
});

// Cấu hình tham số hệ thống (IT và MANAGER)
app.get('/api/admin/settings', requireAdmin, requireRole('IT'), (_req, res) => {
  return res.json({ ok: true, config });
});

app.post('/api/admin/settings', requireAdmin, requireRole('IT'), (req, res) => {
  const { holdSeconds, callbackTimeoutSeconds, autoReconIntervalSeconds, mode } = req.body;
  if (holdSeconds) config.holdSeconds = Number(holdSeconds);
  if (callbackTimeoutSeconds) config.callbackTimeoutSeconds = Number(callbackTimeoutSeconds);
  if (autoReconIntervalSeconds) config.autoReconIntervalSeconds = Number(autoReconIntervalSeconds);
  if (mode && ['ASIS', 'TOBE'].includes(mode)) config.mode = mode;

  addLog('Cập nhật cấu hình', `IT [${req.admin.email}] cập nhật: Giữ ghế ${config.holdSeconds}s, Timeout ${config.callbackTimeoutSeconds}s, Chế độ ${config.mode}`, 'info');
  return res.json({ ok: true, config });
});

// Danh sách tài khoản người dùng (MANAGER xem)
app.get('/api/admin/users', requireAdmin, requireRole('MANAGER'), (_req, res) => {
  const safeUsers = users.map(u => ({ id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role }));
  return res.json({ ok: true, users: safeUsers });
});

// Nút thiết lập lại toàn bộ dữ liệu demo (Reset all)
app.post('/api/admin/reset-data', requireAdmin, requireRole('IT', 'MANAGER'), (req, res) => {
  initData();
  addLog('Reset dữ liệu', `Nhân viên [${req.admin.email}] vừa thiết lập lại toàn bộ dữ liệu demo bộ nhớ`, 'warn');
  return res.json({ ok: true, message: 'Đã đưa dữ liệu hệ thống về trạng thái ban đầu.' });
});

// ============================================================================
// 9. ĐIỀU HƯỚNG GIAO DIỆN (UI ROUTES HTML)
// ============================================================================

// Khách hàng
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/seats', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'seats.html')));
app.get('/checkout', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'checkout.html')));
app.get('/gateway/:method', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'gateway.html')));
app.get('/result', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'result.html')));
app.get('/ticket/:orderId', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'ticket.html')));
app.get('/orders', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'orders.html')));
app.get('/support', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'support.html')));
app.get('/support/tickets', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'support-tickets.html')));
app.get('/notifications', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'notifications.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

// Admin
app.get('/admin/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('/admin/orders', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'orders.html')));
app.get('/admin/reconcile', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'reconcile.html')));
app.get('/admin/refunds', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'refunds.html')));
app.get('/admin/tickets', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'tickets.html')));
app.get('/admin/reports', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'reports.html')));
app.get('/admin/settings', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'settings.html')));

// Khởi chạy máy chủ HTTP tại cổng 3000
let server = null;
if (!process.env.VERCEL) {
  server = app.listen(PORT, () => {
    console.log('');
    console.log('================================================================');
    console.log('  BETA CINEMAS - DEMO LUỒNG THANH TOÁN & ĐỐI SOÁT HOÀN TIỀN');
    console.log('  Giao diện khách: http://localhost:' + PORT);
    console.log('  Cổng quản trị:   http://localhost:' + PORT + '/admin/login');
    console.log('================================================================');
    console.log('');
  });
}

app.app = app;
app.server = server;
app.initData = initData;
app.orders = orders;
app.gatewayTxns = gatewayTxns;
app.config = config;
app.users = users;
app.refunds = refunds;
app.supportTickets = supportTickets;
app.systemLogs = systemLogs;

module.exports = app;
