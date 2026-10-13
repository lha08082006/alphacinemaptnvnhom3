'use strict';

const path = require('path');
const dbPath = path.join(__dirname, '../data/beta.sqlite');
const Database = require('better-sqlite3');

describe('Database Seeds', () => {
  let db;

  beforeAll(() => {
    db = new Database(dbPath, { readonly: true });
  });

  afterAll(() => {
    if (db) db.close();
  });

  it('should have 40 orders', () => {
    const row = db.prepare('SELECT COUNT(*) AS count FROM orders').get();
    expect(row.count).toBe(40);
  });

  it('should have 5 hanging orders', () => {
    // Hanging order = AWAITING_PAYMENT in beta, but SUCCESS in gateway
    // We check beta here:
    const row = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'AWAITING_PAYMENT'").get();
    expect(row.count).toBeGreaterThanOrEqual(5);
  });

  it('should have settings clock_offset_ms initialized', () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'clock_offset_ms'").get();
    expect(row).toBeDefined();
    expect(row.value).toBe('0');
  });
});
