'use strict';
/**
 * DEMO Beta Cinemas - thanh toán QR, giao dịch treo, đối soát & hoàn tiền.
 * Website + cổng thanh toán giả lập chạy chung 1 process, dữ liệu lưu trong bộ nhớ.
 */
const express = require('express');
const crypto = require('crypto');
const path = require('path');

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = 'beta-demo-secret'; // chỉ dùng cho demo
const PRICE = 75000;
const ROWS = ['A', 'B', 'C', 'D', 'E'];
const COLS = 8;
const MOVIE = { title: 'Trại Buồn Người', cinema: 'Beta Thanh Xuân', room: 'Phòng 2', showtime: '19:30 - hôm nay', price: PRICE };

const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------- Trạng thái (bộ nhớ)
let seats, orders, txns, logs, processedTxns, orderSeq, txnSeq;
const config = { holdSeconds: 180, autoRecon: false, lateSeconds: 20 };
let autoTimer = null;

function resetAll() {
  seats = {};
  for (const r of ROWS) for (let c = 1; c <= COLS; c++) seats[r + c] = { state: 'FREE', order: null };
  orders = new Map();
  txns = [];
  logs = [];
  processedTxns = new Set();
  orderSeq = 122;
  txnSeq = 5000;
}
resetAll();

function log(who, msg, level = 'info') {
  logs.unshift({ t: new Date().toISOString(), who, msg, level });
  if (logs.length > 300) logs.pop();
  console.log(`[${who}] ${msg}`);
}

const sign = (body) => crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
const money = (n) => n.toLocaleString('vi-VN') + 'đ';

// ---------------------------------------------------------------- Nghiệp vụ website
function releaseSeats(o) {
  for (const id of o.seats) if (seats[id].order === o.code && seats[id].state === 'HELD') seats[id] = { state: 'FREE', order: null };
}

function fulfill(o, by) {
  for (const id of o.seats) seats[id] = { state: 'SOLD', order: o.code };
  o.status = 'PAID';
  o.paidAt = new Date().toISOString();
  o.note = null;
  o.ticket = 'TK' + o.code.replace('BETA', '');
  log('WEBSITE', `Đơn ${o.code} -> PAID (${by}). Ghế ${o.seats.join(', ')} -> SOLD. Xuất vé ${o.ticket}`, 'ok');
}

// Job hết hạn: chính là hành vi As-is gây ra lỗi treo
function expireJob() {
  const now = Date.now();
  for (const o of orders.values()) {
    if (o.status === 'PENDING' && now > new Date(o.expiresAt).getTime()) {
      o.status = 'EXPIRED';
      releaseSeats(o);
      log('WEBSITE', `Đơn ${o.code} quá hạn -> EXPIRED, nhả ghế ${o.seats.join(', ')}`, 'warn');
    }
  }
}
setInterval(expireJob, 5000);

// ---------------------------------------------------------------- Webhook
app.post('/webhooks/payment', (req, res) => {
  const sig = req.get('X-Signature') || '';
  const expected = sign(req.rawBody || '');
  const valid = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!valid) {
    log('WEBSITE', 'Webhook bị TỪ CHỐI: chữ ký không hợp lệ', 'error');
    return res.status(401).json({ ok: false, error: 'invalid signature' });
  }
  const { txnId, orderCode, amount } = req.body || {};
  log('WEBSITE', `Nhận webhook txn ${txnId} cho đơn ${orderCode}, số tiền ${money(amount || 0)}`);

  if (processedTxns.has(txnId)) {
    log('WEBSITE', `Webhook ${txnId} đã xử lý trước đó -> bỏ qua (chống trùng)`, 'warn');
    return res.json({ ok: true, duplicate: true });
  }
  processedTxns.add(txnId);

  const o = orders.get(orderCode);
  if (!o) {
    log('WEBSITE', `Không tìm thấy đơn ${orderCode}`, 'error');
    return res.status(404).json({ ok: false, error: 'order not found' });
  }
  if (o.status !== 'PENDING' && o.status !== 'EXPIRED') {
    log('WEBSITE', `Đơn ${o.code} đang ở trạng thái ${o.status} -> bỏ qua webhook`, 'warn');
    return res.json({ ok: true, ignored: true });
  }
  if (amount !== o.amount) {
    o.status = 'NEEDS_REVIEW';
    o.note = `Sai số tiền: cổng ghi ${money(amount)}, đơn ${money(o.amount)}`;
    releaseSeats(o);
    log('WEBSITE', `Đơn ${o.code} -> NEEDS_REVIEW (${o.note})`, 'error');
    return res.json({ ok: true, review: true });
  }
  if (o.status === 'EXPIRED') {
    o.status = 'NEEDS_REVIEW';
    o.note = 'Tiền về sau khi đơn đã hết hạn (cần cấp lại vé hoặc hoàn tiền)';
    log('WEBSITE', `Đơn ${o.code} đã EXPIRED nhưng nhận được tiền -> NEEDS_REVIEW`, 'error');
    return res.json({ ok: true, review: true });
  }
  fulfill(o, 'webhook');
  res.json({ ok: true });
});

// ---------------------------------------------------------------- API website
const publicOrder = (o) => ({
  code: o.code, seats: o.seats, amount: o.amount, status: o.status, note: o.note,
  createdAt: o.createdAt, expiresAt: o.expiresAt, ticket: o.ticket || null, movie: MOVIE, serverNow: new Date().toISOString(),
});

app.get('/api/state', (_req, res) => {
  expireJob();
  res.json({ rows: ROWS, cols: COLS, seats, movie: MOVIE, config });
});

app.post('/api/config', (req, res) => {
  const s = Number(req.body.holdSeconds);
  if (!Number.isFinite(s) || s < 10 || s > 3600) return res.status(400).json({ error: 'Thời gian giữ ghế phải từ 10 đến 3600 giây' });
  config.holdSeconds = Math.round(s);
  log('SYSTEM', `Đổi thời gian giữ ghế = ${config.holdSeconds}s`);
  res.json(config);
});

app.post('/api/orders', (req, res) => {
  expireJob();
  const ids = Array.isArray(req.body.seats) ? [...new Set(req.body.seats)] : [];
  if (!ids.length) return res.status(400).json({ error: 'Vui lòng chọn ít nhất 1 ghế' });
  if (ids.length > 8) return res.status(400).json({ error: 'Tối đa 8 ghế mỗi đơn' });
  if (ids.some((id) => !seats[id])) return res.status(400).json({ error: 'Ghế không hợp lệ' });
  const taken = ids.filter((id) => seats[id].state !== 'FREE');
  if (taken.length) return res.status(409).json({ error: `Ghế ${taken.join(', ')} vừa có người khác chọn, vui lòng chọn lại` });

  const code = 'BETA' + String(++orderSeq).padStart(6, '0');
  const now = Date.now();
  const o = {
    code, seats: ids, amount: ids.length * PRICE, status: 'PENDING', note: null,
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + config.holdSeconds * 1000).toISOString(), ticket: null,
  };
  orders.set(code, o);
  for (const id of ids) seats[id] = { state: 'HELD', order: code };
  log('WEBSITE', `Tạo đơn ${code} (PENDING): ghế ${ids.join(', ')}, ${money(o.amount)}, giữ ghế ${config.holdSeconds}s`);
  res.json(publicOrder(o));
});

app.get('/api/orders/:code', (req, res) => {
  expireJob();
  const o = orders.get(req.params.code);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  res.json(publicOrder(o));
});

// ---------------------------------------------------------------- Cổng thanh toán giả
async function sendWebhook(txn) {
  const body = JSON.stringify({ txnId: txn.txnId, orderCode: txn.orderCode, amount: txn.amount, status: 'SUCCESS' });
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/webhooks/payment`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Signature': sign(body) }, body,
    });
    txn.webhook = r.ok ? 'ĐÃ GỬI (OK)' : `LỖI HTTP ${r.status}`;
    log('GATEWAY', `Gửi webhook txn ${txn.txnId} -> website trả ${r.status}`);
  } catch (e) {
    txn.webhook = 'GỬI LỖI';
    log('GATEWAY', `Gửi webhook txn ${txn.txnId} thất bại: ${e.message}`, 'error');
  }
}

app.get('/api/gateway/:code', (req, res) => {
  const o = orders.get(req.params.code);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  res.json({ code: o.code, amount: o.amount, paid: txns.some((t) => t.orderCode === o.code) });
});

app.post('/api/gateway/pay', async (req, res) => {
  const { orderCode, scenario } = req.body || {};
  const o = orders.get(orderCode);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  if (txns.some((t) => t.orderCode === orderCode)) return res.status(409).json({ error: 'Đơn này đã có giao dịch phía cổng' });
  if (!['success', 'lost', 'late', 'wrong'].includes(scenario)) return res.status(400).json({ error: 'Kịch bản không hợp lệ' });

  // Cổng/ngân hàng không biết trạng thái đơn của website: khách quét QR là bị trừ tiền
  const txn = {
    txnId: 'GW' + String(++txnSeq), orderCode, amount: scenario === 'wrong' ? o.amount - 10000 : o.amount,
    status: 'SUCCESS', debited: true, scenario, createdAt: new Date().toISOString(), webhook: 'CHƯA GỬI',
  };
  txns.push(txn);
  log('GATEWAY', `Giao dịch ${txn.txnId}: SUCCESS, đã trừ ${money(txn.amount)} của khách (đơn ${orderCode}, kịch bản ${scenario})`, 'ok');

  if (scenario === 'lost') {
    txn.webhook = 'KHÔNG GỬI (mất callback)';
    log('GATEWAY', `Webhook cho ${txn.txnId} BỊ MẤT - website sẽ không biết khách đã trả tiền`, 'error');
  } else if (scenario === 'late') {
    txn.webhook = `SẼ GỬI SAU ${config.lateSeconds}s`;
    setTimeout(() => sendWebhook(txn), config.lateSeconds * 1000);
    log('GATEWAY', `Webhook ${txn.txnId} sẽ đến muộn sau ${config.lateSeconds}s`, 'warn');
  } else {
    await sendWebhook(txn);
  }
  res.json({ ok: true, txn });
});

// ---------------------------------------------------------------- Đối soát
function reconcile(trigger) {
  log('RECON', `Bắt đầu đối soát (${trigger})`);
  let fixed = 0, refunded = 0, flagged = 0;
  for (const t of txns) {
    if (t.status !== 'SUCCESS') continue;
    const o = orders.get(t.orderCode);
    if (!o || o.status === 'PAID' || o.status === 'REFUNDED') continue;

    if (t.amount !== o.amount) {
      flagged++;
      if (!o.flagLogged) { o.flagLogged = true; log('RECON', `Đơn ${o.code}: lệch số tiền, cần nhân viên xử lý (không tự sửa)`, 'warn'); }
      continue;
    }
    const seatsFree = o.seats.every((id) => seats[id].state === 'FREE' || (seats[id].state === 'HELD' && seats[id].order === o.code));
    if (o.status === 'PENDING' || seatsFree) {
      log('RECON', `Đơn ${o.code} (${o.status}) nhưng cổng đã trừ tiền ${t.txnId}; ghế còn trống -> cấp lại vé`, 'ok');
      processedTxns.add(t.txnId);
      fulfill(o, 'đối soát');
      fixed++;
    } else {
      log('RECON', `Đơn ${o.code}: ghế đã bị người khác mua -> tạo lệnh HOÀN TIỀN ${money(t.amount)}`, 'warn');
      refundOrder(o, t, 'đối soát');
      refunded++;
    }
  }
  log('RECON', `Kết thúc đối soát: cấp lại vé ${fixed}, hoàn tiền ${refunded}, cần xem xét ${flagged}`);
  return { fixed, refunded, flagged };
}

function refundOrder(o, t, by) {
  processedTxns.add(t.txnId);
  t.status = 'REFUNDED';
  o.status = 'REFUNDED';
  o.note = `Đã hoàn ${money(t.amount)} (${by})`;
  log('GATEWAY', `Hoàn tiền ${money(t.amount)} cho giao dịch ${t.txnId} (${by})`, 'ok');
  log('WEBSITE', `Đơn ${o.code} -> REFUNDED`, 'ok');
}

function applyAuto() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = config.autoRecon ? setInterval(() => reconcile('tự động'), 10000) : null;
}

// ---------------------------------------------------------------- API quản trị
app.get('/api/admin', (_req, res) => {
  expireJob();
  res.json({
    now: new Date().toISOString(), config,
    orders: [...orders.values()].reverse().map(publicOrder),
    txns: [...txns].reverse(), logs: logs.slice(0, 120),
  });
});

app.post('/api/admin/reconcile', (_req, res) => res.json(reconcile('thủ công')));

app.post('/api/admin/auto', (req, res) => {
  config.autoRecon = !!req.body.enabled;
  applyAuto();
  log('SYSTEM', `Đối soát tự động: ${config.autoRecon ? 'BẬT (To-be)' : 'TẮT (As-is)'}`);
  res.json(config);
});

app.post('/api/admin/refund/:code', (req, res) => {
  const o = orders.get(req.params.code);
  const t = txns.find((x) => x.orderCode === req.params.code && x.status === 'SUCCESS');
  if (!o || !t || o.status === 'PAID' || o.status === 'REFUNDED') return res.status(400).json({ error: 'Không thể hoàn tiền đơn này' });
  refundOrder(o, t, 'nhân viên');
  res.json({ ok: true });
});

app.post('/api/admin/reset', (_req, res) => {
  resetAll();
  config.autoRecon = false;
  applyAuto();
  log('SYSTEM', 'Đã reset toàn bộ dữ liệu demo');
  res.json({ ok: true });
});

// ---------------------------------------------------------------- Trang
const page = (f) => (_req, res) => res.sendFile(path.join(__dirname, 'public', f));
app.get('/pay/:code', page('pay.html'));
app.get('/gateway/:code', page('gateway.html'));
app.get('/ticket/:code', page('ticket.html'));
app.get('/admin', page('admin.html'));

app.listen(PORT, () => {
  log('SYSTEM', `Server chạy tại http://localhost:${PORT}  (quản trị: /admin)`);
});
