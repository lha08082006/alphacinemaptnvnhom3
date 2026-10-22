const fs = require('fs');
const path = require('path');

const checkoutPath = path.join(__dirname, '..', 'js', 'checkout.js');
let s = fs.readFileSync(checkoutPath, 'utf-8');

// Replace the try-catch block in proceedPayment
const oldCatch = `        } catch (err) {
            console.warn('API thanh toán không sẵn sàng hoặc xảy ra lỗi mạng, chuyển sang cổng thanh toán mô phỏng (SPA Gateway):', err);
            const txnId = (typeof DB !== 'undefined' && DB.generateId) ? DB.generateId.txn() : 'GW' + Math.random().toString(36).substring(2, 12).toUpperCase();
            if (typeof DB !== 'undefined') {
                DB.insert('gateway_txns', {
                    txnId: txnId,
                    orderId: orderId,
                    method: method,
                    amount: (currentOrd && currentOrd.amount) || 136000,
                    status: 'PENDING',
                    debited: false,
                    callback: null,
                    createdAt: new Date().toISOString()
                });
                DB.update('beta_orders', orderId, { txnId: txnId, status: 'AWAITING_PAYMENT' });
            }
            closeTncModal();
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'THANH TOÁN';
            }
            if (nextBtn) nextBtn.disabled = false;

            if (window.spaNavigate) {
                window.spaNavigate('gateway', \`txn=\${txnId}&orderId=\${orderId}\`);
            } else {
                window.location.hash = \`#gateway?txn=\${txnId}&orderId=\${orderId}\`;
            }
        }`;

const newCatch = `        } catch (err) {
            console.warn('API thanh toán gặp lỗi:', err);
            closeTncModal();
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'THANH TOÁN';
            }
            if (nextBtn) nextBtn.disabled = false;

            // 1. Nếu lỗi chưa đăng nhập
            if (err.status === 401 || err.code === 'AUTH_REQUIRED' || (err.message && err.message.includes('401'))) {
                alert('Quý khách vui lòng đăng nhập tài khoản trước khi tiến hành thanh toán vé!');
                if (typeof window.openAuthModal === 'function') {
                    window.openAuthModal('login');
                }
                return;
            }

            // 2. Nếu là SePay: hiển thị thông báo lỗi cụ thể, tuyệt đối không nhảy vào gateway giả lập
            if (isSepay) {
                alert('Lỗi khởi tạo cổng thanh toán SePay: ' + (err.message || 'Không thể kết nối đến máy chủ.'));
                return;
            }

            // 3. Fallback cổng mô phỏng VNPay nội bộ chỉ chạy khi cổng VNPay sandbox ngoại tuyến
            const txnId = (typeof DB !== 'undefined' && DB.generateId) ? DB.generateId.txn() : 'GW' + Math.random().toString(36).substring(2, 12).toUpperCase();
            if (typeof DB !== 'undefined') {
                DB.insert('gateway_txns', {
                    txnId: txnId,
                    orderId: orderId,
                    method: method,
                    amount: (currentOrd && currentOrd.amount) || 136000,
                    status: 'PENDING',
                    debited: false,
                    callback: null,
                    createdAt: new Date().toISOString()
                });
                DB.update('beta_orders', orderId, { txnId: txnId, status: 'AWAITING_PAYMENT' });
            }

            if (window.spaNavigate) {
                window.spaNavigate('gateway', \`txn=\${txnId}&orderId=\${orderId}\`);
            } else {
                window.location.hash = \`#gateway?txn=\${txnId}&orderId=\${orderId}\`;
            }
        }`;

if (s.includes('API thanh toán không sẵn sàng hoặc xảy ra lỗi mạng')) {
    s = s.replace(oldCatch, newCatch);
    fs.writeFileSync(checkoutPath, s, 'utf-8');
    console.log('Successfully updated checkout.js error handling');
} else {
    console.warn('Pattern not matched in checkout.js');
}
