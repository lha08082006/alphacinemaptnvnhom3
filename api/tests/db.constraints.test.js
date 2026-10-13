'use strict';

const path = require('path');
const dbPath = path.join(__dirname, '../data/beta.sqlite');
const Database = require('better-sqlite3');

describe('Database Constraints', () => {
  let db;

  beforeAll(() => {
    db = new Database(dbPath, { readonly: false });
    db.pragma('foreign_keys = ON');
  });

  afterAll(() => {
    if (db) db.close();
  });

  it('should enforce CHECK on orders amount_total', () => {
    // Insert dummy user, cinema, room, movie, showtime
    const userId = 999;
    db.prepare(`INSERT OR IGNORE INTO users (id, email, role, points, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(userId, 'test1@gmail.com', 'CUSTOMER', 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    
    const showtimeId = 999;
    db.prepare(`INSERT OR IGNORE INTO movies (id, slug, title, genres_json, duration_min, age_rating, status, synopsis, director, cast_json, language, release_date, poster_style_json, trailer_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(999, 'test-movie', 'Test', '[]', 120, 'P', 'NOW_SHOWING', 'Test', 'Test', '[]', 'Test', '2026-01-01', '{}', '{}');
    db.prepare(`INSERT OR IGNORE INTO cinemas (id, code, name, city, address, hotline) VALUES (?, ?, ?, ?, ?, ?)`).run(999, 'T', 'T', 'T', 'T', 'T');
    db.prepare(`INSERT OR IGNORE INTO rooms (id, cinema_id, name, room_type) VALUES (?, ?, ?, ?)`).run(999, 999, 'T', '2D');
    db.prepare(`INSERT OR IGNORE INTO showtimes (id, movie_id, room_id, starts_at, ends_at, format, price_standard, price_vip, price_couple, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(999, 999, 999, '2026-01-01T00:00:00Z', '2026-01-01T02:00:00Z', '2D', 50000, 60000, 100000, 'OPEN');

    expect(() => {
      db.prepare(`INSERT INTO orders (order_id, user_id, showtime_id, status, amount_tickets, amount_combos, amount_total, customer_name, customer_phone, customer_email, payment_method, hold_expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('BC99999999', userId, showtimeId, 'HOLDING', 50000, 50000, 90000, 'Test', '0909', 'a@a.com', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    }).toThrow(/check_orders_amounts/); // Mismatch amount
  });

  it('should enforce max 8 seats trigger', () => {
    const orderId = 'BC88888888';
    db.prepare(`INSERT INTO orders (order_id, user_id, showtime_id, status, amount_tickets, amount_combos, amount_total, customer_name, customer_phone, customer_email, payment_method, hold_expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(orderId, 999, 999, 'HOLDING', 0, 0, 0, 'Test', '0909', 'a@a.com', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

    // Create 9 seats
    for (let i = 1; i <= 9; i++) {
      db.prepare(`INSERT OR IGNORE INTO seats (id, room_id, row_label, col_number, seat_type) VALUES (?, ?, ?, ?, ?)`).run(i+10000, 999, 'A', i, 'STANDARD');
    }

    // Insert 8 seats ok
    for (let i = 1; i <= 8; i++) {
      db.prepare(`INSERT INTO order_seats (order_id, seat_id, seat_type, price) VALUES (?, ?, ?, ?)`).run(orderId, i+10000, 'STANDARD', 0);
    }

    // Insert 9th seat should fail
    expect(() => {
      db.prepare(`INSERT INTO order_seats (order_id, seat_id, seat_type, price) VALUES (?, ?, ?, ?)`).run(orderId, 9+10000, 'STANDARD', 0);
    }).toThrow(/MAX_SEATS_EXCEEDED/);
  });
});
