'use strict';

const fs = require('fs');
const path = require('path');
const { env } = require('./src/config/env');

function sqliteConfig(filename) {
  if (filename !== ':memory:') {
    // Tạo sẵn thư mục data\ để knex CLI và server đều chạy được ngay lần đầu
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }

  return {
    client: 'better-sqlite3',
    connection: { filename },
    useNullAsDefault: true,
    migrations: { directory: path.join(__dirname, 'src', 'db', 'migrations') },
    seeds: { directory: path.join(__dirname, 'src', 'db', 'seeds') },
    pool: {
      afterCreate(conn, done) {
        conn.pragma('foreign_keys = ON');
        conn.pragma('busy_timeout = 5000');
        if (filename !== ':memory:') conn.pragma('journal_mode = WAL');
        done(null, conn);
      },
    },
  };
}

const resolvedDbPath = process.env.VERCEL ? path.join('/tmp', 'beta.sqlite') : env.DB_PATH;
const config = sqliteConfig(resolvedDbPath);

module.exports = {
  development: config,
  test: config,
  production: config,
};
