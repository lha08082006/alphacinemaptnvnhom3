const express = require('express');
const path = require('path');
const { SePayPgClient } = require('sepay-pg-node');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Bật CORS để cho phép frontend gọi từ Live Server (127.0.0.1:5500) hoặc các cổng khác
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Idempotency-Key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Phục vụ giao diện web tĩnh từ thư mục hiện tại
app.use(express.static(__dirname));

const client = new SePayPgClient({
  env: process.env.SEPAY_ENV || 'sandbox',
  merchant_id: process.env.SEPAY_MERCHANT_ID || 'SP-TEST-LH272A54',
  secret_key: process.env.SEPAY_SECRET_KEY || 'spsk_test_QmTCuBKcB4kdQvMX6mNAT3jZ2BWESmML'
});

app.post('/api/sepay/checkout', (req, res) => {
  const { orderId, amount } = req.body;
  if (!orderId || !(Number(amount) > 0)) {
    return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
  }

  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol || 'http';
  const base = `${protocol}://${host}/index.html`;

  const url = client.checkout.initCheckoutUrl();
  const fields = client.checkout.initOneTimePaymentFields({
    payment_method: 'BANK_TRANSFER',
    order_invoice_number: String(orderId),
    order_amount: Number(amount),
    currency: 'VND',
    order_description: 'Thanh toan hoa don ' + orderId,
    success_url: `${base}#result?status=success&orderId=${orderId}&gateway=sepay`,
    error_url: `${base}#result?status=error&orderId=${orderId}&gateway=sepay`,
    cancel_url: `${base}#result?status=cancel&orderId=${orderId}&gateway=sepay`
  });

  res.json({ url, fields });
});

// Tiếp nhận Webhook IPN từ SePay
app.post(['/api/sepay/ipn', '/api/sepay/webhook', '/ipn'], (req, res) => {
  console.log('[SePay Server] Nhận thông báo IPN:', req.body);
  res.json({ success: true, message: 'IPN received' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`Server SePay Sandbox đang chạy tại: http://localhost:${PORT}`);
    console.log(`Mở trình duyệt: http://localhost:${PORT}/index.html`);
    console.log(`====================================================`);
  });
}

module.exports = app;
