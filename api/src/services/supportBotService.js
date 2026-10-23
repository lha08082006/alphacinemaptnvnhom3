'use strict';

const fs = require('fs');
const path = require('path');
const knex = require('../db/knex');
const logger = require('../lib/logger');
const clock = require('../lib/clock');
const ids = require('../lib/ids');
const { REFUND_ESTIMATED_TIMES } = require('../config/constants');
const aiProvider = require('./aiProvider');

// 1. Tải System Prompt
function loadSystemPrompt() {
  const promptPaths = [
    path.join(__dirname, '../../prompts/support_agent.md'),
    path.join(__dirname, '../../../prompts/support_agent.md'),
    path.join(process.cwd(), 'prompts/support_agent.md'),
    path.join(process.cwd(), 'api/prompts/support_agent.md'),
  ];
  for (const p of promptPaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8');
    }
  }
  return 'Bạn là Beta Bot - Trợ lý CSKH của Beta Cinemas.';
}

// 2. Tải FAQ dữ liệu từ faq.json
function loadFaqData() {
  const faqPaths = [
    path.join(__dirname, '../../data/faq.json'),
    path.join(__dirname, '../../../data/faq.json'),
    path.join(process.cwd(), 'data/faq.json'),
    path.join(process.cwd(), 'api/data/faq.json'),
  ];
  for (const p of faqPaths) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch (e) {
        logger.error('failed_to_parse_faq_json', { error: e.message });
      }
    }
  }
  return [];
}

const FAQ_DATABASE = loadFaqData();
const SYSTEM_PROMPT = loadSystemPrompt();

// 3. Khai báo danh sách Tool (Function Declarations) cho AI
const TOOL_DECLARATIONS = [
  {
    name: 'lookup_order',
    description: 'Tra cứu thông tin đơn hàng và vé xem phim. Bắt buộc phải có cả mã đơn hàng (hoặc mã giao dịch) và thông tin liên hệ (email hoặc số điện thoại).',
    parameters: {
      type: 'OBJECT',
      properties: {
        order_code: {
          type: 'STRING',
          description: 'Mã đơn hàng (dạng BC...) hoặc mã giao dịch phía ngân hàng/cổng (dạng GW...)',
        },
        contact: {
          type: 'STRING',
          description: 'Email hoặc Số điện thoại của khách hàng đã dùng khi đặt đơn',
        },
      },
      required: ['order_code', 'contact'],
    },
  },
  {
    name: 'get_refund_status',
    description: 'Tra cứu trạng thái lệnh hoàn tiền và thời gian hoàn tiền dự kiến theo phương thức thanh toán của đơn hàng hiện tại.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'create_ticket',
    description: 'Tạo phiếu khiếu nại/yêu cầu hỗ trợ (ticket) cho đơn hàng đã xác thực. Phải xác nhận loại sự cố và mô tả chi tiết với khách trước khi gọi.',
    parameters: {
      type: 'OBJECT',
      properties: {
        issue_type: {
          type: 'STRING',
          description: 'Loại sự cố: DEBITED_NO_TICKET (Bị trừ tiền nhưng chưa có vé), DOUBLE_PAYMENT (Thanh toán hai lần), TICKET_NOT_RECEIVED (Chưa nhận được vé), SLOW_REFUND (Hoàn tiền chậm), OTHER (Khác)',
        },
        description: {
          type: 'STRING',
          description: 'Mô tả chi tiết nội dung sự cố khách hàng gặp phải',
        },
      },
      required: ['issue_type', 'description'],
    },
  },
  {
    name: 'get_ticket_status',
    description: 'Tra cứu trạng thái phiếu hỗ trợ (ticket) đã tạo bằng mã ticket kèm email hoặc số điện thoại.',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticket_code: {
          type: 'STRING',
          description: 'Mã phiếu hỗ trợ (dạng TK-...)',
        },
        contact: {
          type: 'STRING',
          description: 'Email hoặc số điện thoại dùng để tạo phiếu hỗ trợ',
        },
      },
      required: ['ticket_code', 'contact'],
    },
  },
  {
    name: 'search_faq',
    description: 'Tìm kiếm thông tin chính sách, điều khoản thanh toán, quy định độ tuổi, hủy/đổi vé từ tài liệu FAQ của rạp.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Từ khóa hoặc câu hỏi cần tra cứu chính sách',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'handoff_to_human',
    description: 'Chuyển tiếp cho nhân viên chăm sóc khách hàng (CSKH) khi khách hàng yêu cầu gặp người thật, giận dữ hoặc trường hợp phức tạp.',
    parameters: {
      type: 'OBJECT',
      properties: {
        reason: {
          type: 'STRING',
          description: 'Lý do cần chuyển tiếp nhân viên hỗ trợ',
        },
      },
    },
  },
];

// 4. Quản lý Session lưu ở Server
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 phút
const MAX_TURNS_PER_SESSION = 30; // Tối đa 30 lượt tin nhắn mỗi phiên
const sessionsMap = new Map();

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, s] of sessionsMap.entries()) {
    if (now - s.lastActiveAt > SESSION_TTL_MS) {
      sessionsMap.delete(id);
    }
  }
}

if (!process.env.VERCEL) {
  setInterval(cleanExpiredSessions, 10 * 60 * 1000).unref();
}

/**
 * Tải phiên chat từ cơ sở dữ liệu (phục vụ môi trường Serverless khi instance khởi động lại).
 */
async function loadPersistedSession(id) {
  try {
    const hasTable = await knex.schema.hasTable('support_chat_sessions');
    if (!hasTable) return null;
    const row = await knex('support_chat_sessions').where({ session_id: id }).first();
    if (!row) return null;
    if (Date.now() - Number(row.last_active_at) > SESSION_TTL_MS) return null;

    return {
      id: row.session_id,
      chat: aiProvider.createChatSession({
        systemInstruction: SYSTEM_PROMPT,
        tools: TOOL_DECLARATIONS,
        history: [],
      }),
      verifiedOrderId: row.verified_order_id || null,
      verifiedContact: row.verified_contact || null,
      messageCount: row.message_count || 0,
      createdTicket: row.created_ticket_json ? JSON.parse(row.created_ticket_json) : null,
      lastActiveAt: Number(row.last_active_at),
    };
  } catch (err) {
    logger.warn('load_persisted_session_failed', { id, cause: err.message });
    return null;
  }
}

/**
 * Lưu trạng thái phiên chat vào cơ sở dữ liệu Knex để phục hồi trên bất kỳ serverless instance nào.
 */
async function savePersistedSession(session) {
  try {
    if (!session || !session.id) return;
    const hasTable = await knex.schema.hasTable('support_chat_sessions');
    if (!hasTable) return;
    await knex('support_chat_sessions')
      .insert({
        session_id: session.id,
        verified_order_id: session.verifiedOrderId || null,
        verified_contact: session.verifiedContact || null,
        message_count: session.messageCount,
        created_ticket_json: session.createdTicket ? JSON.stringify(session.createdTicket) : null,
        last_active_at: session.lastActiveAt,
        created_at: new Date().toISOString(),
      })
      .onConflict('session_id')
      .merge(['verified_order_id', 'verified_contact', 'message_count', 'created_ticket_json', 'last_active_at']);
  } catch (err) {
    logger.warn('save_persisted_session_failed', { id: session.id, cause: err.message });
  }
}

function getOrCreateSession(sessionId) {
  cleanExpiredSessions();
  const id = sessionId && sessionId.trim() ? sessionId.trim() : ids.newOrderId();
  let session = sessionsMap.get(id);

  if (!session || Date.now() - session.lastActiveAt > SESSION_TTL_MS) {
    session = {
      id,
      chat: aiProvider.createChatSession({
        systemInstruction: SYSTEM_PROMPT,
        tools: TOOL_DECLARATIONS,
        history: [],
      }),
      verifiedOrderId: null,
      verifiedContact: null,
      messageCount: 0,
      createdTicket: null,
      lastActiveAt: Date.now(),
    };
    sessionsMap.set(id, session);
  } else {
    session.lastActiveAt = Date.now();
  }

  return session;
}

// 5. Cài đặt chi tiết các Tool nghiệp vụ

/**
 * Tool 1: lookup_order(order_code, contact)
 */
async function toolLookupOrder(args, session) {
  const orderCode = (args.order_code || '').trim();
  const contact = (args.contact || '').trim().toLowerCase();

  if (!orderCode || !contact) {
    return {
      found: false,
      message: 'Vui lòng cung cấp cả mã đơn hàng (hoặc mã giao dịch) và email/SĐT để tra cứu.',
    };
  }

  // 1. Tìm đơn hàng
  let order = await knex('orders').where({ order_id: orderCode }).first();
  if (!order) {
    const attempt = await knex('payment_attempts')
      .where({ gateway_txn_id: orderCode })
      .orWhere({ gateway_trans_no: orderCode })
      .first();
    if (attempt) {
      order = await knex('orders').where({ order_id: attempt.order_id }).first();
    }
  }

  // 2. So khớp email hoặc phone
  let matched = false;
  if (order) {
    const email = (order.customer_email || '').toLowerCase();
    const phone = (order.customer_phone || '').toLowerCase();
    if (email === contact || phone === contact) {
      matched = true;
    }
  }

  // 3. Nếu sai hoặc không tìm thấy: trả cùng một lỗi chung an toàn
  if (!order || !matched) {
    return {
      found: false,
      message: 'Không tìm thấy thông tin đơn hàng phù hợp với thông tin cung cấp. Vui lòng kiểm tra lại mã đơn và email/SĐT.',
    };
  }

  // 4. Lưu vào session
  session.verifiedOrderId = order.order_id;
  session.verifiedContact = contact;

  // Lấy refund & ticket
  const [refund, ticket] = await Promise.all([
    knex('refunds').where({ order_id: order.order_id }).whereNot('status', 'REJECTED').orderBy('detected_at', 'desc').first(),
    knex('tickets').where({ order_id: order.order_id }).first(),
  ]);

  // Xác định trạng thái thân thiện
  let friendlyStatus = 'đang chờ thanh toán';
  if (refund && refund.status === 'COMPLETED') friendlyStatus = 'đã hoàn xong';
  else if (order.status === 'REFUNDED') friendlyStatus = 'đã hoàn xong';
  else if (order.status === 'REFUND_PENDING' || (refund && ['CHECKING', 'SENT', 'BANK_PROCESSING'].includes(refund.status))) friendlyStatus = 'đã tạo lệnh hoàn';
  else if (order.status === 'PAID') friendlyStatus = 'đã có vé';
  else if (order.status === 'PENDING_VERIFY') friendlyStatus = 'đang xác minh';
  else if (order.status === 'FAILED') friendlyStatus = 'thất bại';
  else if (order.status === 'EXPIRED') friendlyStatus = 'hết hạn giữ chỗ';

  return {
    found: true,
    order_id: order.order_id,
    friendly_status: friendlyStatus,
    amount_total: order.amount_total,
    payment_method: order.payment_method || 'Không xác định',
    created_at: order.created_at,
    paid_at: order.paid_at,
    has_ticket: Boolean(ticket),
    ticket_code: ticket?.ticket_id || null,
    has_refund: Boolean(refund),
    refund_status: refund?.status || null,
    refund_amount: refund?.amount || null,
  };
}

/**
 * Tool 2: get_refund_status()
 */
async function toolGetRefundStatus(args, session) {
  if (!session.verifiedOrderId) {
    return {
      ok: false,
      error: 'Chưa có đơn hàng nào được xác thực trong phiên này. Vui lòng cung cấp mã đơn và email/SĐT trước.',
    };
  }

  const order = await knex('orders').where({ order_id: session.verifiedOrderId }).first();
  if (!order) {
    return { ok: false, error: 'Đơn hàng không tồn tại.' };
  }

  const refund = await knex('refunds')
    .where({ order_id: session.verifiedOrderId })
    .whereNot('status', 'REJECTED')
    .orderBy('detected_at', 'desc')
    .first();

  const method = order.payment_method || 'ATM';
  const estimatedTime = REFUND_ESTIMATED_TIMES[method] || REFUND_ESTIMATED_TIMES.DEFAULT;

  if (!refund) {
    return {
      ok: true,
      has_refund: false,
      message: 'Hiện tại đơn hàng này chưa có lệnh hoàn tiền nào trên hệ thống.',
      standard_estimated_times: {
        international_card: 'trong vòng 30 ngày làm việc',
        domestic_atm: 'trong vòng 7 ngày làm việc',
        e_wallet: '7-14 ngày làm việc',
      },
    };
  }

  const REFUND_STATUS_TEXTS = {
    CHECKING: 'Đang kiểm tra điều kiện hoàn tiền',
    SENT: 'Đã gửi lệnh hoàn sang cổng thanh toán',
    BANK_PROCESSING: 'Ngân hàng đang xử lý hoàn tiền vào thẻ/tài khoản',
    COMPLETED: 'Đã hoàn tiền thành công',
  };

  return {
    ok: true,
    has_refund: true,
    refund_id: refund.refund_id,
    status: refund.status,
    status_text: REFUND_STATUS_TEXTS[refund.status] || refund.status,
    amount: refund.amount,
    estimated_time: estimatedTime,
    standard_rules: {
      international_card: 'trong vòng 30 ngày làm việc',
      domestic_atm: 'trong vòng 7 ngày làm việc',
      e_wallet: '7-14 ngày làm việc',
    },
    created_at: refund.detected_at,
    completed_at: refund.completed_at,
  };
}

/**
 * Tool 3: create_ticket(issue_type, description)
 */
async function toolCreateTicket(args, session) {
  if (!session.verifiedOrderId) {
    return {
      ok: false,
      error: 'Chỉ có thể tạo phiếu khiếu nại sau khi đã xác thực đơn hàng thành công.',
    };
  }

  const order = await knex('orders').where({ order_id: session.verifiedOrderId }).first();
  if (!order) {
    return { ok: false, error: 'Đơn hàng đã xác thực không còn tồn tại.' };
  }

  const issueTypeRaw = (args.issue_type || 'OTHER').trim().toUpperCase();
  const validTypes = ['DEBITED_NO_TICKET', 'DOUBLE_PAYMENT', 'TICKET_NOT_RECEIVED', 'SLOW_REFUND', 'OTHER'];
  const issueType = validTypes.includes(issueTypeRaw) ? issueTypeRaw : 'OTHER';

  const description = (args.description || '').trim();
  if (description.length < 5) {
    return {
      ok: false,
      error: 'Mô tả sự cố phải có ít nhất 5 ký tự.',
    };
  }

  const nowMs = clock.nowMs();
  const nowIso = clock.nowIso();

  // Kiểm tra hạn khiếu nại 60 phút sau thanh toán
  const attempt = await knex('payment_attempts')
    .where({ order_id: order.order_id })
    .orderBy('created_at', 'desc')
    .first();

  const paymentTimestamp = attempt?.created_at || order.created_at;
  let isExpired60Min = false;
  if (paymentTimestamp) {
    const paymentMs = new Date(paymentTimestamp).getTime();
    const diffMinutes = (nowMs - paymentMs) / 60000;
    if (diffMinutes > 60) {
      isExpired60Min = true;
    }
  }

  const ticketId = ids.newTicketId();
  let status = 'NEW';
  let resolution = null;
  let slaDueAt = null;

  if (isExpired60Min) {
    status = 'REJECTED';
    resolution = 'Từ chối: Quá thời hạn khiếu nại 60 phút kể từ khi thanh toán thành công theo điều khoản của Beta Cinemas.';
    slaDueAt = null;
  } else {
    status = 'NEW';
    slaDueAt = new Date(nowMs + 24 * 3600 * 1000).toISOString();
  }

  const contact = session.verifiedContact || order.customer_email || order.customer_phone;

  await knex('support_tickets').insert({
    ticket_id: ticketId,
    order_id: order.order_id,
    user_id: order.user_id || null,
    contact,
    source: 'BOT',
    status,
    sla_due_at: slaDueAt,
    created_at: nowIso,
    resolved_at: isExpired60Min ? nowIso : null,
    resolution,
    issue_type: issueType,
    description,
    attachment_url: null,
  });

  await knex('support_ticket_notes').insert({
    ticket_id: ticketId,
    author_id: null,
    note: `[Trợ lý AI Bot tiếp nhận khiếu nại - ${issueType}]: ${description}`,
    created_at: nowIso,
  });

  const ticketResult = {
    ticket_id: ticketId,
    order_id: order.order_id,
    issue_type: issueType,
    status,
    status_label: status === 'NEW' ? 'Mới (Đã tiếp nhận)' : 'Từ chối (Quá hạn 60 phút)',
    sla_due_at: slaDueAt,
    is_rejected: isExpired60Min,
    message: isExpired60Min
      ? 'Yêu cầu hỗ trợ đã được tạo nhưng bị từ chối do quá thời hạn 60 phút theo Điều khoản Beta Cinemas.'
      : 'Yêu cầu hỗ trợ đã được tạo thành công! Đội ngũ CSKH sẽ xử lý trong vòng 24 giờ.',
  };

  session.createdTicket = ticketResult;

  return {
    ok: true,
    ...ticketResult,
  };
}

/**
 * Tool 4: get_ticket_status(ticket_code, contact)
 */
async function toolGetTicketStatus(args) {
  const ticketCode = (args.ticket_code || '').trim();
  const contact = (args.contact || '').trim().toLowerCase();

  if (!ticketCode || !contact) {
    return {
      found: false,
      message: 'Vui lòng cung cấp cả mã phiếu hỗ trợ và email hoặc số điện thoại để tra cứu.',
    };
  }

  const ticket = await knex('support_tickets').where({ ticket_id: ticketCode }).first();
  if (!ticket) {
    return {
      found: false,
      message: 'Không tìm thấy phiếu hỗ trợ phù hợp với thông tin cung cấp. Vui lòng kiểm tra lại mã phiếu và email/SĐT.',
    };
  }

  let order = null;
  if (ticket.order_id) {
    order = await knex('orders').where({ order_id: ticket.order_id }).first();
  }

  const ticketContact = (ticket.contact || '').toLowerCase();
  const orderEmail = (order?.customer_email || '').toLowerCase();
  const orderPhone = (order?.customer_phone || '').toLowerCase();

  if (contact !== ticketContact && contact !== orderEmail && contact !== orderPhone) {
    return {
      found: false,
      message: 'Không tìm thấy phiếu hỗ trợ phù hợp với thông tin cung cấp. Vui lòng kiểm tra lại mã phiếu và email/SĐT.',
    };
  }

  const STATUS_LABELS = {
    NEW: 'Mới (Chờ phân công)',
    IN_REVIEW: 'Đang xem xét',
    WAITING_REFUND: 'Chờ hoàn tiền',
    RESOLVED: 'Đã xử lý xong',
    REJECTED: 'Từ chối giải quyết',
  };

  return {
    found: true,
    ticket_id: ticket.ticket_id,
    order_id: ticket.order_id,
    issue_type: ticket.issue_type,
    status: ticket.status,
    status_label: STATUS_LABELS[ticket.status] || ticket.status,
    sla_due_at: ticket.sla_due_at,
    resolution: ticket.resolution,
    created_at: ticket.created_at,
    resolved_at: ticket.resolved_at,
  };
}

/**
 * Tool 5: search_faq(query)
 */
async function toolSearchFaq(args) {
  const q = (args.query || '').trim().toLowerCase();
  if (!q) {
    return { found: false, results: [] };
  }

  const words = q.split(/\s+/).filter((w) => w.length > 1);

  const scored = FAQ_DATABASE.map((item) => {
    let score = 0;
    const questionLower = item.question.toLowerCase();
    const answerLower = item.answer.toLowerCase();
    const keywords = item.keywords || [];

    for (const w of words) {
      if (questionLower.includes(w)) score += 5;
      if (answerLower.includes(w)) score += 2;
      for (const kw of keywords) {
        if (kw.toLowerCase().includes(w)) score += 4;
      }
    }

    return { ...item, score };
  });

  const matched = scored.filter((i) => i.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);

  if (matched.length === 0) {
    return {
      found: false,
      message: 'Không tìm thấy câu trả lời chính xác trong tài liệu FAQ. Hãy liên hệ hotline 1900 636807 để được giải đáp thêm.',
    };
  }

  return {
    found: true,
    results: matched.map((m) => ({
      question: m.question,
      answer: m.answer,
    })),
  };
}

/**
 * Tool 6: handoff_to_human(reason)
 */
async function toolHandoffToHuman(args) {
  return {
    transferred: true,
    hotline: '1900 636807',
    email: 'cskh@betacinemas.vn',
    working_hours: '8:00 - 22:00 tất cả các ngày trong tuần (kể cả Lễ, Tết)',
    fanpage: 'https://facebook.com/betacinemas',
    reason: args.reason || 'Khách hàng cần hỗ trợ trực tiếp từ nhân viên',
  };
}

// Map các hàm tool vào router thực thi
const TOOL_MAP = {
  lookup_order: toolLookupOrder,
  get_refund_status: toolGetRefundStatus,
  create_ticket: toolCreateTicket,
  get_ticket_status: toolGetTicketStatus,
  search_faq: toolSearchFaq,
  handoff_to_human: toolHandoffToHuman,
};

/**
 * Xử lý tin nhắn của khách hàng và điều phối vòng lặp function calling (tối đa 6 vòng).
 *
 * @param {string} sessionId ID phiên chat
 * @param {string} userMessage Nội dung tin nhắn
 * @returns {Promise<{reply: string, ticket?: object}>}
 */
async function processUserMessage(sessionId, userMessage) {
  const id = sessionId && sessionId.trim() ? sessionId.trim() : ids.newOrderId();
  let session = sessionsMap.get(id);
  if (!session) {
    session = await loadPersistedSession(id);
    if (session) {
      sessionsMap.set(id, session);
    }
  }
  if (!session) {
    session = getOrCreateSession(id);
  }

  // 1. Kiểm tra giới hạn số lượt tin nhắn mỗi phiên
  if (session.messageCount >= MAX_TURNS_PER_SESSION) {
    return {
      reply: 'Phiên trò chuyện đã đạt giới hạn 30 lượt tin nhắn. Quý khách vui lòng làm mới trang để bắt đầu phiên mới hoặc liên hệ hotline 1900 636807 để được hỗ trợ trực tiếp.',
      ticket: session.createdTicket || undefined,
    };
  }

  session.messageCount += 1;

  // 2. Vòng lặp function calling (tối đa 6 vòng)
  const MAX_ROUNDS = 6;
  let currentResponse = null;
  const timeoutMs = 20000; // 20s theo yêu cầu 7

  try {
    currentResponse = await aiProvider.sendUserMessage(session.chat, userMessage, timeoutMs);

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const calls = currentResponse.functionCalls;
      if (!calls || calls.length === 0) {
        break; // Mô hình đã trả lời bằng văn bản
      }

      const toolResults = [];

      for (const call of calls) {
        const toolName = call.name;
        const toolArgs = call.args || {};

        logger.info('support_agent_tool_call', {
          tool: toolName,
          args: toolArgs,
          sessionId: session.id,
          verifiedOrderId: session.verifiedOrderId,
          timestamp: clock.nowIso(),
        });

        const executor = TOOL_MAP[toolName];
        let resData = null;

        if (executor) {
          try {
            resData = await executor(toolArgs, session);
          } catch (execErr) {
            logger.error('tool_execution_failed', { tool: toolName, error: execErr.message });
            resData = { ok: false, error: execErr.message };
          }
        } else {
          resData = { ok: false, error: `Hàm ${toolName} không tồn tại hoặc bị từ chối.` };
        }

        toolResults.push({
          name: toolName,
          response: resData,
          id: call.id,
        });
      }

      // Gửi kết quả tool về cho mô hình
      currentResponse = await aiProvider.sendToolResponses(session.chat, toolResults, timeoutMs);
    }

    const reply = currentResponse?.text || 'Em có thể giúp gì thêm cho Quý khách về vé hoặc thanh toán tại Beta Cinemas không ạ?';

    session.lastActiveAt = Date.now();
    await savePersistedSession(session);

    return {
      reply,
      ticket: session.createdTicket || undefined,
    };
  } catch (error) {
    logger.error('support_agent_error', {
      sessionId: session.id,
      error: error.message,
      code: error.code,
    });

    session.lastActiveAt = Date.now();
    await savePersistedSession(session);

    // Yêu cầu 7: Nếu gọi mô hình lỗi hoặc quá 20 giây, trả câu dự phòng kèm hotline
    return {
      reply: 'Hệ thống trợ lý đang bận hoặc phản hồi chậm. Quý khách vui lòng liên hệ hotline 1900 636807 hoặc email cskh@betacinemas.vn để được hỗ trợ ngay lập tức.',
      ticket: session.createdTicket || undefined,
    };
  }
}

module.exports = {
  processUserMessage,
  getOrCreateSession,
  TOOL_DECLARATIONS,
  TOOL_MAP,
  _resetSessions: () => sessionsMap.clear(),
};
