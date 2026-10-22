'use strict';

const crypto = require('crypto');
const { SePayPgClient } = require('sepay-pg-node');
const { env } = require('../config/env');

let defaultClient = null;

/**
 * Khởi tạo hoặc lấy SePayPgClient với cấu hình Sandbox / Production.
 * @param {object} [customConfig]
 * @returns {SePayPgClient}
 */
function getSepayClient(customConfig = {}) {
  const config = {
    merchant_id: customConfig.merchant_id || env.SEPAY_MERCHANT_ID,
    secret_key: customConfig.secret_key || env.SEPAY_SECRET_KEY,
    env: customConfig.env || env.SEPAY_ENV || 'sandbox',
  };

  if (customConfig && Object.keys(customConfig).length > 0) {
    return new SePayPgClient(config);
  }

  if (!defaultClient) {
    defaultClient = new SePayPgClient(config);
  }
  return defaultClient;
}

/**
 * Khởi tạo thông tin phiên thanh toán một lần (One-Time Payment) bằng SePay SDK.
 * Đảm bảo số tiền luôn là số nguyên VND (INTEGER VND).
 *
 * @param {object} params
 * @param {string} params.orderInvoiceNumber - Mã hóa đơn đơn hàng
 * @param {number} params.orderAmount - Số tiền thanh toán (VND)
 * @param {string} [params.orderDescription] - Mô tả thanh toán
 * @param {string} [params.successUrl] - URL điều hướng khi thanh toán thành công
 * @param {string} [params.errorUrl] - URL điều hướng khi có lỗi
 * @param {string} [params.cancelUrl] - URL điều hướng khi người dùng hủy
 * @param {'BANK_TRANSFER'|'NAPAS_BANK_TRANSFER'} [params.paymentMethod='BANK_TRANSFER']
 * @param {string} [params.customData]
 * @param {SePayPgClient} [params.client]
 * @returns {{ checkoutUrl: string, fields: Record<string, any> }}
 */
function createOneTimePaymentCheckout({
  orderInvoiceNumber,
  orderAmount,
  orderDescription,
  successUrl,
  errorUrl,
  cancelUrl,
  paymentMethod = 'BANK_TRANSFER',
  customData,
  client = getSepayClient(),
}) {
  const checkoutUrl = client.checkout.initCheckoutUrl();
  const fields = client.checkout.initOneTimePaymentFields({
    operation: 'PURCHASE',
    payment_method: paymentMethod,
    order_invoice_number: String(orderInvoiceNumber),
    order_amount: Math.round(Number(orderAmount)), // Tuân thủ cấu trúc tiền tệ số nguyên VND
    currency: 'VND',
    order_description: String(
      orderDescription || `Thanh toan don hang ${orderInvoiceNumber}`
    ),
    success_url: successUrl || env.SEPAY_RETURN_URL,
    error_url: errorUrl || env.SEPAY_CANCEL_URL,
    cancel_url: cancelUrl || env.SEPAY_CANCEL_URL,
    custom_data: customData ? String(customData) : undefined,
  });

  return {
    checkoutUrl,
    fields,
  };
}

/**
 * Xác thực chữ ký HMAC-SHA256 của Webhook / IPN từ SePay.
 *
 * @param {object} params
 * @param {string} [params.signatureHeader] - Giá trị header X-SePay-Signature (sha256=... hoặc hex)
 * @param {string|number} [params.timestamp] - Giá trị header X-SePay-Timestamp
 * @param {string|object} params.rawBody - Nội dung body nhận được
 * @param {string} [params.secretKey] - Secret key dùng để kiểm tra
 * @returns {boolean}
 */
function verifyWebhookSignature({
  signatureHeader,
  timestamp,
  rawBody,
  secretKey = env.SEPAY_SECRET_KEY,
}) {
  if (!signatureHeader) return false;

  try {
    const cleanSig = signatureHeader.startsWith('sha256=')
      ? signatureHeader.slice(7)
      : signatureHeader;

    const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
    const dataToSign = timestamp ? `${timestamp}.${bodyStr}` : bodyStr;

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataToSign)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedHash, 'utf8');
    const actualBuf = Buffer.from(cleanSig, 'utf8');

    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch (_err) {
    return false;
  }
}

module.exports = {
  getSepayClient,
  createOneTimePaymentCheckout,
  verifyWebhookSignature,
};
