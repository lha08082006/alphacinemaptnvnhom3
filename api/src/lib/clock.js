'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_FILE || path.join(__dirname, '../../../data/beta.sqlite');

let _db = null;
function getDb() {
  if (!_db) {
    _db = new Database(dbPath, { readonly: false });
  }
  return _db;
}

let frozenMs = null;

function realNowMs() {
  return Date.now();
}

function _getOffsetMs() {
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'clock_offset_ms'").get();
    return row ? parseInt(row.value, 10) : 0;
  } catch (err) {
    return 0; // Chưa có bảng hoặc lỗi
  }
}

function _setOffsetMs(val) {
  try {
    getDb().prepare(`
      INSERT INTO settings (key, value, updated_at) 
      VALUES ('clock_offset_ms', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(val.toString(), new Date().toISOString());
  } catch (err) {
    // ignore
  }
}

function nowMs() {
  return frozenMs !== null ? frozenMs : realNowMs() + _getOffsetMs();
}

function now() {
  return new Date(nowMs());
}

function nowIso() {
  return now().toISOString();
}

function advance(ms) {
  if (!Number.isFinite(ms) || ms < 0) throw new RangeError('advance(ms) chỉ nhận số không âm');
  if (frozenMs !== null) {
    frozenMs += ms;
  } else {
    _setOffsetMs(_getOffsetMs() + ms);
  }
  return nowIso();
}

function advanceMinutes(minutes) {
  return advance(minutes * 60 * 1000);
}

function freeze(iso) {
  const ms = iso === undefined ? nowMs() : Date.parse(iso);
  if (Number.isNaN(ms)) throw new TypeError(`Mốc thời gian không hợp lệ: ${iso}`);
  frozenMs = ms;
  return nowIso();
}

function unfreeze() {
  if (frozenMs !== null) {
    _setOffsetMs(frozenMs - realNowMs());
    frozenMs = null;
  }
  return nowIso();
}

function reset() {
  _setOffsetMs(0);
  frozenMs = null;
}

function state() {
  return { now: nowIso(), offsetMs: _getOffsetMs(), frozen: frozenMs !== null };
}

module.exports = { now, nowIso, nowMs, advance, advanceMinutes, freeze, unfreeze, reset, state };
