'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const dbPath = path.join(__dirname, '../../../data/beta.sqlite');

try {
  const db = new Database(dbPath, { readonly: true });

  console.log('--- DATABASE CHECK ---');

  // 1. Check pragmas
  const fk = db.prepare('PRAGMA foreign_keys').get();
  console.log(`Foreign keys: ${fk.foreign_keys === 1 ? 'ON' : 'OFF'}`);
  
  const jm = db.prepare('PRAGMA journal_mode').get();
  console.log(`Journal mode: ${jm.journal_mode}`);

  // 2. Check counts
  const tables = ['users', 'movies', 'showtimes', 'orders', 'order_seats'];
  for (const t of tables) {
    const res = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get();
    console.log(`Table ${t}: ${res.c} rows`);
  }

  // 3. Hanging transactions
  const hanging = db.prepare(`SELECT COUNT(*) AS c FROM orders WHERE status = 'AWAITING_PAYMENT'`).get();
  console.log(`Hanging orders (AWAITING_PAYMENT): ${hanging.c}`);

  db.close();
  process.exit(0);
} catch (err) {
  console.error('Error during db check:', err.message);
  process.exit(1);
}
