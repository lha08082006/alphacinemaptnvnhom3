'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const { parseEnv } = require('../src/config/env');

const dbPath = path.join(__dirname, '../data/beta.sqlite');

describe('Step 1: VNPay Config & Migration 006', () => {
  describe('VNPay Environment Variables (env.js)', () => {
    const validBaseEnv = {
      NODE_ENV: 'test',
      PORT: '4000',
      DB_FILE: 'data/beta.sqlite',
      CORS_ORIGINS: 'http://localhost:5500',
      GATEWAY_BASE_URL: 'http://127.0.0.1:4100',
      WEBHOOK_SECRET: 'dev_webhook_secret_change_me_0123',
      WEBHOOK_TOLERANCE_SEC: '300',
      JWT_SECRET: 'dev_jwt_secret_change_me_0123456789',
      JWT_EXPIRES_IN: '2h',
      LOG_LEVEL: 'info',
      VNPAY_TMN_CODE: 'TEST_TMN',
      VNPAY_HASH_SECRET: 'TEST_HASH_SECRET_123',
      VNPAY_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      VNPAY_API_URL: 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
      VNPAY_RETURN_URL: 'http://localhost:4000/api/v1/payment/vnpay/return',
      VNPAY_TRUST_RETURN: 'false',
    };

    it('should parse valid VNPay env successfully', () => {
      const parsed = parseEnv(validBaseEnv);
      expect(parsed.VNPAY_TMN_CODE).toBe('TEST_TMN');
      expect(parsed.VNPAY_HASH_SECRET).toBe('TEST_HASH_SECRET_123');
      expect(parsed.VNPAY_URL).toBe('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html');
      expect(parsed.VNPAY_API_URL).toBe('https://sandbox.vnpayment.vn/merchant_webapi/api/transaction');
      expect(parsed.VNPAY_RETURN_URL).toBe('http://localhost:4000/api/v1/payment/vnpay/return');
      expect(parsed.VNPAY_TRUST_RETURN).toBe('false');
    });

    it('should default VNPAY_TRUST_RETURN to "false" if omitted', () => {
      const envWithoutTrust = { ...validBaseEnv };
      delete envWithoutTrust.VNPAY_TRUST_RETURN;
      const parsed = parseEnv(envWithoutTrust);
      expect(parsed.VNPAY_TRUST_RETURN).toBe('false');
    });

    it('should fail if VNPAY_TMN_CODE is empty or missing', () => {
      const envMissingTmn = { ...validBaseEnv, VNPAY_TMN_CODE: '' };
      expect(() => parseEnv(envMissingTmn)).toThrow(/VNPAY_TMN_CODE/);
    });

    it('should fail if VNPAY_HASH_SECRET is empty or missing', () => {
      const envMissingSecret = { ...validBaseEnv, VNPAY_HASH_SECRET: '' };
      expect(() => parseEnv(envMissingSecret)).toThrow(/VNPAY_HASH_SECRET/);
    });

    it('should fail if VNPAY_URL is not a valid URL', () => {
      const envBadUrl = { ...validBaseEnv, VNPAY_URL: 'invalid-url' };
      expect(() => parseEnv(envBadUrl)).toThrow(/VNPAY_URL/);
    });

    it('should fail if VNPAY_API_URL is not a valid URL', () => {
      const envBadUrl = { ...validBaseEnv, VNPAY_API_URL: 'invalid-url' };
      expect(() => parseEnv(envBadUrl)).toThrow(/VNPAY_API_URL/);
    });

    it('should fail if VNPAY_RETURN_URL is not a valid URL', () => {
      const envBadUrl = { ...validBaseEnv, VNPAY_RETURN_URL: 'invalid-url' };
      expect(() => parseEnv(envBadUrl)).toThrow(/VNPAY_RETURN_URL/);
    });

    it('should fail if VNPAY_TRUST_RETURN is not "true" or "false"', () => {
      const envBadEnum = { ...validBaseEnv, VNPAY_TRUST_RETURN: 'maybe' };
      expect(() => parseEnv(envBadEnum)).toThrow(/VNPAY_TRUST_RETURN/);
    });
  });

  describe('Migration 006 Schema & Constraints', () => {
    let db;

    beforeAll(() => {
      db = new Database(dbPath, { readonly: false });
      db.pragma('foreign_keys = ON');
    });

    afterAll(() => {
      if (db) {
        try {
          db.prepare("DELETE FROM payment_attempts WHERE attempt_id LIKE 'TEST_ATT_%'").run();
          db.prepare("DELETE FROM orders WHERE order_id = 'BC_TEST_006'").run();
        } catch (e) {}
        db.close();
      }
    });

    it('should have new VNPay columns in payment_attempts table', () => {
      const columns = db.prepare("PRAGMA table_info('payment_attempts')").all();
      const colNames = columns.map((c) => c.name);

      expect(colNames).toContain('gateway_trans_no');
      expect(colNames).toContain('gateway_pay_date');
      expect(colNames).toContain('gateway_response_code');
      expect(colNames).toContain('bank_code');
    });

    it('should have gateway_request_id column in refunds table', () => {
      const columns = db.prepare("PRAGMA table_info('refunds')").all();
      const colNames = columns.map((c) => c.name);

      expect(colNames).toContain('gateway_request_id');
    });

    it('should enforce partial unique index on gateway_trans_no (allow multiple nulls, disallow duplicates)', () => {
      // Find an existing order or insert one
      const order = db.prepare('SELECT order_id FROM orders LIMIT 1').get();
      const orderId = order.order_id;
      const now = new Date().toISOString();

      // Clean up previous test entries if any
      db.prepare("DELETE FROM payment_attempts WHERE attempt_id IN ('TEST_ATT_1', 'TEST_ATT_2', 'TEST_ATT_3')").run();

      // 1. Insert multiple records with null gateway_trans_no -> must succeed
      db.prepare(`
        INSERT INTO payment_attempts (attempt_id, order_id, gateway_txn_id, method, amount, status, idempotency_key, created_at, gateway_trans_no)
        VALUES ('TEST_ATT_1', ?, 'GW_T1', 'ATM', 50000, 'CREATED', 'IDEMP_T1', ?, NULL)
      `).run(orderId, now);

      db.prepare(`
        INSERT INTO payment_attempts (attempt_id, order_id, gateway_txn_id, method, amount, status, idempotency_key, created_at, gateway_trans_no)
        VALUES ('TEST_ATT_2', ?, 'GW_T2', 'ATM', 50000, 'CREATED', 'IDEMP_T2', ?, NULL)
      `).run(orderId, now);

      // 2. Insert record with specific gateway_trans_no -> must succeed
      db.prepare(`
        INSERT INTO payment_attempts (attempt_id, order_id, gateway_txn_id, method, amount, status, idempotency_key, created_at, gateway_trans_no)
        VALUES ('TEST_ATT_3', ?, 'GW_T3', 'ATM', 50000, 'SUCCESS', 'IDEMP_T3', ?, '14000123')
      `).run(orderId, now);

      // 3. Insert duplicate gateway_trans_no -> must fail
      expect(() => {
        db.prepare(`
          INSERT INTO payment_attempts (attempt_id, order_id, gateway_txn_id, method, amount, status, idempotency_key, created_at, gateway_trans_no)
          VALUES ('TEST_ATT_4', ?, 'GW_T4', 'ATM', 50000, 'SUCCESS', 'IDEMP_T4', ?, '14000123')
        `).run(orderId, now);
      }).toThrow(/UNIQUE constraint failed/);

      // Clean up
      db.prepare("DELETE FROM payment_attempts WHERE attempt_id IN ('TEST_ATT_1', 'TEST_ATT_2', 'TEST_ATT_3')").run();
    });
  });
});
