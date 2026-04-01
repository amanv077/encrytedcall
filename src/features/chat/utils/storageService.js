/**
 * storageService — main-thread façade for the encrypted SQLite Web Worker.
 *
 * Architecture
 * ────────────
 *   Main thread  ──Comlink──▶  db.worker.js  ──▶  SQLite WASM (OPFS)
 *
 * The AES-GCM 256-bit session key lives ONLY in the worker's heap.
 * It is generated with extractable:false — it can never be serialised or
 * posted back to this thread.  Every message body is AES-GCM encrypted
 * before touching disk.  body_plain is cleared immediately after FTS5
 * indexing so no cleartext persists in the OPFS file.
 *
 * All public methods are async (Comlink transparently wraps worker calls in
 * Promises). Callers that don't need the result can fire-and-forget safely.
 */

import { wrap } from 'comlink';

// Lazily created — the worker is only instantiated on first call to init().
let _worker = null;
let _api = null;

function _getApi() {
  if (!_api) {
    _worker = new Worker(
      new URL('../../../workers/db.worker.js', import.meta.url),
      { type: 'module' },
    );
    _api = wrap(_worker);
  }
  return _api;
}

class StorageService {
  constructor() {
    this._ready = false;
    this._initPromise = null;
  }

  /**
   * Initialise the worker: generate the AES-GCM session key and open the
   * OPFS SQLite database.  Safe to call multiple times — idempotent.
   */
  async init() {
    if (this._ready) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = _getApi()
      .init()
      .then(() => { this._ready = true; })
      .catch((err) => {
        console.error('[storageService] Worker init failed:', err);
        this._initPromise = null;
      });

    return this._initPromise;
  }

  /** true once the worker is ready to accept queries */
  get isReady() { return this._ready; }

  // ── Write ──────────────────────────────────────────────────────────────────

  /**
   * Persist a TimelineItem.  Fire-and-forget is intentional — callers need
   * not await writes.  Errors are surfaced to the console only.
   */
  saveEvent(item) {
    if (!this._ready) return Promise.resolve();
    return _getApi().saveEvent(item).catch((err) => {
      console.error('[storageService] saveEvent error:', err);
    });
  }

  /** Mark an event as redacted and remove its content from FTS. */
  redactMessage(eventId) {
    if (!this._ready) return;
    _getApi().redactMessage(eventId).catch(console.error);
  }

  /** Replace a message body following a Matrix m.replace edit event. */
  async updateMessageBody(eventId, newBody) {
    if (!this._ready) return;
    return _getApi().updateMessageBody(eventId, newBody);
  }

  savePoll(poll) {
    if (!this._ready) return Promise.resolve();
    return _getApi().savePoll(poll).catch((err) => {
      console.error('[storageService] savePoll error:', err);
    });
  }

  saveVote(vote) {
    if (!this._ready) return Promise.resolve();
    return _getApi().saveVote(vote).catch((err) => {
      console.error('[storageService] saveVote error:', err);
    });
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  /**
   * Load paginated messages for a room (oldest-first).
   * Callers MUST await this — it crosses the worker boundary.
   */
  async getMessages(roomId, limit = 50, offset = 0) {
    if (!this._ready) return [];
    return _getApi().getMessages(roomId, limit, offset);
  }

  /**
   * FTS5 full-text search — 100 % local, BM25-ranked, prefix-aware.
   * Returns items with an extra `highlight` field containing the snippet.
   */
  async searchMessages(roomId, query, limit = 30) {
    if (!this._ready) return [];
    return _getApi().searchMessages(roomId, query, limit);
  }

  async countMessages(roomId) {
    if (!this._ready) return 0;
    return _getApi().countMessages(roomId);
  }

  async getPollsByRoom(roomId) {
    if (!this._ready) return [];
    return _getApi().getPollsByRoom(roomId);
  }

  async getVotesByPoll(pollId) {
    if (!this._ready) return [];
    return _getApi().getVotesByPoll(pollId);
  }

  // ── Sync state ─────────────────────────────────────────────────────────────

  /** Persist the Matrix next_batch token in the DB (not localStorage). */
  saveNextBatch(token) {
    if (!this._ready) return;
    _getApi().saveNextBatch(token).catch(console.error);
  }

  /** Retrieve the stored next_batch token. */
  async getNextBatch() {
    if (!this._ready) return null;
    return _getApi().getNextBatch();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Wipe all rows (keeps the DB file and session key).
   * Use on logout when also calling purge() or when you want a lighter reset.
   */
  async clearAll() {
    if (!this._ready) return;
    return _getApi().clearAll();
  }

  /**
   * Full GDPR purge:
   *  1. Destroy the AES-GCM session key (data unreadable immediately).
   *  2. Close the SQLite connection.
   *  3. Delete the OPFS file (including WAL / SHM).
   *
   * Called on logout, 30-min idle timeout, and remote wipe signal.
   */
  async purge() {
    if (!this._ready && !_api) return;
    this._ready = false;
    try {
      await _getApi().purge();
    } catch (err) {
      console.warn('[storageService] purge error:', err);
    }
    // Tear down the worker itself after purge
    if (_worker) {
      _worker.terminate();
      _worker = null;
      _api = null;
    }
    this._initPromise = null;
  }

  /** Destroy the session key only — in-memory wipe without touching the file. */
  destroySessionKey() {
    if (!this._ready) return;
    _getApi().destroySessionKey().catch(console.error);
  }
}

export const storageService = new StorageService();
