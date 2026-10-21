'use strict';

const crypto = require('crypto');
const { env } = require('../src/config/env');
const {
  vnpDate,
  buildPaymentUrl,
  verifyQuery,
  queryTransaction,
  refund,
} = require('../src/lib/vnpay');

describe('Step 3: VNPay Library (src/lib/vnpay.js)', () => {
  describe('vnpDate(date)', () => {
    it('should format fixed UTC date correctly to Vietnam timezone (UTC+7)', () => {
      // 2026-10-21 10:13:21 UTC -> 17:13:21 VN (UTC+7)
      const fixedUtcDate = new Date('2026-10-21T10:13:21.000Z');
      expect(vnpDate(fixedUtcDate)).toBe('20261021171321');
    });

    it('should handle midnight correctly with hourCycle 00', () => {
      // 2026-10-20 17:00:00 UTC -> 2026-10-21 00:00:00 VN
      const midnightUtcDate = new Date('2026-10-20T17:00:00.000Z');
      expect(vnpDate(midnightUtcDate)).toBe('20261021000000');
    });

    it('should return a 14-digit string when called without arguments', () => {
      const nowStr = vnpDate();
      expect(nowStr).toMatch(/^\d{14}$/);
    });

    it('should throw TypeError on invalid date', () => {
      expect(() => vnpDate('invalid-date-string')).toThrow(TypeError);
    });
  });

  describe('buildPaymentUrl & verifyQuery', () => {
    const sampleInput = {
      txnRef: 'BC12345678',
      amountVnd: 75000,
      orderInfo: 'Thanh toan ve xem phim Beta Cinemas',
      ipAddr: '192.168.1.10',
      method: 'VNBANK',
      expireAt: new Date('2026-10-21T10:30:00.000Z'),
    };

    it('should build valid payment URL with amount multiplied by 100 and spaces encoded as +', () => {
      const url = buildPaymentUrl(sampleInput);

      expect(url.startsWith(env.VNPAY_URL)).toBe(true);

      // vnp_Amount = 75000 * 100 = 7500000
      expect(url).toContain('vnp_Amount=7500000');

      // Khoảng trắng được mã hóa thành '+'
      expect(url).toContain('vnp_OrderInfo=Thanh+toan+ve+xem+phim+Beta+Cinemas');

      // Có chứa vnp_SecureHash
      expect(url).toContain('vnp_SecureHash=');

      // Có chứa method (vnp_BankCode)
      expect(url).toContain('vnp_BankCode=VNBANK');
    });

    it('should verify true for a properly signed query', () => {
      const urlString = buildPaymentUrl(sampleInput);
      const url = new URL(urlString);
      const query = Object.fromEntries(url.searchParams.entries());

      const isValid = verifyQuery(query);
      expect(isValid).toBe(true);
    });

    it('should verify true even if vnp_SecureHashType is present in query', () => {
      const urlString = buildPaymentUrl(sampleInput);
      const url = new URL(urlString);
      const query = Object.fromEntries(url.searchParams.entries());
      query.vnp_SecureHashType = 'SHA512';

      const isValid = verifyQuery(query);
      expect(isValid).toBe(true);
    });

    it('should return false if query is missing vnp_SecureHash', () => {
      const urlString = buildPaymentUrl(sampleInput);
      const url = new URL(urlString);
      const query = Object.fromEntries(url.searchParams.entries());
      delete query.vnp_SecureHash;

      expect(verifyQuery(query)).toBe(false);
    });

    it('should return false if any parameter value is modified by 1 character', () => {
      const urlString = buildPaymentUrl(sampleInput);
      const url = new URL(urlString);
      const query = Object.fromEntries(url.searchParams.entries());

      // Sửa 1 ký tự trong vnp_Amount
      query.vnp_Amount = '7500001';
      expect(verifyQuery(query)).toBe(false);

      // Trả lại và sửa 1 ký tự trong vnp_OrderInfo
      query.vnp_Amount = '7500000';
      query.vnp_OrderInfo = 'Thanh toan ve xem phim Beta Cinema!';
      expect(verifyQuery(query)).toBe(false);
    });

    it('should return false if vnp_SecureHash is tampered by 1 character', () => {
      const urlString = buildPaymentUrl(sampleInput);
      const url = new URL(urlString);
      const query = Object.fromEntries(url.searchParams.entries());

      // Thay đổi ký tự cuối cùng của hash
      const originalHash = query.vnp_SecureHash;
      const lastChar = originalHash.slice(-1);
      const replacedChar = lastChar === 'a' ? 'b' : 'a';
      query.vnp_SecureHash = originalHash.slice(0, -1) + replacedChar;

      expect(verifyQuery(query)).toBe(false);
    });

    it('should validate inputs in buildPaymentUrl', () => {
      expect(() => buildPaymentUrl({ ...sampleInput, txnRef: '' })).toThrow(/txnRef/);
      expect(() => buildPaymentUrl({ ...sampleInput, amountVnd: -100 })).toThrow(/amountVnd/);
      expect(() => buildPaymentUrl({ ...sampleInput, orderInfo: '' })).toThrow(/orderInfo/);
    });
  });

  describe('queryTransaction with mock global fetch', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should send correct JSON payload and signature to VNPay API', async () => {
      let capturedRequest = null;

      globalThis.fetch = jest.fn().mockImplementation(async (url, options) => {
        capturedRequest = { url, options, body: JSON.parse(options.body) };
        return {
          ok: true,
          json: async () => ({
            vnp_ResponseCode: '00',
            vnp_TransactionStatus: '00',
            vnp_TxnRef: 'BC12345678',
            vnp_Amount: '7500000',
            vnp_TransactionNo: '14000123',
            vnp_BankCode: 'NCB',
          }),
        };
      });

      const res = await queryTransaction({
        requestId: 'REQ_123',
        txnRef: 'BC12345678',
        transDate: '20261021171321',
        orderInfo: 'Tra cuu don BC12345678',
        ipAddr: '10.0.0.1',
        transactionNo: '14000123',
      });

      expect(res.vnp_ResponseCode).toBe('00');
      expect(res.vnp_TransactionStatus).toBe('00');

      expect(capturedRequest.url).toBe(env.VNPAY_API_URL);
      expect(capturedRequest.options.method).toBe('POST');
      expect(capturedRequest.options.headers['Content-Type']).toBe('application/json');

      const body = capturedRequest.body;
      expect(body.vnp_RequestId).toBe('REQ_123');
      expect(body.vnp_Version).toBe('2.1.0');
      expect(body.vnp_Command).toBe('querydr');
      expect(body.vnp_TmnCode).toBe(env.VNPAY_TMN_CODE);
      expect(body.vnp_TxnRef).toBe('BC12345678');
      expect(body.vnp_TransactionDate).toBe('20261021171321');
      expect(body.vnp_TransactionNo).toBe('14000123');
      expect(body.vnp_OrderInfo).toBe('Tra cuu don BC12345678');
      expect(body.vnp_IpAddr).toBe('10.0.0.1');

      // Kiểm tra chuỗi hash theo công thức nối '|'
      const expectedHashData = [
        'REQ_123',
        '2.1.0',
        'querydr',
        env.VNPAY_TMN_CODE,
        'BC12345678',
        '20261021171321',
        body.vnp_CreateDate,
        '10.0.0.1',
        'Tra cuu don BC12345678',
      ].join('|');

      const expectedSecureHash = crypto
        .createHmac('sha512', env.VNPAY_HASH_SECRET)
        .update(Buffer.from(expectedHashData, 'utf-8'))
        .digest('hex');

      expect(body.vnp_SecureHash).toBe(expectedSecureHash);
    });
  });

  describe('refund with mock global fetch', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should send correct refund payload and signature to VNPay API', async () => {
      let capturedRequest = null;

      globalThis.fetch = jest.fn().mockImplementation(async (url, options) => {
        capturedRequest = { url, options, body: JSON.parse(options.body) };
        return {
          ok: true,
          json: async () => ({
            vnp_ResponseCode: '00',
            vnp_ResponseId: 'RESP_RF_123',
            vnp_Command: 'refund',
            vnp_TxnRef: 'BC12345678',
            vnp_Amount: '7500000',
          }),
        };
      });

      const res = await refund({
        requestId: 'RF_123',
        txnRef: 'BC12345678',
        amountVnd: 75000,
        transDate: '20261021171321',
        transactionType: '02',
        transactionNo: '14000123',
        createBy: 'ADMIN_TEST',
        orderInfo: 'Hoan tien don hang BC12345678 do loi he thong',
        ipAddr: '10.0.0.1',
      });

      expect(res.vnp_ResponseCode).toBe('00');
      expect(res.vnp_ResponseId).toBe('RESP_RF_123');

      expect(capturedRequest.url).toBe(env.VNPAY_API_URL);
      expect(capturedRequest.options.method).toBe('POST');
      expect(capturedRequest.options.headers['Content-Type']).toBe('application/json');

      const body = capturedRequest.body;
      expect(body.vnp_RequestId).toBe('RF_123');
      expect(body.vnp_Version).toBe('2.1.0');
      expect(body.vnp_Command).toBe('refund');
      expect(body.vnp_TmnCode).toBe(env.VNPAY_TMN_CODE);
      expect(body.vnp_TransactionType).toBe('02');
      expect(body.vnp_TxnRef).toBe('BC12345678');
      expect(body.vnp_Amount).toBe(7500000); // 75000 * 100
      expect(body.vnp_TransactionNo).toBe('14000123');
      expect(body.vnp_TransactionDate).toBe('20261021171321');
      expect(body.vnp_CreateBy).toBe('ADMIN_TEST');
      expect(body.vnp_OrderInfo).toBe('Hoan tien don hang BC12345678 do loi he thong');
      expect(body.vnp_IpAddr).toBe('10.0.0.1');

      // Kiểm tra chuỗi hash theo công thức nối '|'
      const expectedHashData = [
        'RF_123',
        '2.1.0',
        'refund',
        env.VNPAY_TMN_CODE,
        '02',
        'BC12345678',
        '7500000',
        '14000123',
        '20261021171321',
        'ADMIN_TEST',
        body.vnp_CreateDate,
        '10.0.0.1',
        'Hoan tien don hang BC12345678 do loi he thong',
      ].join('|');

      const expectedSecureHash = crypto
        .createHmac('sha512', env.VNPAY_HASH_SECRET)
        .update(Buffer.from(expectedHashData, 'utf-8'))
        .digest('hex');

      expect(body.vnp_SecureHash).toBe(expectedSecureHash);
    });
  });
});
