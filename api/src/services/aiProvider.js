'use strict';

/**
 * Trừu tượng hóa việc gọi LLM (Google Gemini SDK @google/genai).
 * Tách biệt hoàn toàn phần giao tiếp với mô hình để sau này dễ dàng đổi sang Claude hoặc nhà cung cấp khác.
 */

const { GoogleGenAI } = require('@google/genai');
const logger = require('../lib/logger');

function getApiKey() {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) {
    throw new Error('Chưa cấu hình GEMINI_API_KEY trong biến môi trường hoặc file .env');
  }
  return key;
}

function getPrimaryModelName() {
  return process.env.GEMINI_MODEL || 'gemini-3.8-flash';
}

// Danh sách model dự phòng khi model chính chạm hạn mức quota ngày (RESOURCE_EXHAUSTED) hoặc 503
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash-lite'];

let genAiClient = null;

function getGenAiClient() {
  if (!genAiClient) {
    genAiClient = new GoogleGenAI({ apiKey: getApiKey() });
  }
  return genAiClient;
}

/**
 * Tạo một phiên trò chuyện (Chat Session) với System Instruction và Function Declarations.
 *
 * @param {object} options
 * @param {string} options.systemInstruction Nội dung hướng dẫn hệ thống
 * @param {Array<object>} options.tools Danh sách function declarations
 * @param {Array<object>} [options.history] Lịch sử hội thoại trước đó (nếu có)
 * @param {string} [options.overrideModel] Tên model ghi đè (nếu có)
 * @returns {object} Chat session instance
 */
function createChatSession({ systemInstruction, tools, history = [], overrideModel }) {
  const ai = getGenAiClient();
  const model = overrideModel || getPrimaryModelName();

  const formattedTools = tools && tools.length > 0
    ? [{ functionDeclarations: tools }]
    : undefined;

  const chat = ai.chats.create({
    model,
    history: Array.isArray(history) ? history : [],
    config: {
      systemInstruction,
      tools: formattedTools,
    },
  });

  // Ghi nhận cấu hình để có thể recreate nếu cần fallback model
  chat._sessionConfig = { systemInstruction, tools, history, model };

  return chat;
}

/**
 * Gửi tin nhắn hoặc phản hồi tool tới mô hình có bọc Timeout 20 giây và Retry/Fallback.
 *
 * @param {object} chat Chat instance
 * @param {string|Array} messagePayload Nội dung tin nhắn của người dùng hoặc mảng functionResponse
 * @param {number} [timeoutMs=20000] Thời gian timeout (mặc định 20 giây theo yêu cầu 7)
 * @returns {Promise<object>} Phản hồi từ mô hình
 */
async function sendWithTimeoutAndRetry(chat, messagePayload, timeoutMs = 20000) {
  const maxRetries = 2;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const callPromise = chat.sendMessage({ message: messagePayload });

      const timeoutPromise = new Promise((_, reject) => {
        const timer = setTimeout(() => {
          const timeoutErr = new Error('TIMEOUT_20S');
          timeoutErr.code = 'TIMEOUT';
          reject(timeoutErr);
        }, timeoutMs);
        if (timer.unref) timer.unref();
      });

      return await Promise.race([callPromise, timeoutPromise]);
    } catch (err) {
      lastError = err;
      const errMsg = err?.message || '';
      const isQuotaOrUnavailable =
        err?.status === 429 ||
        err?.status === 503 ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        errMsg.includes('UNAVAILABLE') ||
        errMsg.includes('high demand');

      // Nếu gặp lỗi cạn quota hoặc 503 của gemini-3.8-flash -> tự động chuyển sang model dự phòng
      if (isQuotaOrUnavailable && chat._sessionConfig) {
        for (const fbModel of FALLBACK_MODELS) {
          if (chat.model !== fbModel) {
            logger.warn('ai_provider_model_fallback', {
              fromModel: chat.model,
              toModel: fbModel,
              reason: errMsg.slice(0, 100),
            });
            chat.model = fbModel;
            try {
              return await chat.sendMessage({ message: messagePayload });
            } catch (fbErr) {
              lastError = fbErr;
            }
          }
        }
      }

      if (attempt < maxRetries && isQuotaOrUnavailable) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      break;
    }
  }

  throw lastError;
}

/**
 * Gửi tin nhắn của người dùng đến AI.
 */
async function sendUserMessage(chat, text, timeoutMs = 20000) {
  return await sendWithTimeoutAndRetry(chat, text, timeoutMs);
}

/**
 * Gửi kết quả thực thi Tool về cho AI để tiếp tục vòng lặp function calling.
 */
async function sendToolResponses(chat, toolResults, timeoutMs = 20000) {
  const message = toolResults.map((t) => ({
    functionResponse: {
      name: t.name,
      response: t.response,
      id: t.id,
    },
  }));

  return await sendWithTimeoutAndRetry(chat, message, timeoutMs);
}

module.exports = {
  createChatSession,
  sendUserMessage,
  sendToolResponses,
  getApiKey,
  getModelName: getPrimaryModelName,
};
