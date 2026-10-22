'use strict';

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '../index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// 1. CSS for Support Chat
const oldCssBlock = `/* === Style from support.html (support) === */
.support-container { max-width: 800px; margin: 40px auto; display: flex; gap: 30px; }
        .support-box { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); flex: 1; }
        .chat-box { flex: 1; background: #f9f9f9; border-radius: 8px; border: 1px solid #ddd; display: flex; flex-direction: column; }
        .chat-header { background: var(--beta-blue); color: white; padding: 15px; font-weight: bold; border-radius: 8px 8px 0 0; }
        .chat-body { padding: 15px; flex: 1; min-height: 250px; font-size: 14px; overflow-y: auto; }
        .chat-msg { margin-bottom: 15px; padding: 10px; border-radius: 8px; max-width: 85%; }
        .chat-msg.bot { background: #e3f2fd; align-self: flex-start; }
        
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; font-weight: bold; margin-bottom: 5px; color: #555; }
        .form-control { width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 15px; }
        
        .alert-box { padding: 15px; border-radius: 4px; margin-top: 20px; font-weight: bold; display: none; line-height: 1.5; }
        .alert-info { background: #e3f2fd; color: #1976d2; border: 1px solid #bbdefb; }
        .alert-success { background: #e8f5e9; color: #388e3c; border: 1px solid #c8e6c9; }
        .alert-warning { background: #fff3e0; color: #f57c00; border: 1px solid #ffe0b2; }`;

const newCssBlock = `/* === Style from support.html (support) - NÂNG CẤP CHATBOT AI AGENT === */
:root {
  --beta-blue: #0B4C9B;
  --beta-orange: #F26A1E;
}
.support-container { max-width: 1050px; margin: 35px auto; display: flex; gap: 28px; align-items: stretch; }
@media (max-width: 768px) {
  .support-container { flex-direction: column; padding: 0 15px; }
}
.support-box { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 18px rgba(0,0,0,0.06); flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
.chat-box { flex: 1.25; background: #ffffff; border-radius: 10px; border: 1px solid #D5E2EE; box-shadow: 0 6px 24px rgba(11,76,155,0.08); display: flex; flex-direction: column; height: 580px; overflow: hidden; }
.chat-header { background: #0B4C9B !important; color: #ffffff !important; padding: 14px 18px; font-weight: 700; border-radius: 10px 10px 0 0; display: flex; justify-content: space-between; align-items: center; font-size: 15px; border-bottom: 2px solid #083873; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
.chat-header-title { display: flex; align-items: center; gap: 8px; color: #ffffff; }
.chat-header-dot { display: inline-block; width: 9px; height: 9px; background: #22C55E; border-radius: 50%; box-shadow: 0 0 6px #22C55E; }
.chat-header-badge { font-size: 11px; font-weight: 600; background: rgba(255,255,255,0.18); color: #ffffff; padding: 3px 8px; border-radius: 12px; letter-spacing: 0.3px; }
.chat-body { padding: 16px; flex: 1; min-height: 250px; font-size: 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; background: #F8FAFC; }
.chat-msg { padding: 11px 15px; border-radius: 12px; max-width: 86%; word-break: break-word; line-height: 1.55; font-size: 14px; position: relative; animation: fadeInMsg 0.25s ease-out; }
@keyframes fadeInMsg { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.chat-msg.bot { background: #EBF3FC; color: #14284B; border: 1px solid #D0E4FA; align-self: flex-start; border-bottom-left-radius: 3px; }
.chat-msg.bot .msg-sender { color: #0B4C9B; font-size: 11px; font-weight: 700; margin-bottom: 4px; }
.chat-msg.user { background: #F26A1E; color: #ffffff; align-self: flex-end; border-bottom-right-radius: 3px; box-shadow: 0 2px 8px rgba(242, 106, 30, 0.28); }
.chat-msg.user .msg-sender { color: rgba(255, 255, 255, 0.85); font-size: 11px; font-weight: 600; margin-bottom: 2px; text-align: right; }
.chat-msg.user .msg-content { color: #ffffff; }
.chat-inline-code { background: rgba(11,76,155,0.08); color: #0B4C9B; padding: 2px 5px; border-radius: 4px; font-family: monospace; font-size: 13px; }
.chat-bullet { margin-top: 4px; padding-left: 4px; }
.chat-divider { border: none; border-top: 1px dashed #CBD5E1; margin: 10px 0; }
.chat-ticket-card { margin-top: 10px; background: #ffffff; border: 1.5px solid #0B4C9B; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(11, 76, 155, 0.12); }
.ticket-card-header { background: #0B4C9B; color: #ffffff; padding: 9px 12px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 700; }
.ticket-badge { color: #ffffff; letter-spacing: 0.3px; }
.ticket-status-pill { background: #22C55E; color: #ffffff; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.ticket-status-pill.rejected { background: #EF4444; }
.ticket-card-body { padding: 10px 14px; font-size: 13px; display: flex; flex-direction: column; gap: 7px; }
.ticket-card-row { display: flex; justify-content: space-between; align-items: center; }
.ticket-label { color: #64748B; font-size: 12px; }
.ticket-val-code { font-family: monospace; font-size: 14px; font-weight: 700; color: #F26A1E; background: #FFF5EE; border: 1px dashed #FCD3B6; padding: 2px 8px; border-radius: 4px; cursor: pointer; transition: all 0.2s; }
.ticket-val-code:hover { background: #F26A1E; color: #ffffff; }
.ticket-val-text { font-weight: 600; color: #1E293B; }
.ticket-val-sla { font-weight: 700; color: #0B4C9B; }
.ticket-card-footer { background: #F8FAFC; padding: 7px 12px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #64748B; font-style: italic; }
.chat-quick-actions { display: flex; gap: 8px; padding: 8px 14px; background: #ffffff; border-top: 1px solid #EDF2F7; overflow-x: auto; white-space: nowrap; scrollbar-width: none; }
.chat-quick-actions::-webkit-scrollbar { display: none; }
.chat-quick-btn { background: #FFF5EE; color: #F26A1E; border: 1px solid #FCD3B6; border-radius: 16px; padding: 5px 12px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; }
.chat-quick-btn:hover { background: #F26A1E; color: #ffffff; border-color: #F26A1E; transform: translateY(-1px); }
.chat-footer { padding: 10px 14px; border-top: 1px solid #E2E8F0; background: #ffffff; border-radius: 0 0 10px 10px; }
.chat-input-wrapper { display: flex; gap: 8px; align-items: center; }
.chat-input { flex: 1; padding: 10px 14px; border: 1px solid #CBD5E1; border-radius: 20px; font-size: 14px; outline: none; transition: all 0.2s; background: #ffffff; }
.chat-input:focus { border-color: #F26A1E; box-shadow: 0 0 0 2px rgba(242, 106, 30, 0.15); }
.chat-send-btn { background: #F26A1E; color: #ffffff; border: none; border-radius: 20px; padding: 9px 18px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; flex-shrink: 0; box-shadow: 0 2px 6px rgba(242, 106, 30, 0.25); }
.chat-send-btn:hover:not(:disabled) { background: #D9560E; transform: translateY(-1px); }
.chat-send-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.chat-msg.typing .typing-indicator { display: inline-flex; align-items: center; gap: 5px; padding: 4px 0; }
.chat-msg.typing .typing-indicator span:not(.typing-text) { display: inline-block; width: 7px; height: 7px; background: #0B4C9B; border-radius: 50%; animation: typingBounce 1.2s infinite ease-in-out; }
.chat-msg.typing .typing-indicator span:nth-child(1) { animation-delay: 0s; }
.chat-msg.typing .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.chat-msg.typing .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
.typing-text { margin-left: 6px; font-style: italic; color: #64748B; font-size: 13px; }
@keyframes typingBounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-5px); opacity: 1; } }
.chat-msg.error-state { background: #FEF2F2; color: #991B1B; border: 1px solid #FECACA; }
.chat-hotline-box { margin-top: 8px; padding: 8px 12px; background: #ffffff; border-radius: 6px; border: 1px solid #FECACA; font-size: 13px; line-height: 1.6; }
.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-weight: bold; margin-bottom: 5px; color: #555; }
.form-control { width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 15px; }
.alert-box { padding: 15px; border-radius: 4px; margin-top: 20px; font-weight: bold; display: none; line-height: 1.5; }
.alert-info { background: #e3f2fd; color: #1976d2; border: 1px solid #bbdefb; }
.alert-success { background: #e8f5e9; color: #388e3c; border: 1px solid #c8e6c9; }
.alert-warning { background: #fff3e0; color: #f57c00; border: 1px solid #ffe0b2; }`;

// Chuẩn hóa dòng để so khớp không phụ thuộc CRLF
const normalizeNewlines = (str) => str.replace(/\r\n/g, '\n');

let normHtml = normalizeNewlines(html);
let normOldCss = normalizeNewlines(oldCssBlock);

if (normHtml.includes(normOldCss)) {
  normHtml = normHtml.replace(normOldCss, newCssBlock);
  console.log('✓ Successfully replaced CSS block');
} else {
  console.warn('⚠️ Could not match exact CSS block, trying fallback');
  const idx = normHtml.indexOf('/* === Style from support.html');
  const endIdx = normHtml.indexOf('/* === Style from promotion-detail.html', idx);
  if (idx !== -1 && endIdx !== -1) {
    normHtml = normHtml.slice(0, idx) + newCssBlock + '\n\n' + normHtml.slice(endIdx);
    console.log('✓ Replaced CSS via boundary slice');
  }
}

// 2. HTML for Chat Box
const oldChatBox = `<div class="chat-box">
                <div class="chat-header">🎧 Chat Hỗ Trợ Tự Động</div>
                <div class="chat-body" style="display: flex; flex-direction: column;">
                    <div class="chat-msg bot">
                        <strong>Beta Bot:</strong> Xin chào, tôi có thể giúp gì cho bạn?<br><br>
                        Nếu bạn thanh toán bị lỗi, hãy điền form bên trái nhé!
                    </div>
                </div>
                <div style="padding: 10px; border-top: 1px solid #ddd; background: white; border-radius: 0 0 8px 8px;">
                    <input type="text" class="form-control" placeholder="Nhập tin nhắn..." disabled style="background: #eee;">
                </div>
            </div>`;

const newChatBox = `<div class="chat-box">
                <div class="chat-header">
                    <div class="chat-header-title">
                        <span class="chat-header-dot"></span>
                        <span>🎧 Chat Hỗ Trợ Tự Động</span>
                    </div>
                    <span class="chat-header-badge">Beta Bot 24/7</span>
                </div>
                <div class="chat-body" id="support-chat-body">
                    <div class="chat-msg bot">
                        <div class="msg-sender">🤖 Beta Bot</div>
                        <div class="msg-content">
                            Xin chào Quý khách! Em là <strong>Beta Bot</strong> - Trợ lý CSKH tự động của Beta Cinemas.<br><br>
                            Em có thể hỗ trợ Quý khách tra cứu đơn hàng, kiểm tra tiến độ hoàn tiền hoặc tiếp nhận phiếu khiếu nại (ticket) khi gặp sự cố trừ tiền chưa có vé.<br><br>
                            Quý khách có thể chọn nhanh các gợi ý bên dưới hoặc nhắn trực tiếp cho em nhé!
                        </div>
                    </div>
                </div>
                <!-- 3 nút gợi ý nhanh -->
                <div class="chat-quick-actions" id="chat-quick-actions">
                    <button type="button" class="chat-quick-btn" onclick="sendQuickMessage('Tôi bị trừ tiền chưa có vé')">⚡ Tôi bị trừ tiền chưa có vé</button>
                    <button type="button" class="chat-quick-btn" onclick="sendQuickMessage('Kiểm tra hoàn tiền')">⚡ Kiểm tra hoàn tiền</button>
                    <button type="button" class="chat-quick-btn" onclick="sendQuickMessage('Theo dõi khiếu nại')">⚡ Theo dõi khiếu nại</button>
                </div>
                <!-- Khung nhập tin nhắn -->
                <div class="chat-footer">
                    <div class="chat-input-wrapper">
                        <input type="text" id="support-chat-input" class="chat-input" placeholder="Nhập tin nhắn hỗ trợ (nhấn Enter để gửi)..." maxlength="500" autocomplete="off">
                        <button type="button" id="support-chat-send-btn" class="chat-send-btn" onclick="handleSupportChatSend()">
                            <span>Gửi</span>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        </button>
                    </div>
                </div>
            </div>`;

let normOldChat = normalizeNewlines(oldChatBox);
if (normHtml.includes(normOldChat)) {
  normHtml = normHtml.replace(normOldChat, newChatBox);
  console.log('✓ Successfully replaced Chat Box HTML');
} else {
  console.warn('⚠️ Could not match exact Chat Box HTML, trying substring');
  const chatStart = normHtml.indexOf('<div class="chat-box">');
  const chatEnd = normHtml.indexOf('</div>\n        </div>\n    </div>', chatStart);
  if (chatStart !== -1 && chatEnd !== -1) {
    normHtml = normHtml.slice(0, chatStart) + newChatBox + normHtml.slice(chatEnd);
    console.log('✓ Replaced Chat Box HTML via substring slice');
  }
}

// 3. Script tag
if (!normHtml.includes('js/support-chat.js')) {
  normHtml = normHtml.replace('</body>', '    <script src="js/support-chat.js"></script>\n</body>');
  console.log('✓ Successfully injected script tag js/support-chat.js');
}

fs.writeFileSync(indexPath, normHtml, 'utf8');
console.log('Done patching index.html!');
