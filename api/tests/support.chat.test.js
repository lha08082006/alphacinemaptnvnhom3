'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const knex = require('../src/db/knex');
const clock = require('../src/lib/clock');
const supportBotService = require('../src/services/supportBotService');
const aiProvider = require('../src/services/aiProvider');
const supportRouter = require('../src/routes/support');

describe('AI Support Agent - Unit & Integration Tests (Function Calling & Safety)', () => {
  let app;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(() => {
    supportBotService._resetSessions();
    if (supportRouter._resetChatRateLimits) {
      supportRouter._resetChatRateLimits();
    }
  });

  afterAll(async () => {
    await knex.destroy();
  });

  describe('Safety & Forbidden Tools Constraints', () => {
    it('TUYỆT ĐỐI KHÔNG chứa tool duyệt hoàn tiền, đổi trạng thái đơn, hoặc sửa số tiền', () => {
      const toolNames = Object.keys(supportBotService.TOOL_MAP);
      expect(toolNames).toContain('lookup_order');
      expect(toolNames).toContain('get_refund_status');
      expect(toolNames).toContain('create_ticket');
      expect(toolNames).toContain('get_ticket_status');
      expect(toolNames).toContain('search_faq');
      expect(toolNames).toContain('handoff_to_human');

      expect(toolNames).not.toContain('approve_refund');
      expect(toolNames).not.toContain('refund_order');
      expect(toolNames).not.toContain('change_order_status');
      expect(toolNames).not.toContain('update_order_status');
      expect(toolNames).not.toContain('edit_amount');
      expect(toolNames).not.toContain('update_amount');
      expect(toolNames.length).toBe(6);
    });
  });

  describe('Tool Unit Tests (TOOL_MAP)', () => {
    it('lookup_order: trả thông tin hợp lệ và gán session.verifiedOrderId khi khớp mã đơn và email', async () => {
      const session = supportBotService.getOrCreateSession('test_lookup_valid');
      const res = await supportBotService.TOOL_MAP.lookup_order(
        { order_code: 'BC-DEMO-PAID-01', contact: 'khach@demo.vn' },
        session
      );

      expect(res.found).toBe(true);
      expect(res.order_id).toBe('BC-DEMO-PAID-01');
      expect(res.friendly_status).toBe('đã có vé');
      expect(session.verifiedOrderId).toBe('BC-DEMO-PAID-01');
    });

    it('lookup_order: trả thông báo an toàn, không tìm thấy khi sai thông tin liên hệ và không gán verifiedOrderId', async () => {
      const session = supportBotService.getOrCreateSession('test_lookup_mismatch');
      const res = await supportBotService.TOOL_MAP.lookup_order(
        { order_code: 'BC-DEMO-PAID-01', contact: '0999999999' },
        session
      );

      expect(res.found).toBe(false);
      expect(res.message).toMatch(/Không tìm thấy thông tin đơn hàng/i);
      expect(session.verifiedOrderId).toBeNull();
    });

    it('lookup_order: trả cùng thông báo an toàn khi mã đơn không tồn tại (chống dò quét đơn)', async () => {
      const session = supportBotService.getOrCreateSession('test_lookup_not_exist');
      const res = await supportBotService.TOOL_MAP.lookup_order(
        { order_code: 'BC-NON-EXISTENT-99', contact: 'khach@demo.vn' },
        session
      );

      expect(res.found).toBe(false);
      expect(res.message).toMatch(/Không tìm thấy thông tin đơn hàng/i);
      expect(session.verifiedOrderId).toBeNull();
    });

    it('get_refund_status: yêu cầu xác thực đơn nếu session chưa xác thực', async () => {
      const session = supportBotService.getOrCreateSession('test_refund_unverified');
      const res = await supportBotService.TOOL_MAP.get_refund_status({}, session);

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/Chưa có đơn hàng nào được xác thực/i);
    });

    it('get_refund_status: trả thời gian dự kiến đúng theo quy định khi đã xác thực đơn', async () => {
      const session = supportBotService.getOrCreateSession('test_refund_verified');
      session.verifiedOrderId = 'BC-DEMO-REFUNDED-04';

      const res = await supportBotService.TOOL_MAP.get_refund_status({}, session);

      expect(res.ok).toBe(true);
      expect(res.standard_rules.international_card).toContain('30 ngày làm việc');
      expect(res.standard_rules.domestic_atm).toContain('7 ngày làm việc');
      expect(res.standard_rules.e_wallet).toContain('7-14 ngày làm việc');
    });

    it('create_ticket: từ chối nếu chưa xác thực đơn hàng', async () => {
      const session = supportBotService.getOrCreateSession('test_ticket_unverified');
      const res = await supportBotService.TOOL_MAP.create_ticket(
        { issue_type: 'DEBITED_NO_TICKET', description: 'Trừ tiền nhưng chưa có vé' },
        session
      );

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/sau khi đã xác thực/i);
    });

    it('create_ticket: tạo ticket thành công với source="BOT" và SLA 24h khi trong hạn 60 phút sau thanh toán', async () => {
      const session = supportBotService.getOrCreateSession('test_ticket_valid');
      session.verifiedOrderId = 'BC-DEMO-HANGING-03';

      const res = await supportBotService.TOOL_MAP.create_ticket(
        { issue_type: 'DEBITED_NO_TICKET', description: 'Đã bị trừ tiền nhưng không nhận được vé' },
        session
      );

      expect(res.ok).toBe(true);
      expect(res.ticket_id).toBeDefined();
      expect(res.status).toBe('NEW');
      expect(res.is_rejected).toBe(false);
      expect(session.createdTicket).toBeDefined();

      // Kiểm tra database
      const dbTicket = await knex('support_tickets').where({ ticket_id: res.ticket_id }).first();
      expect(dbTicket).toBeDefined();
      expect(dbTicket.source).toBe('BOT');
      expect(dbTicket.issue_type).toBe('DEBITED_NO_TICKET');
    });

    it('create_ticket: gắn trạng thái REJECTED nếu quá hạn 60 phút sau thanh toán', async () => {
      const session = supportBotService.getOrCreateSession('test_ticket_expired_window');
      // Đơn BC-DEMO-PAID-01 tạo cách đây 24 giờ (> 60 phút)
      session.verifiedOrderId = 'BC-DEMO-PAID-01';

      const res = await supportBotService.TOOL_MAP.create_ticket(
        { issue_type: 'TICKET_NOT_RECEIVED', description: 'Khiếu nại muộn' },
        session
      );

      expect(res.ok).toBe(true);
      expect(res.status).toBe('REJECTED');
      expect(res.is_rejected).toBe(true);
      expect(res.message).toMatch(/quá thời hạn 60 phút/i);
    });

    it('get_ticket_status: tra cứu đúng khi mã ticket khớp liên hệ', async () => {
      const session = supportBotService.getOrCreateSession('test_ticket_status');
      // Dùng ticket vừa tạo từ BC-DEMO-HANGING-03
      const ticket = await knex('support_tickets').where({ order_id: 'BC-DEMO-HANGING-03' }).first();
      expect(ticket).toBeDefined();

      const res = await supportBotService.TOOL_MAP.get_ticket_status(
        { ticket_code: ticket.ticket_id, contact: '0912345678' },
        session
      );

      expect(res.found).toBe(true);
      expect(res.ticket_id).toBe(ticket.ticket_id);
      expect(res.issue_type).toBe('DEBITED_NO_TICKET');
    });

    it('search_faq: tìm kiếm câu hỏi thường gặp từ faq.json', async () => {
      const res = await supportBotService.TOOL_MAP.search_faq({ query: 'hoàn tiền mất bao lâu' });
      expect(res.found).toBe(true);
      expect(res.results.length).toBeGreaterThan(0);
      expect(res.results[0].answer).toBeDefined();
    });

    it('handoff_to_human: trả hotline 1900 636807 và email CSKH', async () => {
      const res = await supportBotService.TOOL_MAP.handoff_to_human({});
      expect(res.hotline).toBe('1900 636807');
      expect(res.email).toBe('cskh@betacinemas.vn');
      expect(res.working_hours).toContain('8:00 - 22:00');
    });
  });

  describe('Session Constraints (30 phút, tối đa 30 lượt)', () => {
    it('chặn tin nhắn và thông báo khi vượt quá 30 lượt tương tác mỗi phiên', async () => {
      const sessionId = 'test_max_turns_' + Date.now();
      const session = supportBotService.getOrCreateSession(sessionId);
      session.messageCount = 30; // Đã đạt giới hạn 30 lượt

      const res = await supportBotService.processUserMessage(sessionId, 'Xin chào');
      expect(res.reply).toMatch(/đạt giới hạn 30 lượt/i);
    });
  });

  describe('POST /api/v1/support/chat - Validation & Route Handling', () => {
    it('trả 400 nếu thiếu tin nhắn hoặc tin nhắn rỗng', async () => {
      const res = await request(app)
        .post('/api/v1/support/chat')
        .set('x-bypass-rate-limit', 'true')
        .send({ message: '' });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('trả 400 nếu tin nhắn vượt quá 500 ký tự', async () => {
      const longMessage = 'A'.repeat(501);
      const res = await request(app)
        .post('/api/v1/support/chat')
        .set('x-bypass-rate-limit', 'true')
        .send({ message: longMessage });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(JSON.stringify(res.body)).toMatch(/500 ký tự/i);
    });

    it('trả 429 RATE_LIMITED khi gửi liên tục quá tần suất cho phép', async () => {
      const testIp = '192.168.1.99';
      // Gửi 21 request không gắn cờ bypass
      for (let i = 0; i < 20; i++) {
        await request(app)
          .post('/api/v1/support/chat')
          .set('X-Forwarded-For', testIp)
          .send({ message: 'Kiểm tra' });
      }

      const rateLimitedRes = await request(app)
        .post('/api/v1/support/chat')
        .set('X-Forwarded-For', testIp)
        .send({ message: 'Kiểm tra lần 21' });

      expect(rateLimitedRes.status).toBe(429);
      expect(rateLimitedRes.body.ok).toBe(false);
    });

    it('trả câu dự phòng kèm hotline khi xảy ra sự cố gọi mô hình hoặc timeout', async () => {
      // Giả lập lỗi từ sendUserMessage
      const originalSend = aiProvider.sendUserMessage;
      aiProvider.sendUserMessage = jest.fn().mockRejectedValue(new Error('TIMEOUT_20S'));

      try {
        const res = await request(app)
          .post('/api/v1/support/chat')
          .set('x-bypass-rate-limit', 'true')
          .send({ session_id: 'test_err_session', message: 'Tôi cần hỗ trợ đơn hàng' });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.reply).toMatch(/1900 636807/);
        expect(res.body.reply).toMatch(/cskh@betacinemas.vn/);
      } finally {
        aiProvider.sendUserMessage = originalSend;
      }
    });

    it('hoàn thành lượt chat thành công và trả đúng định dạng { reply, ticket? }', async () => {
      const originalSend = aiProvider.sendUserMessage;
      aiProvider.sendUserMessage = jest.fn().mockResolvedValue({
        text: 'Chào Quý khách! Em là Beta Bot, trợ lý chăm sóc khách hàng của Beta Cinemas. Em có thể hỗ trợ gì cho Quý khách ạ?',
        functionCalls: [],
      });

      try {
        const res = await request(app)
          .post('/api/v1/support/chat')
          .set('x-bypass-rate-limit', 'true')
          .send({ session_id: 'test_normal_session', message: 'Xin chào Beta Bot' });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.reply).toContain('Beta Bot');
        expect(res.body.ticket).toBeNull();
      } finally {
        aiProvider.sendUserMessage = originalSend;
      }
    });
  });
});
