'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

function sqliteConfig(filename) {
  if (filename !== ':memory:') {
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

const dbPath = process.env.DB_FILE === ':memory:' 
  ? ':memory:' 
  : path.isAbsolute(process.env.DB_FILE || '') 
    ? process.env.DB_FILE 
    : path.join(__dirname, process.env.DB_FILE || 'data/gateway.sqlite');

const config = sqliteConfig(dbPath);

module.exports = {
  development: config,
  test: config,
  production: config,
};
