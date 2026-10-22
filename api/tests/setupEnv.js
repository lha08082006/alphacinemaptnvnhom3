'use strict';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.DB_FILE = 'data/beta.sqlite';
process.env.WEBHOOK_SECRET = 'test_webhook_secret_0123456789';
process.env.JWT_SECRET = 'test_jwt_secret_0123456789';
process.env.LOG_LEVEL = 'silent';

process.env.VNPAY_TMN_CODE = 'TEST_TMN';
process.env.VNPAY_HASH_SECRET = 'TEST_SECRET_123456';
process.env.VNPAY_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
process.env.VNPAY_API_URL = 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction';
process.env.VNPAY_RETURN_URL = 'http://localhost:4000/api/v1/payment/vnpay/return';
process.env.VNPAY_TRUST_RETURN = 'false';

process.env.SEPAY_MERCHANT_ID = 'SP-TEST-LH272A54';
process.env.SEPAY_SECRET_KEY = 'spsk_test_QmTCuBKcB4kdQvMX6mNAT3jZ2BWESmML';
process.env.SEPAY_ENV = 'sandbox';
process.env.SEPAY_RETURN_URL = 'http://localhost:4000/result.html';
process.env.SEPAY_CANCEL_URL = 'http://localhost:4000/result.html?error=cancelled';
