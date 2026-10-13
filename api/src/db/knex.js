'use strict';

const createKnex = require('knex');
const knexfile = require('../../knexfile');
const { env } = require('../config/env');

// Một instance dùng chung toàn app. Kết nối chỉ mở khi có truy vấn đầu tiên.
module.exports = createKnex(knexfile[env.NODE_ENV]);
