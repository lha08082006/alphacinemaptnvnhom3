const { execFileSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifactDir = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\6cce9485-fc3d-42e6-9aa1-7b012193f601';

const states = [
  { name: '1_paid', demo: 'paid', label: '1. Thanh toán thành công (có vé điện tử & mã QR)' },
  { name: '2_pending_verify', demo: 'pending_verify', label: '2. Đang xác minh giao dịch (hướng dẫn đối soát)' },
  { name: '3_failed', demo: 'failed', label: '3. Thanh toán thất bại' },
  { name: '4_expired', demo: 'expired', label: '4. Hết hạn giữ ghế' },
  { name: '5_refund_pending', demo: 'refund_pending', label: '5. Đã tạo lệnh hoàn tiền (thời gian dự kiến theo thẻ)' },
  { name: '6_refunded', demo: 'refunded', label: '6. Đã hoàn tiền thành công' },
  { name: '7_guest_lookup', demo: 'lookup', label: '7. Xác thực quyền xem đơn (Tra cứu Email / SĐT)' }
];

console.log('Bắt đầu chụp ảnh màn hình cho từng trạng thái...');

for (const state of states) {
  const tmpFile = path.join(os.tmpdir(), `result_${state.name}.png`);
  const destFile = path.join(artifactDir, `result_${state.name}.png`);

  try {
    execFileSync(edgePath, [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--window-size=1200,1050',
      '--virtual-time-budget=2000',
      `--screenshot=${tmpFile}`,
      `file:///d:/web/beta-cinemas-demo/result.html?demo=${state.demo}`
    ]);

    if (fs.existsSync(tmpFile)) {
      fs.copyFileSync(tmpFile, destFile);
      const stat = fs.statSync(destFile);
      console.log(`[OK] ${state.label} -> ${destFile} (${stat.size} bytes)`);
    } else {
      console.error(`[FAIL] Không tạo được ảnh: ${tmpFile}`);
    }
  } catch (err) {
    console.error(`[ERROR] ${state.name}:`, err.message);
  }
}

console.log('Hoàn thành chụp ảnh màn hình nghiệm thu!');
