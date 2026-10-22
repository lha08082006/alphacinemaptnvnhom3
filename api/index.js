'use strict';

const { createApp } = require('./src/app');
const knex = require('./src/db/knex');
const logger = require('./src/lib/logger');

let appInstance = null;
let dbInitPromise = null;

async function ensureDatabase() {
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    try {
      const hasCinemas = await knex.schema.hasTable('cinemas');
      if (!hasCinemas) {
        logger.info('[vercel] Database SQLite trong /tmp chưa có bảng. Bắt đầu migrate...');
        await knex.migrate.latest();
        logger.info('[vercel] Migrate thành công. Bắt đầu nạp seed dữ liệu demo...');
        await knex.seed.run();
        logger.info('[vercel] Khởi tạo CSDL SQLite /tmp hoàn tất!');
      }
    } catch (err) {
      dbInitPromise = null; // Cho phép thử lại nếu lần đầu bị lỗi
      logger.error('[vercel] Lỗi khởi tạo SQLite:', { error: err.message });
      throw err;
    }
  })();

  return dbInitPromise;
}

module.exports = async (req, res) => {
  if (!appInstance) {
    appInstance = createApp();
  }

  try {
    await ensureDatabase();
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(
      JSON.stringify({
        ok: false,
        error: {
          code: 'DB_INIT_FAILED',
          message: 'Lỗi khởi tạo cơ sở dữ liệu trên máy chủ: ' + (err && err.message),
        },
      })
    );
  }

  return appInstance(req, res);
};
