const fs = require('fs');
const path = require('path');

// 1. Update index.html
const indexPath = path.join(__dirname, '..', 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf-8');

indexHtml = indexHtml.replace(
    '<input type="radio" name="payment_method" value="SEPAY">',
    '<input type="radio" name="payment_method" value="SEPAY" checked>'
);
indexHtml = indexHtml.replace(
    '<input type="radio" name="payment_method" value="VNPAY" checked>',
    '<input type="radio" name="payment_method" value="VNPAY">'
);

fs.writeFileSync(indexPath, indexHtml, 'utf-8');
console.log('Updated index.html: SePay is now default checked');

// 2. Update checkout.html
const checkoutHtmlPath = path.join(__dirname, '..', 'checkout.html');
if (fs.existsSync(checkoutHtmlPath)) {
    let chHtml = fs.readFileSync(checkoutHtmlPath, 'utf-8');
    if (!chHtml.includes('value="SEPAY"')) {
        const sepayOptionHtml = `
                    <!-- 0. SePay - Quét mã QR Chuyển khoản (Sandbox) -->
                    <label class="payment-option sepay-option" style="border: 2px solid #00b14f;">
                        <input type="radio" name="payment_method" value="SEPAY" checked>
                        <div class="pay-icon-box" style="border-color: #00b14f; background: #f0fdf4;">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#00b14f" stroke-width="2">
                                <rect x="3" y="3" width="7" height="7"></rect>
                                <rect x="14" y="3" width="7" height="7"></rect>
                                <rect x="3" y="14" width="7" height="7"></rect>
                                <circle cx="17.5" cy="17.5" r="3.5" fill="#00b14f"></circle>
                            </svg>
                        </div>
                        <div>
                            <div style="font-weight: 700; color: #00b14f; display: flex; align-items: center; gap: 6px;">
                                <span>SePay QR Ngân Hàng</span>
                                <span style="background: #00b14f; color: white; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 3px;">Sandbox</span>
                            </div>
                            <div style="font-size: 11px; color: #555;">SePay - Quét mã QR Chuyển khoản (Sandbox)</div>
                        </div>
                    </label>
`;
        chHtml = chHtml.replace('<!-- 1. Cổng VNPAY tổng hợp -->', sepayOptionHtml + '\n                    <!-- 1. Cổng VNPAY tổng hợp -->');
        chHtml = chHtml.replace('<input type="radio" name="payment_method" value="VNPAY" checked>', '<input type="radio" name="payment_method" value="VNPAY">');
        fs.writeFileSync(checkoutHtmlPath, chHtml, 'utf-8');
        console.log('Updated checkout.html with SePay option');
    }
}
