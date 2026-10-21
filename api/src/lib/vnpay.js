'use strict';

const crypto = require('crypto');
const { env } = require('../config/env');

const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

const vnDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: VN_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  hourCycle: 'h23',
});

/**
 * Định dạng ngày giờ theo chuẩn yyyyMMddHHmmss (giờ Việt Nam, UTC+7).
 * Sử dụng GIỜ THẬT, không dùng clock.js.
 * @param {Date|string|number} [date]
 * @returns {string} yyyyMMddHHmmss
 */
function vnpDate(date) {
  const d = date ? (date instanceof Date ? date : new Date(date)) : new Date();
  if (Number.isNaN(d.getTime())) {
    throw new TypeError(`Mốc thời gian không hợp lệ: ${date}`);
  }
  const parts = Object.fromEntries(vnDateFormatter.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
}

/**
 * Sắp xếp các tham số theo thứ tự a-z, loại bỏ giá trị rỗng/null/undefined,
 * và mã hóa URL với khoảng trắng thành dấu '+'.
 * @param {Record<string, any>} params
 * @returns {string} Chuỗi query đã mã hóa
 */
function encodeParamsForSign(params) {
  const sortedKeys = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort();

  return sortedKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k])).replace(/%20/g, '+')}`)
    .join('&');
}

/**
 * Tạo URL thanh toán VNPay (vnp_Command = 'pay').
 * @param {object} options
 * @param {string|number} options.txnRef - Mã đơn hàng/giao dịch của Merchant (vnp_TxnRef)
 * @param {number} options.amountVnd - Số tiền VND (sẽ nhân 100 thành vnp_Amount)
 * @param {string} options.orderInfo - Nội dung thanh toán (vnp_OrderInfo)
 * @param {string} [options.ipAddr='127.0.0.1'] - IP người mua (vnp_IpAddr)
 * @param {Date|string|number} [options.expireAt] - Thời gian hết hạn thanh toán (vnp_ExpireDate)
 * @param {string} [options.method] - Mã ngân hàng/phương thức (vnp_BankCode, e.g. VNBANK, INTCARD, VNPAYQR)
 * @returns {string} URL chuyển hướng khách hàng sang cổng VNPay
 */
function buildPaymentUrl({ txnRef, amountVnd, orderInfo, ipAddr = '127.0.0.1', expireAt, method }) {
  if (!txnRef) throw new Error('buildPaymentUrl: thiếu txnRef');
  if (typeof amountVnd !== 'number' || amountVnd <= 0) {
    throw new Error('buildPaymentUrl: amountVnd phải là số dương');
  }
  if (!orderInfo) throw new Error('buildPaymentUrl: thiếu orderInfo');

  const createDate = vnpDate();
  const vnpParams = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: env.VNPAY_TMN_CODE,
    vnp_Amount: Math.round(amountVnd * 100),
    vnp_CreateDate: createDate,
    vnp_CurrCode: 'VND',
    vnp_IpAddr: ipAddr || '127.0.0.1',
    vnp_Locale: 'vn',
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: 'other',
    vnp_ReturnUrl: env.VNPAY_RETURN_URL,
    vnp_TxnRef: String(txnRef),
  };

  if (expireAt) {
    vnpParams.vnp_ExpireDate = vnpDate(expireAt);
  }

  if (method) {
    vnpParams.vnp_BankCode = method;
  }

  const signData = encodeParamsForSign(vnpParams);
  const secureHash = crypto
    .createHmac('sha512', env.VNPAY_HASH_SECRET)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  const baseUrl = env.VNPAY_URL.endsWith('/') ? env.VNPAY_URL.slice(0, -1) : env.VNPAY_URL;
  return `${baseUrl}?${signData}&vnp_SecureHash=${secureHash}`;
}

/**
 * Kiểm tra tính hợp lệ của chữ ký phản hồi từ VNPay (Return URL hoặc IPN).
 * Loại bỏ vnp_SecureHash và vnp_SecureHashType, sắp xếp theo tên, HMAC-SHA512 so sánh timing-safe.
 * @param {Record<string, any>} query
 * @param {string} [secret] - Tùy chọn override secret (mặc định lấy env.VNPAY_HASH_SECRET)
 * @returns {boolean} true nếu chữ ký hợp lệ, false nếu không
 */
function verifyQuery(query, secret = env.VNPAY_HASH_SECRET) {
  if (!query || typeof query !== 'object') return false;

  const secureHash = query.vnp_SecureHash;
  if (!secureHash) return false;

  const clone = { ...query };
  delete clone.vnp_SecureHash;
  delete clone.vnp_SecureHashType;

  const signData = encodeParamsForSign(clone);
  const computedHash = crypto
    .createHmac('sha512', secret)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  const computedBuf = Buffer.from(computedHash.toLowerCase(), 'utf-8');
  const targetBuf = Buffer.from(String(secureHash).toLowerCase(), 'utf-8');

  if (computedBuf.length !== targetBuf.length) return false;
  return crypto.timingSafeEqual(computedBuf, targetBuf);
}

/**
 * Tra cứu trạng thái giao dịch với VNPay API (vnp_Command = 'querydr').
 * @param {object} options
 * @param {string} [options.requestId] - Mã định danh request duy nhất
 * @param {string|number} options.txnRef - Mã giao dịch của Merchant
 * @param {Date|string|number} options.transDate - Ngày giờ tạo giao dịch (yyyyMMddHHmmss hoặc Date)
 * @param {string} [options.orderInfo] - Thông tin ghi chú
 * @param {string} [options.ipAddr='127.0.0.1'] - IP gửi request
 * @param {string|number} [options.transactionNo='0'] - Mã giao dịch VNPay nếu có
 * @returns {Promise<object>} Phản hồi từ VNPay API
 */
async function queryTransaction({
  requestId,
  txnRef,
  transDate,
  orderInfo,
  ipAddr = '127.0.0.1',
  transactionNo = '0',
}) {
  if (!txnRef) throw new Error('queryTransaction: thiếu txnRef');
  if (!transDate) throw new Error('queryTransaction: thiếu transDate');

  const reqId = requestId || `REQ_${Date.now()}`;
  const version = '2.1.0';
  const command = 'querydr';
  const tmnCode = env.VNPAY_TMN_CODE;
  const createDate = vnpDate();
  const info = orderInfo || `Tra cuu giao dich ${txnRef}`;
  const formattedTransDate = typeof transDate === 'string' && /^\d{14}$/.test(transDate)
    ? transDate
    : vnpDate(transDate);

  // Chuỗi băm HMAC-SHA512 theo quy định API 2.1.0 của VNPay:
  // hashData = vnp_RequestId + "|" + vnp_Version + "|" + vnp_Command + "|" + vnp_TmnCode + "|" + vnp_TxnRef + "|" + vnp_TransactionDate + "|" + vnp_CreateDate + "|" + vnp_IpAddr + "|" + vnp_OrderInfo
  const hashData = [
    reqId,
    version,
    command,
    tmnCode,
    String(txnRef),
    formattedTransDate,
    createDate,
    ipAddr,
    info,
  ].join('|');

  const secureHash = crypto
    .createHmac('sha512', env.VNPAY_HASH_SECRET)
    .update(Buffer.from(hashData, 'utf-8'))
    .digest('hex');

  const payload = {
    vnp_RequestId: reqId,
    vnp_Version: version,
    vnp_Command: command,
    vnp_TmnCode: tmnCode,
    vnp_TxnRef: String(txnRef),
    vnp_OrderInfo: info,
    vnp_TransactionNo: String(transactionNo || '0'),
    vnp_TransactionDate: formattedTransDate,
    vnp_CreateDate: createDate,
    vnp_IpAddr: ipAddr,
    vnp_SecureHash: secureHash,
  };

  const response = await fetch(env.VNPAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return await response.json();
}

/**
 * Gửi yêu cầu hoàn tiền giao dịch tới VNPay API (vnp_Command = 'refund').
 * @param {object} options
 * @param {string} [options.requestId] - Mã định danh request hoàn tiền duy nhất
 * @param {string|number} options.txnRef - Mã đơn hàng/giao dịch Merchant
 * @param {number} options.amountVnd - Số tiền hoàn VND (sẽ nhân 100 thành vnp_Amount)
 * @param {Date|string|number} options.transDate - Ngày giờ giao dịch gốc (yyyyMMddHHmmss hoặc Date)
 * @param {string} [options.transactionType='02'] - Loại hoàn ('02': hoàn toàn phần, '03': hoàn một phần)
 * @param {string|number} [options.transactionNo='0'] - Mã giao dịch VNPay nếu có
 * @param {string} [options.createBy='SYSTEM'] - Người thực hiện hoàn tiền
 * @param {string} [options.orderInfo] - Lý do/thông tin hoàn tiền
 * @param {string} [options.ipAddr='127.0.0.1'] - IP gửi request
 * @returns {Promise<object>} Phản hồi từ VNPay API
 */
async function refund({
  requestId,
  txnRef,
  amountVnd,
  transDate,
  transactionType = '02',
  transactionNo = '0',
  createBy = 'SYSTEM',
  orderInfo,
  ipAddr = '127.0.0.1',
}) {
  if (!txnRef) throw new Error('refund: thiếu txnRef');
  if (typeof amountVnd !== 'number' || amountVnd <= 0) {
    throw new Error('refund: amountVnd phải là số dương');
  }
  if (!transDate) throw new Error('refund: thiếu transDate');

  const reqId = requestId || `RF_${Date.now()}`;
  const version = '2.1.0';
  const command = 'refund';
  const tmnCode = env.VNPAY_TMN_CODE;
  const createDate = vnpDate();
  const vnpAmount = Math.round(amountVnd * 100);
  const info = orderInfo || `Hoan tien giao dich ${txnRef}`;
  const formattedTransDate = typeof transDate === 'string' && /^\d{14}$/.test(transDate)
    ? transDate
    : vnpDate(transDate);

  // Chuỗi băm HMAC-SHA512 theo quy định API 2.1.0 của VNPay:
  // hashData = vnp_RequestId + "|" + vnp_Version + "|" + vnp_Command + "|" + vnp_TmnCode + "|" + vnp_TransactionType + "|" + vnp_TxnRef + "|" + vnp_Amount + "|" + vnp_TransactionNo + "|" + vnp_TransactionDate + "|" + vnp_CreateBy + "|" + vnp_CreateDate + "|" + vnp_IpAddr + "|" + vnp_OrderInfo
  const hashData = [
    reqId,
    version,
    command,
    tmnCode,
    transactionType,
    String(txnRef),
    String(vnpAmount),
    String(transactionNo || '0'),
    formattedTransDate,
    createBy,
    createDate,
    ipAddr,
    info,
  ].join('|');

  const secureHash = crypto
    .createHmac('sha512', env.VNPAY_HASH_SECRET)
    .update(Buffer.from(hashData, 'utf-8'))
    .digest('hex');

  const payload = {
    vnp_RequestId: reqId,
    vnp_Version: version,
    vnp_Command: command,
    vnp_TmnCode: tmnCode,
    vnp_TransactionType: transactionType,
    vnp_TxnRef: String(txnRef),
    vnp_Amount: vnpAmount,
    vnp_TransactionNo: String(transactionNo || '0'),
    vnp_TransactionDate: formattedTransDate,
    vnp_CreateBy: createBy,
    vnp_CreateDate: createDate,
    vnp_IpAddr: ipAddr,
    vnp_OrderInfo: info,
    vnp_SecureHash: secureHash,
  };

  const response = await fetch(env.VNPAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return await response.json();
}

module.exports = {
  vnpDate,
  buildPaymentUrl,
  verifyQuery,
  queryTransaction,
  refund,
};
