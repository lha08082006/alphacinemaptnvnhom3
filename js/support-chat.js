// js/support-chat.js
'use strict';

/**
 * Module quản lý khung Chat Hỗ Trợ Tự Động (AI Agent - Beta Bot)
 * Nối với POST http://127.0.0.1:3000/api/v1/support/chat (có dự phòng cổng 4000).
 */

(function () {
  const SESSION_STORAGE_KEY = 'beta_support_session_id';
  const API_ENDPOINT_3000 = 'http://127.0.0.1:3000/api/v1/support/chat';
  const API_ENDPOINT_4000 = 'http://127.0.0.1:4000/api/v1/support/chat';

  let isSending = false;

  /**
   * Lấy hoặc tạo mới session_id trong sessionStorage
   */
  function getSessionId() {
    let sid = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sid) {
      sid = 'web_session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
    }
    return sid;
  }

  /**
   * Tự động cuộn khung chat xuống tin nhắn mới nhất
   */
  function scrollToBottom() {
    const chatBody = document.getElementById('support-chat-body');
    if (chatBody) {
      chatBody.scrollTop = chatBody.scrollHeight;
    }
  }

  /**
   * Chuyển đổi định dạng văn bản markdown cơ bản thành HTML an toàn
   */
  function formatBotText(rawText) {
    if (!rawText) return '';
    let text = rawText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // In đậm **text**
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Code `code`
    text = text.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');

    // Dấu gạch ngang / bullet lists
    text = text.replace(/^\s*[\*\-]\s+(.+)$/gm, '<div class="chat-bullet">• $1</div>');

    // Dòng kẻ ngang ---
    text = text.replace(/^---$/gm, '<hr class="chat-divider">');

    // Xuống dòng
    text = text.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');

    return text;
  }

  /**
   * Định dạng thời gian SLA sang tiếng Việt
   */
  function formatSlaDate(isoStr) {
    if (!isoStr) return 'Trong vòng 24 giờ';
    try {
      const d = new Date(isoStr);
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${hours}:${mins} ngày ${day}/${month}/${year}`;
    } catch {
      return isoStr;
    }
  }

  /**
   * Hiển thị chỉ báo "Beta Bot đang nhập..."
   */
  function showTypingIndicator() {
    hideTypingIndicator();
    const chatBody = document.getElementById('support-chat-body');
    if (!chatBody) return;

    const typingEl = document.createElement('div');
    typingEl.id = 'support-chat-typing';
    typingEl.className = 'chat-msg bot typing';
    typingEl.innerHTML = `
      <div class="msg-sender">🤖 Beta Bot</div>
      <div class="typing-indicator">
        <span></span><span></span><span></span>
        <span class="typing-text">Beta Bot đang nhập...</span>
      </div>
    `;
    chatBody.appendChild(typingEl);
    scrollToBottom();
  }

  /**
   * Ẩn chỉ báo typing
   */
  function hideTypingIndicator() {
    const el = document.getElementById('support-chat-typing');
    if (el) el.remove();
  }

  /**
   * Thêm tin nhắn của Khách hàng vào khung chat
   */
  function appendUserMessage(text) {
    const chatBody = document.getElementById('support-chat-body');
    if (!chatBody) return;

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg user';
    msgEl.innerHTML = `
      <div class="msg-sender">👤 Bạn</div>
      <div class="msg-content">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    `;
    chatBody.appendChild(msgEl);
    scrollToBottom();
  }

  /**
   * Thêm tin nhắn của Beta Bot vào khung chat (kèm Ticket nếu có)
   */
  function appendBotMessage(replyText, ticket) {
    const chatBody = document.getElementById('support-chat-body');
    if (!chatBody) return;

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg bot';

    let html = `
      <div class="msg-sender">🤖 Beta Bot</div>
      <div class="msg-content">${formatBotText(replyText)}</div>
    `;

    // Yêu cầu 4: Khi API trả ticket, hiển thị thẻ gồm mã ticket và hạn xử lý
    if (ticket && ticket.ticket_id) {
      const isRejected = ticket.is_rejected || ticket.status === 'REJECTED';
      html += `
        <div class="chat-ticket-card">
          <div class="ticket-card-header">
            <span class="ticket-badge">🎫 PHIẾU HỖ TRỢ (TICKET)</span>
            <span class="ticket-status-pill ${isRejected ? 'rejected' : ''}">
              ${ticket.status_label || (isRejected ? 'Từ chối (Quá hạn)' : 'Mới (Đã tiếp nhận)')}
            </span>
          </div>
          <div class="ticket-card-body">
            <div class="ticket-card-row">
              <span class="ticket-label">Mã phiếu:</span>
              <span class="ticket-val-code" title="Bấm để sao chép" onclick="navigator.clipboard.writeText('${ticket.ticket_id}'); alert('Đã sao chép mã ticket: ${ticket.ticket_id}');">${ticket.ticket_id} 📋</span>
            </div>
            ${ticket.order_id ? `
            <div class="ticket-card-row">
              <span class="ticket-label">Mã đơn hàng:</span>
              <span class="ticket-val-text">${ticket.order_id}</span>
            </div>` : ''}
            <div class="ticket-card-row">
              <span class="ticket-label">Hạn xử lý dự kiến:</span>
              <span class="ticket-val-sla">${formatSlaDate(ticket.sla_due_at)}</span>
            </div>
          </div>
          <div class="ticket-card-footer">
            Đội ngũ CSKH Beta Cinemas sẽ kiểm tra và phản hồi Quý khách theo thời hạn trên.
          </div>
        </div>
      `;
    }

    msgEl.innerHTML = html;
    chatBody.appendChild(msgEl);
    scrollToBottom();
  }

  /**
   * Thêm tin nhắn cảnh báo lỗi kết nối kèm hotline 1900 636807
   */
  function appendErrorMessage(customMsg) {
    const chatBody = document.getElementById('support-chat-body');
    if (!chatBody) return;

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg bot error-state';
    msgEl.innerHTML = `
      <div class="msg-sender">⚠️ Hỗ trợ khẩn cấp</div>
      <div class="msg-content">
        ${customMsg || 'Hiện tại không thể kết nối tới máy chủ trợ lý CSKH.'}<br><br>
        Quý khách vui lòng thử lại hoặc liên hệ trực tiếp bộ phận CSKH để được hỗ trợ tức thì:
        <div class="chat-hotline-box">
          📞 <strong>Hotline:</strong> <a href="tel:1900636807" style="color: #0B4C9B; font-weight: bold; font-size: 15px;">1900 636807</a> (8:00 - 22:00)<br>
          ✉️ <strong>Email:</strong> <a href="mailto:cskh@betacinemas.vn" style="color: #0B4C9B;">cskh@betacinemas.vn</a>
        </div>
      </div>
    `;
    chatBody.appendChild(msgEl);
    scrollToBottom();
  }

  /**
   * Gửi tin nhắn tới backend API với cơ chế tự động chuyển cổng (3000 -> 4000)
   */
  async function callChatApi(sessionId, message) {
    const payload = JSON.stringify({ session_id: sessionId, message });

    async function sendToUrl(url) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000); // 25s timeout
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: payload,
          signal: controller.signal,
        });
        clearTimeout(timer);
        return response;
      } catch (err) {
        clearTimeout(timer);
        throw err;
      }
    }

    let res = null;
    try {
      // 1. Thử gọi cổng 3000 theo yêu cầu đề bài
      res = await sendToUrl(API_ENDPOINT_3000);
    } catch (err3000) {
      // 2. Nếu cổng 3000 không mở hoặc lỗi mạng -> tự động thử cổng 4000 của server
      try {
        res = await sendToUrl(API_ENDPOINT_4000);
      } catch (err4000) {
        throw new Error('NETWORK_FAILED');
      }
    }

    if (!res) {
      throw new Error('NO_RESPONSE');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      const msg = data.error?.message || data.message || `Lỗi máy chủ (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }

    // Trả về { reply, ticket }
    return {
      reply: data.reply || (data.data && data.data.reply) || 'Em đã tiếp nhận yêu cầu.',
      ticket: data.ticket || (data.data && data.data.ticket) || null,
    };
  }

  /**
   * Xử lý luồng gửi tin nhắn của người dùng
   */
  async function sendMessage(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || isSending) return;

    const inputEl = document.getElementById('support-chat-input');
    const sendBtn = document.getElementById('support-chat-send-btn');

    isSending = true;
    if (inputEl) {
      inputEl.value = '';
      inputEl.disabled = true;
    }
    if (sendBtn) {
      sendBtn.disabled = true;
    }

    // 1. Hiển thị tin nhắn người dùng
    appendUserMessage(trimmed);

    // 2. Hiển thị "Beta Bot đang nhập..."
    showTypingIndicator();

    const sessionId = getSessionId();

    try {
      // 3. Gọi API
      const result = await callChatApi(sessionId, trimmed);
      hideTypingIndicator();
      appendBotMessage(result.reply, result.ticket);
    } catch (err) {
      hideTypingIndicator();
      if (err.message === 'NETWORK_FAILED' || err.name === 'AbortError') {
        appendErrorMessage('Không thể kết nối đến máy chủ hỗ trợ. Vui lòng kiểm tra lại kết nối mạng hoặc đảm bảo backend API đang chạy.');
      } else {
        appendErrorMessage(err.message);
      }
    } finally {
      // 4. Mở lại nút gửi và ô nhập, không để khung chat bị treo
      isSending = false;
      if (inputEl) {
        inputEl.disabled = false;
        inputEl.focus();
      }
      if (sendBtn) {
        sendBtn.disabled = false;
      }
    }
  }

  /**
   * Gửi gợi ý nhanh khi click vào 1 trong 3 nút gợi ý
   */
  window.sendQuickMessage = function (text) {
    sendMessage(text);
  };

  /**
   * Xử lý sự kiện nhấn nút Gửi trong khung chat
   */
  window.handleSupportChatSend = function () {
    const inputEl = document.getElementById('support-chat-input');
    if (inputEl) {
      sendMessage(inputEl.value);
    }
  };

  /**
   * Xử lý form bên trái: Nút "GỬI YÊU CẦU TRA SOÁT"
   * Gửi mã đơn và email/SĐT vào cùng session chat để bot biết đơn đã xác thực, rồi hiện kết quả trong khung chat.
   */
  window.submitSupport = function () {
    const orderEl = document.getElementById('txt-order');
    const contactEl = document.getElementById('txt-contact');
    const alertEl = document.getElementById('result-alert');

    const orderCode = orderEl ? orderEl.value.trim() : '';
    const contact = contactEl ? contactEl.value.trim() : '';

    if (!orderCode || !contact) {
      if (alertEl) {
        alertEl.className = 'alert-box alert-warning';
        alertEl.style.display = 'block';
        alertEl.innerHTML = '⚠️ Quý khách vui lòng nhập đầy đủ <strong>Mã đơn hàng / Mã giao dịch</strong> và <strong>Email hoặc Số điện thoại</strong> để tra soát.';
      }
      return;
    }

    if (alertEl) {
      alertEl.className = 'alert-box alert-info';
      alertEl.style.display = 'block';
      alertEl.innerHTML = '⏳ Đang chuyển thông tin sang <strong>Beta Bot</strong> để xác thực và tra soát giao dịch...';
    }

    // Soạn tin nhắn tự nhiên để kích hoạt tool lookup_order trong cùng session
    const promptMsg = `Kiểm tra giúp tôi đơn hàng ${orderCode}, thông tin liên hệ của tôi là ${contact}`;

    // Gửi tin nhắn vào khung chat
    sendMessage(promptMsg).then(() => {
      if (alertEl) {
        alertEl.className = 'alert-box alert-success';
        alertEl.style.display = 'block';
        alertEl.innerHTML = '✓ Đã gửi yêu cầu tra soát! Vui lòng xem phản hồi từ <strong>Beta Bot</strong> ở khung chat bên phải.';
      }
    });

    // Cuộn nhẹ tới khung chat nếu trên thiết bị màn hình nhỏ
    const chatBox = document.querySelector('.chat-box');
    if (chatBox && window.innerWidth <= 768) {
      chatBox.scrollIntoView({ behavior: 'smooth' });
    }
  };

  /**
   * Lắng nghe phím Enter trong ô nhập tin nhắn
   */
  function initChatEvents() {
    const inputEl = document.getElementById('support-chat-input');
    if (inputEl) {
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          window.handleSupportChatSend();
        }
      });
    }
  }

  // Khởi tạo sự kiện khi trang tải xong
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatEvents);
  } else {
    initChatEvents();
  }
})();
