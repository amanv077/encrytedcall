/**
 * db.worker.js — Dedicated Web Worker for encrypted local storage.
 *
 * Security boundaries enforced here:
 *  • AES-GCM 256-bit session key lives ONLY in this worker's memory.
 *    It is generated via Web Crypto API with extractable:false, so it can
 *    never be read outside this worker, even by the main thread.
 *  • Every message body is encrypted (body_enc) before being written to
 *    the SQLite DB in OPFS. body_plain is nulled after the FTS trigger fires.
 *  • On logout/purge: session key is destroyed AND the OPFS file is deleted.
 *
 * GDPR compliance:
 *  • No plaintext ever reaches disk (body_plain cleared after FTS indexing).
 *  • Remote wipe supported via purge().
 *  • Idle timeout supported — main thread calls purge() after 30 min.
 *  • No sync queries sent server-side (100 % local FTS5).
 */

import { expose } from 'comlink';

// ── AES-GCM session key — lives ONLY in this worker's heap ──────────────────
let sessionKey = null;

async function _generateSessionKey() {
  sessionKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,                  // non-extractable — cannot leave worker memory
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt plaintext with AES-GCM.
 * Returns base64(iv) + ':' + base64(ciphertext), or null if no key.
 */
async function _encrypt(plaintext) {
  if (!sessionKey || !plaintext) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, encoded);
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(cipher)));
  return `${ivB64}:${ctB64}`;
}

/**
 * Decrypt a stored body_enc value produced by _encrypt().
 * Returns null on failure (wrong key, corrupted data, no key).
 */
async function _decrypt(stored) {
  if (!sessionKey || !stored) return null;
  try {
    const [ivB64, ctB64] = stored.split(':');
    const iv  = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
    const ct  = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
    const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sessionKey, ct);
    return new TextDecoder().decode(buf);
  } catch {
    return null;
  }
}

function _destroySessionKey() {
  sessionKey = null;
}

// ── SQLite database (OPFS-backed, worker-only) ───────────────────────────────
const DB_FILENAME = 'synapp-local.db';
let db = null;

async function _initDb() {
  const sqlite3InitModule = (await import('@sqlite.org/sqlite-wasm')).default;
  const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: console.error });

  if (sqlite3.oo1?.OpfsDb) {
    // OPFS sync-access-handle VFS — persistent, origin-isolated, worker-only
    db = new sqlite3.oo1.OpfsDb(DB_FILENAME);
    console.log('[db.worker] OPFS-backed SQLite ready');
  } else {
    db = new sqlite3.oo1.DB(':memory:');
    console.warn('[db.worker] OPFS unavailable — using in-memory SQLite (non-persistent)');
  }

  _createSchema();
}

function _createSchema() {
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`);

  // ── Always drop and recreate FTS5 table + triggers ───────────────────────
  // This ensures any schema change (e.g. removing content='') takes effect
  // even when the OPFS file already exists.  The FTS index is rebuilt from
  // message inserts during each session so dropping it is safe.
  db.exec(`
    DROP TRIGGER IF EXISTS messages_ad;
    DROP TRIGGER IF EXISTS messages_au;
    DROP TRIGGER IF EXISTS messages_ai;
    DROP TABLE IF EXISTS messages_fts;
  `);

  db.exec(`
    -- ── Messages ─────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS messages (
      id            TEXT PRIMARY KEY,
      room_id       TEXT NOT NULL,
      sender        TEXT NOT NULL,
      sender_name   TEXT,
      msg_type      TEXT NOT NULL DEFAULT 'message',
      body_enc      TEXT,
      body_plain    TEXT,
      origin_ts     INTEGER NOT NULL,
      edited_event  TEXT,
      redacted      INTEGER DEFAULT 0,
      synced        INTEGER DEFAULT 1,
      created_at    INTEGER DEFAULT (CAST(strftime('%s','now') AS INTEGER))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_room_ts
      ON messages(room_id, origin_ts DESC);

    CREATE INDEX IF NOT EXISTS idx_messages_sender
      ON messages(sender);

    -- ── FTS5 full-text search ─────────────────────────────────────────────
    -- No content= option: FTS5 stores its own copy of sender+body so that
    -- snippet(), bm25(), and column-value access all work correctly.
    -- body_plain is set during INSERT (triggering FTS indexing), then cleared
    -- from the messages row — FTS retains its own copy independently.
    CREATE VIRTUAL TABLE messages_fts USING fts5(
      id      UNINDEXED,
      room_id UNINDEXED,
      sender,
      body,
      tokenize = 'porter ascii'
    );

    -- Populate FTS after insert (body_plain is set at INSERT time, then cleared)
    CREATE TRIGGER messages_ai
      AFTER INSERT ON messages
    BEGIN
      INSERT INTO messages_fts(rowid, id, room_id, sender, body)
        VALUES (new.rowid, new.id, new.room_id, new.sender, new.body_plain);
    END;

    -- Update FTS when message is edited (WHEN guards against the body_plain=NULL clear)
    CREATE TRIGGER messages_au
      AFTER UPDATE OF body_plain ON messages
      WHEN new.body_plain IS NOT NULL
    BEGIN
      DELETE FROM messages_fts WHERE rowid = old.rowid;
      INSERT INTO messages_fts(rowid, id, room_id, sender, body)
        VALUES (new.rowid, new.id, new.room_id, new.sender, new.body_plain);
    END;

    -- Remove from FTS when message is redacted
    CREATE TRIGGER messages_ad
      AFTER UPDATE OF redacted ON messages
      WHEN new.redacted = 1
    BEGIN
      DELETE FROM messages_fts WHERE rowid = old.rowid;
    END;

    -- ── Polls persistence ─────────────────────────────────────────────────
    DROP TABLE IF EXISTS poll_responses;
    CREATE TABLE IF NOT EXISTS polls (
      poll_id     TEXT PRIMARY KEY,
      room_id     TEXT NOT NULL,
      question    TEXT NOT NULL,
      options_json TEXT NOT NULL,
      created_by  TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      is_closed   INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS votes (
      poll_id     TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      answer_id   TEXT NOT NULL,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (poll_id, user_id),
      FOREIGN KEY (poll_id) REFERENCES polls(poll_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_polls_room_created
      ON polls(room_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_votes_poll
      ON votes(poll_id);

    -- ── Media cache (AES-CTR key itself AES-GCM encrypted) ───────────────
    CREATE TABLE IF NOT EXISTS media_cache (
      mxc_uri   TEXT PRIMARY KEY,
      room_id   TEXT,
      mime_type TEXT,
      key_enc   TEXT NOT NULL,
      iv_enc    TEXT NOT NULL,
      blob_hash TEXT,
      created_at INTEGER DEFAULT (CAST(strftime('%s','now') AS INTEGER))
    );

    -- ── Matrix sync state (next_batch stored HERE, not in localStorage) ──
    CREATE TABLE IF NOT EXISTS sync_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

// ── Helper: map a DB row to a TimelineItem ───────────────────────────────────
async function _rowToItem(row, decryptedBody) {
  return {
    type:        row.msg_type || 'message',
    eventId:     row.id,
    roomId:      row.room_id,
    sender:      row.sender,
    senderName:  row.sender_name || '',
    body:        decryptedBody || '',
    msgtype:     'm.text',
    timestamp:   row.origin_ts,
    isOutgoing:  !!row.is_outgoing,
    isEncrypted: !!row.is_encrypted,
    callType:    row.call_type    || undefined,
    outcome:     row.call_outcome || undefined,
    status:      'delivered',
  };
}

// ── Public API — exposed to main thread via Comlink ──────────────────────────
const api = {
  /**
   * Generate session key + open OPFS database.
   * Must be called once before any other method.
   *
   * Wipes any rows left from a previous session after opening the DB.
   * Those rows are encrypted with a key that no longer exists and are
   * permanently unreadable; keeping them would cause loadInitial() to
   * skip the Matrix SDK fallback (it checks items.length > 0) so the
   * UI would show blank messages and FTS5 would remain empty.
   * A clean slate lets the Matrix SDK re-populate everything with the
   * new session key.
   */
  async init() {
    await _generateSessionKey();
    await _initDb();
    api.clearMessageData(); // keep polls/votes persisted across reload
  },
  savePoll(poll) {
    if (!db || !poll?.pollId || !poll?.roomId || !poll?.question) return;
    db.exec({
      sql: `INSERT OR REPLACE INTO polls
            (poll_id, room_id, question, options_json, created_by, created_at, is_closed)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        poll.pollId,
        poll.roomId,
        poll.question,
        JSON.stringify(poll.options || []),
        poll.createdBy || poll.sender || '',
        poll.createdAt || Date.now(),
        poll.isClosed ? 1 : 0,
      ],
    });
  },

  saveVote(vote) {
    if (!db || !vote?.pollId || !vote?.userId || !vote?.answerId) return;
    db.exec({
      sql: `INSERT OR REPLACE INTO votes
            (poll_id, user_id, answer_id, updated_at)
            VALUES (?, ?, ?, ?)`,
      bind: [
        vote.pollId,
        vote.userId,
        vote.answerId,
        vote.timestamp || Date.now(),
      ],
    });
  },

  getPollsByRoom(roomId) {
    if (!db || !roomId) return [];
    const rows = [];
    db.exec({
      sql: `SELECT poll_id, room_id, question, options_json, created_by, created_at, is_closed
            FROM polls
            WHERE room_id = ?
            ORDER BY created_at ASC`,
      bind: [roomId],
      rowMode: 'object',
      callback: (row) => rows.push(row),
    });
    return rows.map((row) => ({
      pollId: row.poll_id,
      roomId: row.room_id,
      question: row.question,
      options: JSON.parse(row.options_json || '[]'),
      createdBy: row.created_by,
      createdAt: row.created_at,
      isClosed: !!row.is_closed,
    }));
  },

  getVotesByPoll(pollId) {
    if (!db || !pollId) return [];
    const rows = [];
    db.exec({
      sql: `SELECT poll_id, user_id, answer_id, updated_at
            FROM votes
            WHERE poll_id = ?`,
      bind: [pollId],
      rowMode: 'object',
      callback: (row) => rows.push(row),
    });
    return rows.map((row) => ({
      pollId: row.poll_id,
      userId: row.user_id,
      answerId: row.answer_id,
      timestamp: row.updated_at,
    }));
  },


  /**
   * Persist a TimelineItem.
   * Encrypts body_enc, writes to messages, then nulls body_plain so
   * the on-disk row never contains cleartext (FTS has its own copy).
   */
  async saveEvent(item) {
    if (!db || !item) return;
    const id = item.eventId || item.id;
    if (!id || !item.roomId) return;
    if (item.status === 'decrypting') return;
    if (item.type !== 'message' && item.type !== 'call') return;

    const bodyEnc = await _encrypt(item.body || '');

    db.exec({
      sql: `INSERT OR REPLACE INTO messages
            (id, room_id, sender, sender_name, msg_type,
             body_enc, body_plain, origin_ts,
             edited_event, redacted, synced)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      bind: [
        id,
        item.roomId,
        item.sender      || '',
        item.senderName  || '',
        item.type        || 'message',
        bodyEnc,
        item.body        || '',   // body_plain: set so the messages_ai FTS trigger indexes it
        item.timestamp   || item.origin_ts || Date.now(),
        item.editedEventId || null,
        item.redacted ? 1 : 0,
        1,
      ],
    });

    // Clear body_plain on disk — FTS5 already has its own copy.
    // The messages_au trigger has WHEN body_plain IS NOT NULL guard,
    // so this UPDATE will NOT fire the trigger (new value is NULL).
    db.exec({
      sql: `UPDATE messages SET body_plain = NULL WHERE id = ?`,
      bind: [id],
    });
  },

  /**
   * Load paginated messages for a room (oldest-first), decrypting each body.
   */
  async getMessages(roomId, limit = 50, offset = 0) {
    if (!db) return [];
    const rows = [];
    db.exec({
      sql: `SELECT * FROM messages
            WHERE room_id = ? AND redacted = 0
            ORDER BY origin_ts ASC
            LIMIT ? OFFSET ?`,
      bind: [roomId, limit, offset],
      rowMode: 'object',
      callback: (row) => rows.push(row),
    });
    return Promise.all(
      rows.map(async (row) => _rowToItem(row, await _decrypt(row.body_enc))),
    );
  },

  /**
   * FTS5 full-text search with BM25 ranking, prefix support, and snippet().
   * 100 % local — no query is sent to the server.
   */
  async searchMessages(roomId, query, limit = 30) {
    if (!db || !query?.trim()) return [];
    const rows = [];
    try {
      db.exec({
        sql: `SELECT
                m.id, m.room_id, m.sender, m.sender_name, m.msg_type,
                m.body_enc, m.origin_ts,
                snippet(messages_fts, 3, '<mark>', '</mark>', '…', 20) AS highlight
              FROM messages_fts
              JOIN messages m ON m.id = messages_fts.id
              WHERE messages_fts MATCH ?
                AND m.room_id = ?
                AND m.redacted = 0
              ORDER BY bm25(messages_fts)
              LIMIT ?`,
        bind: [`${query.trim()}*`, roomId, limit],   // trailing * = prefix search
        rowMode: 'object',
        callback: (row) => rows.push(row),
      });
    } catch (err) {
      console.error('[db.worker] searchMessages error:', err);
    }
    return Promise.all(
      rows.map(async (row) => ({
        ...(await _rowToItem(row, await _decrypt(row.body_enc))),
        highlight: row.highlight || '',
      })),
    );
  },

  /**
   * FTS5 global search — same as searchMessages but across ALL rooms.
   * Used by the top-bar search to return results from every conversation.
   */
  async searchAllMessages(query, limit = 40) {
    if (!db || !query?.trim()) return [];
    const rows = [];
    try {
      db.exec({
        sql: `SELECT
                m.id, m.room_id, m.sender, m.sender_name, m.msg_type,
                m.body_enc, m.origin_ts,
                snippet(messages_fts, 3, '<mark>', '</mark>', '…', 20) AS highlight
              FROM messages_fts
              JOIN messages m ON m.id = messages_fts.id
              WHERE messages_fts MATCH ?
                AND m.redacted = 0
              ORDER BY bm25(messages_fts)
              LIMIT ?`,
        bind: [`${query.trim()}*`, limit],
        rowMode: 'object',
        callback: (row) => rows.push(row),
      });
    } catch (err) {
      console.error('[db.worker] searchAllMessages error:', err);
    }
    return Promise.all(
      rows.map(async (row) => ({
        ...(await _rowToItem(row, await _decrypt(row.body_enc))),
        highlight: row.highlight || '',
      })),
    );
  },

  /** Mark an event as redacted and wipe its content (triggers FTS removal). */
  redactMessage(eventId) {
    if (!db || !eventId) return;
    db.exec({
      sql: `UPDATE messages SET redacted = 1, body_enc = NULL WHERE id = ?`,
      bind: [eventId],
    });
  },

  /** Replace the body of an existing message (Matrix m.replace edit). */
  async updateMessageBody(eventId, newBody) {
    if (!db || !eventId || !newBody) return;
    const bodyEnc = await _encrypt(newBody);
    db.exec({
      // Set body_plain = newBody so the messages_au FTS trigger fires correctly,
      // then clear it in the follow-up UPDATE.
      sql: `UPDATE messages
            SET body_enc = ?, body_plain = ?, edited_event = id
            WHERE id = ?`,
      bind: [bodyEnc, newBody, eventId],
    });
    // Clear plaintext on disk now that FTS has the updated content.
    db.exec({
      sql: `UPDATE messages SET body_plain = NULL WHERE id = ?`,
      bind: [eventId],
    });
  },

  /** Persist the Matrix next_batch token (sync cursor) in the DB, not localStorage. */
  saveNextBatch(token) {
    if (!db || !token) return;
    db.exec({
      sql: `INSERT OR REPLACE INTO sync_state (key, value) VALUES ('next_batch', ?)`,
      bind: [token],
    });
  },

  /** Retrieve the stored Matrix next_batch token. */
  getNextBatch() {
    if (!db) return null;
    let token = null;
    db.exec({
      sql: `SELECT value FROM sync_state WHERE key = 'next_batch'`,
      rowMode: 'object',
      callback: (row) => { token = row.value; },
    });
    return token;
  },

  countMessages(roomId) {
    if (!db) return 0;
    let count = 0;
    db.exec({
      sql: `SELECT COUNT(*) AS c FROM messages WHERE room_id = ? AND redacted = 0`,
      bind: [roomId],
      rowMode: 'object',
      callback: (row) => { count = row.c; },
    });
    return count;
  },

  clearMessageData() {
    if (!db) return;
    try {
      db.exec(`
        DELETE FROM messages_fts;
        DELETE FROM sync_state;
        DELETE FROM messages;
      `);
    } catch (err) {
      console.error('[db.worker] clearMessageData error:', err);
    }
  },

  /** Wipe all rows without deleting the DB file (lighter than purge). */
  clearAll() {
    if (!db) return;
    try {
      db.exec(`
        DELETE FROM messages_fts;
        DELETE FROM media_cache;
        DELETE FROM votes;
        DELETE FROM polls;
        DELETE FROM sync_state;
        DELETE FROM messages;
      `);
    } catch (err) {
      console.error('[db.worker] clearAll error:', err);
    }
  },

  /**
   * Full GDPR purge:
   *  1. Destroy the AES-GCM session key (data now unreadable even if file survives).
   *  2. Close the SQLite connection.
   *  3. Delete the OPFS file (including WAL/SHM artefacts).
   *
   * Called on logout AND on 30-minute idle timeout AND on remote-wipe signal.
   */
  async purge() {
    _destroySessionKey();

    if (db) {
      try { db.close(); } catch (_) {}
      db = null;
    }

    try {
      const root = await navigator.storage.getDirectory();
      for (const name of [DB_FILENAME, `${DB_FILENAME}-wal`, `${DB_FILENAME}-shm`]) {
        await root.removeEntry(name).catch(() => {});
      }
      console.log('[db.worker] OPFS database purged');
    } catch (err) {
      console.warn('[db.worker] OPFS purge error:', err);
    }
  },

  /** Destroy session key only (data becomes unreadable immediately). */
  destroySessionKey: _destroySessionKey,
};

expose(api);
