/**
 * TEST DEMO SCENARIOS - TỰ ĐỘNG KIỂM THỬ TOÀN BỘ 3 KỊCH BẢN & PHÂN QUYỀN RBAC
 */
const { app, server, initData } = require('./server');

const BASE_URL = 'http://localhost:3000';

async function request(path, opts = {}) {
  const url = BASE_URL + path;
  const headers = opts.headers || {};
  let body = opts.body;

  if (body && typeof body === 'object') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method: opts.method || (body ? 'POST' : 'GET'),
    headers,
    body
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}

  return { status: res.status, headers: res.headers, text, json };
}

function parseCookie(res, name) {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  const match = raw.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

async function runTests() {
  console.log('--- BẮT ĐẦU KIỂM THỬ HỆ THỐNG BETA PAYMENT DEMO ---');
  let customerCookie = '';
  let adminCookie = '';

  try {
    // 1. Kiểm tra các trang giao diện UI trả về 200 OK
    console.log('\n[TEST 1] Kiểm tra tất cả các route giao diện HTML...');
    const uiRoutes = [
      '/', '/seats', '/checkout', '/gateway/vnpay', '/result', '/orders',
      '/support', '/support/tickets', '/notifications', '/login',
      '/admin/login', '/admin', '/admin/orders', '/admin/reconcile',
      '/admin/refunds', '/admin/tickets', '/admin/reports', '/admin/settings'
    ];

    for (const r of uiRoutes) {
      const res = await request(r);
      if (res.status !== 200) throw new Error(`Route ${r} trả về HTTP ${res.status}`);
    }
    console.log('✔️ Tất cả 18 trang HTML Client & Admin phản hồi 200 OK.');

    // 2. Đăng nhập khách hàng
    console.log('\n[TEST 2] Đăng nhập Khách hàng...');
    const loginCust = await request('/api/auth/login', {
      body: { email: 'khach@demo.vn', password: '123' }
    });
    if (loginCust.status !== 200 || !loginCust.json.ok) throw new Error('Đăng nhập khách hàng thất bại');
    customerCookie = `beta_customer_token=${parseCookie(loginCust, 'beta_customer_token')}`;
    console.log('✔️ Đăng nhập khách thành công:', loginCust.json.user.name);

    // 3. KỊCH BẢN 1: Thanh toán thành công (Happy Path)
    console.log('\n[TEST 3] KỊCH BẢN 1 - Thanh toán thành công...');
    const hold1 = await request('/api/hold', {
      headers: { cookie: customerCookie },
      body: { showtimeId: 'st1', seatCodes: ['A1', 'A2'] }
    });
    if (!hold1.json.ok) throw new Error(`Lỗi giữ ghế: ${hold1.json.error}`);
    const order1 = hold1.json.order;
    console.log(`✔️ Giữ ghế A1, A2 tạo đơn ${order1.orderId} (HOLDING)`);

    const pay1 = await request('/api/pay', {
      headers: { cookie: customerCookie, 'idempotency-key': 'IDEMP_TEST_1' },
      body: { orderId: order1.orderId, method: 'VNPAY' }
    });
    if (!pay1.json.ok) throw new Error(`Lỗi khởi tạo pay: ${pay1.json.error}`);
    const { txnRef: txnRef1 } = pay1.json;
    console.log(`✔️ Khởi tạo cổng VNPay với mã ${txnRef1} (AWAITING_PAYMENT)`);

    // Kích hoạt kịch bản 1: Thành công
    const sim1 = await request('/api/gateway/simulate', {
      body: { txnRef: txnRef1, scenario: '1' }
    });
    if (!sim1.json.ok || sim1.json.status !== 'SUCCESS') throw new Error('Mô phỏng kịch bản 1 thất bại');
    console.log('✔️ Cổng xác nhận SUCCESS và đã gửi IPN ngay');

    // Kiểm tra trạng thái đơn hàng
    const status1 = await request(`/api/order/${order1.orderId}/status`);
    if (status1.json.status !== 'PAID' || !status1.json.ticketCode) {
      throw new Error(`Đơn hàng chưa chuyển PAID: ${status1.json.status}`);
    }
    console.log(`✔️ Đơn ${order1.orderId} đã chuyển PAID. Mã vé: ${status1.json.ticketCode}`);

    // 4. KỊCH BẢN 2: MẤT CALLBACK ở chế độ AS-IS (Sinh ra Giao dịch treo)
    console.log('\n[TEST 4] KỊCH BẢN 2 - Giao dịch treo trong chế độ AS-IS...');
    const hold2 = await request('/api/hold', {
      headers: { cookie: customerCookie },
      body: { showtimeId: 'st1', seatCodes: ['C1'] }
    });
    const order2 = hold2.json.order;
    console.log(`✔️ Giữ ghế C1 tạo đơn ${order2.orderId}`);

    const pay2 = await request('/api/pay', {
      headers: { cookie: customerCookie },
      body: { orderId: order2.orderId, method: 'MOMO' }
    });
    const { txnRef: txnRef2 } = pay2.json;

    // Kích hoạt kịch bản 2: MẤT CALLBACK
    const sim2 = await request('/api/gateway/simulate', {
      body: { txnRef: txnRef2, scenario: '2' }
    });
    if (!sim2.json.ok) throw new Error('Mô phỏng kịch bản 2 thất bại');
    console.log('✔️ Cổng MoMo đã trừ tiền (debited=true), nhưng KHÔNG gửi IPN');

    // Mô phỏng timeout 15s của AS-IS bằng cách điều chỉnh awaitingTimeoutAt về quá khứ và chờ cron
    const { orders } = require('./server'); // In-memory reference
    // Đơn order2 trong Map bộ nhớ
    const internalOrder2 = orders.get(order2.orderId);
    internalOrder2.awaitingTimeoutAt = new Date(Date.now() - 20000).toISOString();
    console.log('⏳ Đang chờ background job phát hiện timeout 15s trong AS-IS...');
    await new Promise(r => setTimeout(r, 6000));

    const status2 = await request(`/api/order/${order2.orderId}/status`);
    if (status2.json.status !== 'FAILED') {
      throw new Error(`Kỳ vọng đơn bị FAILED nhưng trạng thái là: ${status2.json.status}`);
    }
    console.log(`✔️ Đơn ${order2.orderId} đã bị FAILED và ghế C1 đã bị nhả tự do! (Đây là lỗi Giao dịch treo)`);

    // 5. Kiểm tra Cổng Quản trị nhận diện giao dịch treo
    console.log('\n[TEST 5] Kiểm tra Cổng Quản trị & Dashboard...');
    const loginAdmin = await request('/api/admin/auth/login', {
      body: { email: 'manager@demo.vn', password: '123' }
    });
    adminCookie = `beta_admin_token=${parseCookie(loginAdmin, 'beta_admin_token')}`;

    const dash = await request('/api/admin/dashboard', { headers: { cookie: adminCookie } });
    if (dash.json.stats.hangingCount < 1) {
      throw new Error(`Dashboard không ghi nhận giao dịch treo: ${dash.json.stats.hangingCount}`);
    }
    console.log(`✔️ Dashboard quản trị ghi nhận chính xác: ${dash.json.stats.hangingCount} giao dịch treo!`);

    // 6. KỊCH BẢN 3: Bật TO-BE & Tự động đối soát cấp vé / hoàn tiền
    console.log('\n[TEST 6] KỊCH BẢN 3 - Khắc phục tự động với TO-BE...');
    // Chuyển sang TO-BE
    const toggle = await request('/api/admin/reconcile/toggle-mode', {
      headers: { cookie: adminCookie },
      body: { mode: 'TOBE' }
    });
    if (toggle.json.mode !== 'TOBE') throw new Error('Không thể bật chế độ TO-BE');
    console.log('✔️ Đã chuyển hệ thống sang chế độ: TO-BE');

    // Khách đặt ghế D1
    const hold3 = await request('/api/hold', {
      headers: { cookie: customerCookie },
      body: { showtimeId: 'st1', seatCodes: ['D1'] }
    });
    const order3 = hold3.json.order;
    const pay3 = await request('/api/pay', {
      headers: { cookie: customerCookie },
      body: { orderId: order3.orderId, method: 'ZALOPAY' }
    });
    const { txnRef: txnRef3 } = pay3.json;

    // Cổng ZaloPay trừ tiền nhưng mất IPN
    await request('/api/gateway/simulate', {
      body: { txnRef: txnRef3, scenario: '2' }
    });

    // Timeout xảy ra
    const internalOrder3 = orders.get(order3.orderId);
    internalOrder3.awaitingTimeoutAt = new Date(Date.now() - 20000).toISOString();
    console.log('⏳ Đang chờ background job phát hiện timeout trong TO-BE...');
    await new Promise(r => setTimeout(r, 6000));

    const status3 = await request(`/api/order/${order3.orderId}/status`);
    console.log(`✔️ Trạng thái đơn trong TO-BE: ${status3.json.status}`);
    if (!['PENDING_VERIFY', 'PAID'].includes(status3.json.status)) {
      throw new Error(`Kỳ vọng PENDING_VERIFY hoặc PAID nhưng là: ${status3.json.status}`);
    }
    console.log(`✔️ TO-BE bảo vệ an toàn: Đơn được bảo lưu ghế và tự động đối soát cấp vé thành công!`);

    // Chạy đối soát
    console.log('⚡ Tiến hành kích hoạt tiến trình Đối soát tự động...');
    const reconRes = await request('/api/admin/reconcile/run', {
      headers: { cookie: adminCookie },
      method: 'POST'
    });
    console.log('✔️ Kết quả đối soát:', reconRes.json.result);

    const status3AfterRecon = await request(`/api/order/${order3.orderId}/status`);
    if (status3AfterRecon.json.status !== 'PAID') {
      throw new Error(`Kỳ vọng đơn được cấp vé PAID sau đối soát, nhưng là: ${status3AfterRecon.json.status}`);
    }
    console.log(`✔️ Đơn ${order3.orderId} đã được tự động cấp vé PAID thành công! Mã vé: ${status3AfterRecon.json.ticketCode}`);

    // 7. Kiểm tra Báo cáo Kế toán và Xuất CSV UTF-8 BOM
    console.log('\n[TEST 7] Kiểm tra Báo cáo Kế toán & Xuất file CSV...');
    const rptRes = await request('/api/admin/reports/reconciliation', {
      headers: { cookie: adminCookie }
    });
    if (!rptRes.json.ok) throw new Error('Không lấy được báo cáo kế toán');
    console.log('✔️ Báo cáo kế toán:', rptRes.json.report);

    const rawCsvRes = await fetch(BASE_URL + '/api/admin/reports/reconciliation?format=csv', {
      headers: { cookie: adminCookie }
    });
    const rawBuf = Buffer.from(await rawCsvRes.arrayBuffer());
    const hasBom = rawBuf[0] === 0xEF && rawBuf[1] === 0xBB && rawBuf[2] === 0xBF;
    if (!hasBom) {
      throw new Error('File CSV thiếu UTF-8 BOM');
    }
    console.log('✔️ File CSV xuất thành công có chứa chuẩn UTF-8 BOM (0xEF, 0xBB, 0xBF) cho Excel tiếng Việt.');

    // 8. Kiểm tra Zero-Trust RBAC
    console.log('\n[TEST 8] Kiểm tra phân quyền Zero-Trust RBAC...');
    // Login CSKH
    const loginCskh = await request('/api/admin/auth/login', {
      body: { email: 'cskh@demo.vn', password: '123' }
    });
    const cskhCookie = `beta_admin_token=${parseCookie(loginCskh, 'beta_admin_token')}`;

    // CSKH cố tình truy cập cài đặt IT -> phải 403 Forbidden
    const forbiddenRes = await request('/api/admin/settings', {
      headers: { cookie: cskhCookie }
    });
    if (forbiddenRes.status !== 403) {
      throw new Error(`Kỳ vọng 403 Forbidden cho CSKH truy cập IT Settings, nhận: ${forbiddenRes.status}`);
    }
    console.log('✔️ Zero-Trust RBAC hoạt động chuẩn xác: CSKH bị chặn 403 khi vào cài đặt IT.');

    console.log('\n============================================================');
    console.log('  🎉 TẤT CẢ CÁC BÀI KIỂM THỬ ĐÃ VƯỢT QUA 100% THÀNH CÔNG!');
    console.log('============================================================\n');

  } catch (err) {
    console.error('\n❌ KIỂM THỬ THẤT BẠI:', err.message);
    process.exit(1);
  } finally {
    server.close();
    process.exit(0);
  }
}

// Chạy bài test
runTests();
