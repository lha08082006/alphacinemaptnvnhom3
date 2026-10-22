'use strict';

/**
 * Script kiểm thử Chatbot CSKH Beta Cinemas qua Terminal.
 * Chạy bằng lệnh: npm run chat-test
 */

const readline = require('readline');
const http = require('http');
const supportBotService = require('../services/supportBotService');
const clock = require('../lib/clock');

const PORT = process.env.PORT || 4000;
const SESSION_ID = 'test_session_' + Date.now();

console.log('='.repeat(70));
console.log('🤖 CHATBOT CSKH BETA CINEMAS - TEST TERMINAL (AI AGENT)');
console.log('='.repeat(70));
console.log('Danh sách đơn hàng mẫu có sẵn trong database:');
console.log('  1. Đơn thành công (Có vé)       : BC-DEMO-PAID-01      (Email: khach@demo.vn, SĐT: 0912345678)');
console.log('  2. Đơn đang xác minh             : BC-DEMO-VERIFY-02    (Email: khach@demo.vn, SĐT: 0912345678)');
console.log('  3. Đơn trừ tiền chưa có vé (Treo): BC-DEMO-HANGING-03   (Email: khach@demo.vn, SĐT: 0912345678)');
console.log('  4. Đơn đã hoàn tiền              : BC-DEMO-REFUNDED-04  (Email: khach@demo.vn, SĐT: 0912345678)');
console.log('-'.repeat(70));
console.log('Gợi ý 3 kịch bản kiểm thử nhanh:');
console.log('  [1] Kịch bản 1: Tra cứu đơn đúng thông tin (BC-DEMO-PAID-01)');
console.log('  [2] Kịch bản 2: Tra cứu sai thông tin liên hệ (Bảo mật)');
console.log('  [3] Kịch bản 3: Đơn trừ tiền chưa có vé & Khiếu nại tạo ticket (BC-DEMO-HANGING-03)');
console.log('  [exit] Thoát chương trình');
console.log('='.repeat(70));

// Gửi tin nhắn qua HTTP nếu server đang chạy, hoặc gọi trực tiếp service nếu server chưa bật
async function sendMessage(sessionId, message) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ session_id: sessionId, message });

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/v1/support/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 25000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.reply) {
              resolve(parsed);
            } else if (parsed.data && parsed.data.reply) {
              resolve(parsed.data);
            } else {
              resolve({ reply: parsed.message || (parsed.error && parsed.error.message) || body });
            }
          } catch {
            resolve({ reply: body });
          }
        });
      }
    );

    req.on('error', async () => {
      // Server HTTP chưa bật -> Chạy trực tiếp qua service nội bộ
      try {
        const directRes = await supportBotService.processUserMessage(sessionId, message);
        resolve(directRes);
      } catch (err) {
        resolve({ reply: 'Lỗi: ' + err.message });
      }
    });

    req.write(postData);
    req.end();
  });
}

async function runScenario(scenarioNum) {
  const scSession = 'scenario_' + scenarioNum + '_' + Date.now();

  if (scenarioNum === '1') {
    console.log('\n>>> ĐANG CHẠY KỊCH BẢN 1: TRA CỨU ĐƠN ĐÚNG THÔNG TIN');
    const msg = 'Kiểm tra giúp tôi đơn BC-DEMO-PAID-01, email của tôi là khach@demo.vn';
    console.log(`\n👤 Khách: ${msg}`);
    const res = await sendMessage(scSession, msg);
    console.log(`\n🤖 Beta Bot:\n${res.reply}\n`);
  } else if (scenarioNum === '2') {
    console.log('\n>>> ĐANG CHẠY KỊCH BẢN 2: TRA CỨU SAI THÔNG TIN LIÊN HỆ (BẢO MẬT)');
    const msg = 'Tra cứu đơn BC-DEMO-PAID-01, sđt là 0999888777';
    console.log(`\n👤 Khách: ${msg}`);
    const res = await sendMessage(scSession, msg);
    console.log(`\n🤖 Beta Bot:\n${res.reply}\n`);
  } else if (scenarioNum === '3') {
    console.log('\n>>> ĐANG CHẠY KỊCH BẢN 3: ĐƠN TRỪ TIỀN CHƯA CÓ VÉ & KHIẾU NẠI TẠO TICKET');
    
    // Bước 1: Tra cứu đơn treo
    const msg1 = 'Tôi vừa mua vé đơn BC-DEMO-HANGING-03 với sđt 0912345678, đã bị trừ tiền ngân hàng nhưng không thấy vé!';
    console.log(`\n👤 Khách (Bước 1): ${msg1}`);
    const res1 = await sendMessage(scSession, msg1);
    console.log(`\n🤖 Beta Bot:\n${res1.reply}\n`);

    // Bước 2: Yêu cầu tạo khiếu nại hoàn tiền
    const msg2 = 'Đúng rồi, hãy tạo khiếu nại hoàn tiền giúp tôi vì tài khoản đã bị trừ tiền mà không nhận được vé.';
    console.log(`\n👤 Khách (Bước 2): ${msg2}`);
    const res2 = await sendMessage(scSession, msg2);
    console.log(`\n🤖 Beta Bot:\n${res2.reply}\n`);
    if (res2.ticket) {
      console.log('🎫 THÔNG TIN TICKET ĐÃ TẠO:');
      console.log(JSON.stringify(res2.ticket, null, 2));
    }
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '\n👤 Khách: ',
});

// Chạy tự động nếu truyền cờ dòng lệnh
const argScenario = process.argv.find((a) => a.startsWith('--scenario='));
if (argScenario) {
  const num = argScenario.split('=')[1];
  runScenario(num).then(() => process.exit(0));
} else {
  rl.prompt();

  rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) {
      rl.prompt();
      return;
    }

    if (text.toLowerCase() === 'exit' || text.toLowerCase() === 'quit') {
      console.log('Tạm biệt Quý khách!');
      process.exit(0);
    }

    if (['1', '2', '3'].includes(text)) {
      await runScenario(text);
      rl.prompt();
      return;
    }

    // Chat tương tác tự do
    const res = await sendMessage(SESSION_ID, text);
    console.log(`\n🤖 Beta Bot:\n${res.reply}`);
    if (res.ticket) {
      console.log('\n🎫 Phiếu hỗ trợ (Ticket) tạo kèm theo:', JSON.stringify(res.ticket));
    }

    rl.prompt();
  });
}
