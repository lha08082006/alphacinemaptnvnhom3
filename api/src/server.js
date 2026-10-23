'use strict';

let env;
try {
  ({ env } = require('./config/env'));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const { createApp } = require('./app');
const knex = require('./db/knex');
const logger = require('./lib/logger');
const scheduler = require('./jobs/scheduler');

const app = createApp();

let server;

async function bootstrap() {
  if (process.env.VERCEL) {
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
      logger.error('[vercel] Lỗi khởi tạo SQLite:', { error: err.message });
    }
  }

  server = app.listen(env.PORT, () => {
    logger.info('server_started', {
      service: 'beta-api',
      env: env.NODE_ENV,
      port: env.PORT,
      health: `http://localhost:${env.PORT}/api/v1/health`,
    });
    scheduler.start();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Cổng ${env.PORT} đang bị chương trình khác dùng. Đổi PORT trong api\\.env hoặc tắt chương trình đó.`);
    } else {
      logger.error('server_error', { cause: err.message });
    }
    process.exit(1);
  });
}

bootstrap();

function shutdown(signal) {
  logger.info('server_stopping', { signal });
  scheduler.stop();
  server.close(async () => {
    await knex.destroy();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', shutdown); // Ctrl+C trong PowerShell
process.on('SIGTERM', shutdown);
