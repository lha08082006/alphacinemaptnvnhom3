const http = require('http');

async function test() {
    // 1. Đăng nhập
    const loginData = JSON.stringify({ email: 'khachhang@gmail.com', password: 'Password@123' });
    
    const cookie = await new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: 4000,
            path: '/api/v1/auth/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(loginData)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const setCookie = res.headers['set-cookie'];
                console.log('Login status:', res.statusCode);
                resolve(setCookie ? setCookie[0] : null);
            });
        });
        req.on('error', reject);
        req.write(loginData);
        req.end();
    });

    console.log('Got cookie:', cookie ? 'YES' : 'NO');
    if (!cookie) return;

    // 2. Tạo đơn giữ chỗ
    const holdData = JSON.stringify({
        showtimeId: 1,
        seatIds: [1000],
        customerName: 'Khach Hang Test',
        customerPhone: '0912345678',
        customerEmail: 'khachhang@gmail.com'
    });

    const orderId = await new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: 4000,
            path: '/api/v1/orders/hold',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(holdData),
                'Cookie': cookie
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                console.log('Hold status:', res.statusCode);
                try {
                    const parsed = JSON.parse(body);
                    console.log('Hold body:', parsed);
                    resolve(parsed.data ? parsed.data.orderId : null);
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on('error', reject);
        req.write(holdData);
        req.end();
    });

    console.log('Created orderId:', orderId);
    if (!orderId) return;

    // 3. Khởi tạo SePay
    const sepayData = JSON.stringify({
        orderId: orderId,
        paymentMethod: 'BANK_TRANSFER',
        termsAccepted: true
    });

    await new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: 4000,
            path: '/api/v1/payments/sepay',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(sepayData),
                'Cookie': cookie,
                'Idempotency-Key': 'IDEMP_' + Date.now() + '_test123'
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                console.log('SePay Payment status:', res.statusCode);
                console.log('SePay Payment response:', body);
                resolve();
            });
        });
        req.on('error', reject);
        req.write(sepayData);
        req.end();
    });
}

test().catch(console.error);
