/**
 * storageService – persistent local message storage using SQLite WASM (OPFS backend).
 *
 * The Origin Private File System (OPFS) keeps the database inside the browser's
 * sandboxed storage, so it is never accessible to other origins and is wiped
 * automatically when the user clears site data.
 *
 * GDPR note: the database only holds already-decrypted message text that the
 * Matrix client has already processed in-browser. No additional server round-
 * trips are made. `clearAll()` removes all rows, which must be called on logout.
 */

const DB_NAME = 'encryptcall.db';
const PAGE_SIZE = 50;

class StorageService {
  constructor() {
    this._db = null;
    this._initPromise = null;
  }

  /**
   * Initialise the SQLite database. Safe to call multiple times (idempotent).
   */
  async init() {
    if (this._db) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = this._doInit();
    return this._initPromise;
  }

  async _doInit() {
    try {
      // Dynamically import to avoid blocking the main bundle parse.
      const sqlite3InitModule = (await import('@sqlite.org/sqlite-wasm')).default;

      const sqlite3 = await sqlite3InitModule({
        print: () => {},
        printErr: console.error,
      });

      // Prefer OPFS for persistence; fall back to in-memory if OPFS is unavailable.
      if (sqlite3.oo1?.OpfsDb) {
        this._db = new sqlite3.oo1.OpfsDb(DB_NAME);
        console.log('[storageService] Using OPFS-backed SQLite');
      } else {
        this._db = new sqlite3.oo1.DB(':memory:');
        console.warn('[storageService] OPFS unavailable, using in-memory SQLite (non-persistent)');
      }

      this._createSchema();
    } catch (err) {
      console.error('[storageService] Failed to initialise SQLite:', err);
      this._db = null;
      this._initPromise = null;
    }
  }

  _createSchema() {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        event_id    TEXT PRIMARY KEY,
        room_id     TEXT NOT NULL,
        sender      TEXT NOT NULL,
        sender_name TEXT,
        type        TEXT NOT NULL,
        body        TEXT,
        msgtype     TEXT,
        timestamp   INTEGER NOT NULL,
        is_outgoing INTEGER DEFAULT 0,
        is_encrypted INTEGER DEFAULT 0,
        call_type   TEXT,
        call_outcome TEXT,
        extra_json  TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_msg_room_ts
        ON messages(room_id, timestamp);

      CREATE INDEX IF NOT EXISTS idx_msg_sender
        ON messages(sender);

      -- FTS5 full-text search on message bodies
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        body,
        event_id   UNINDEXED,
        room_id    UNINDEXED,
        content    = 'messages',
        content_rowid = 'rowid'
      );

      -- Keep FTS in sync via triggers
      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, body, event_id, room_id)
          VALUES (new.rowid, new.body, new.event_id, new.room_id);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, body, event_id, room_id)
          VALUES ('delete', old.rowid, old.body, old.event_id, old.room_id);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, body, event_id, room_id)
          VALUES ('delete', old.rowid, old.body, old.event_id, old.room_id);
        INSERT INTO messages_fts(rowid, body, event_id, room_id)
          VALUES (new.rowid, new.body, new.event_id, new.room_id);
      END;
    `);
  }

  /**
   * Persist a normalised TimelineItem into SQLite.
   * Silently skips items that cannot be persisted (e.g. 'system' items).
   *
   * @param {object} item – TimelineItem produced by timelineService.normalizeMatrixEvent
   */
  saveEvent(item) {
    if (!this._db) return;
    if (!item || !item.eventId || !item.roomId) return;
    // We only store message and call events
    if (item.type !== 'message' && item.type !== 'call') return;

    try {
      this._db.exec({
        sql: `INSERT OR IGNORE INTO messages
              (event_id, room_id, sender, sender_name, type, body, msgtype,
               timestamp, is_outgoing, is_encrypted, call_type, call_outcome)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        bind: [
          item.eventId,
          item.roomId,
          item.sender || '',
          item.senderName || '',
          item.type,
          item.body || '',
          item.msgtype || null,
          item.timestamp,
          item.isOutgoing ? 1 : 0,
          item.isEncrypted ? 1 : 0,
          item.callType || null,
          item.callOutcome || item.outcome || null,
        ],
      });
    } catch (err) {
      // Duplicate event_id will be silently ignored by INSERT OR IGNORE.
      if (!err.message?.includes('UNIQUE constraint')) {
        console.error('[storageService] saveEvent error:', err);
      }
    }
  }

  /**
   * Load paginated messages for a room, ordered oldest-first.
   *
   * @param {string} roomId
   * @param {number} [limit]
   * @param {number} [offset]
   * @returns {object[]}
   */
  getMessages(roomId, limit = PAGE_SIZE, offset = 0) {
    if (!this._db) return [];

    const rows = [];
    this._db.exec({
      sql: `SELECT * FROM messages
            WHERE room_id = ?
            ORDER BY timestamp ASC
            LIMIT ? OFFSET ?`,
      bind: [roomId, limit, offset],
      rowMode: 'object',
      callback: (row) => rows.push(this._rowToItem(row)),
    });
    return rows;
  }

  /**
   * Return the total number of stored messages for a room.
   */
  countMessages(roomId) {
    if (!this._db) return 0;
    let count = 0;
    this._db.exec({
      sql: 'SELECT COUNT(*) as c FROM messages WHERE room_id = ?',
      bind: [roomId],
      rowMode: 'object',
      callback: (row) => { count = row.c; },
    });
    return count;
  }

  /**
   * Full-text search messages in a specific room.
   *
   * @param {string} roomId
   * @param {string} query
   * @param {number} [limit]
   * @returns {object[]}
   */
  searchMessages(roomId, query, limit = 30) {
    if (!this._db || !query?.trim()) return [];

    const rows = [];
    try {
      this._db.exec({
        sql: `SELECT m.* FROM messages m
              JOIN messages_fts f ON m.rowid = f.rowid
              WHERE f.messages_fts MATCH ?
                AND m.room_id = ?
              ORDER BY m.timestamp DESC
              LIMIT ?`,
        bind: [query.trim(), roomId, limit],
        rowMode: 'object',
        callback: (row) => rows.push(this._rowToItem(row)),
      });
    } catch (err) {
      console.error('[storageService] searchMessages error:', err);
    }
    return rows;
  }

  /**
   * Delete all stored messages. Called on logout for GDPR compliance.
   */
  clearAll() {
    if (!this._db) return;
    try {
      this._db.exec(`
        DELETE FROM messages_fts;
        DELETE FROM messages;
      `);
    } catch (err) {
      console.error('[storageService] clearAll error:', err);
    }
  }

  /** Convert a SQLite row object back into a TimelineItem. */
  _rowToItem(row) {
    return {
      type: row.type,
      eventId: row.event_id,
      roomId: row.room_id,
      sender: row.sender,
      senderName: row.sender_name,
      body: row.body,
      msgtype: row.msgtype,
      timestamp: row.timestamp,
      isOutgoing: !!row.is_outgoing,
      isEncrypted: !!row.is_encrypted,
      callType: row.call_type,
      outcome: row.call_outcome,
      status: 'delivered',
    };
  }

  get isReady() {
    return !!this._db;
  }
}

export const storageService = new StorageService();
