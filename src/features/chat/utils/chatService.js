import { matrixManager } from './matrixClient';
import { normalizeMatrixEvent } from './timelineService';
import { storageService } from './storageService';

/**
 * Keep up to maxCount messages whose timestamp falls in [minTs, ∞), chronological.
 * If there are more than maxCount, keep the maxCount newest within the window.
 */
function takeRecentWithinWindow(items, minTs, maxCount) {
  const filtered = items
    .filter((m) => (m.timestamp ?? 0) >= minTs)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  if (filtered.length <= maxCount) return filtered;
  return filtered.slice(-maxCount);
}

/**
 * chatService – Matrix text messaging layer.
 *
 * Responsibilities:
 *  - Send E2EE messages to a room
 *  - Listen for incoming timeline events and fan them out to subscribers
 *  - Fetch paginated room history from the homeserver
 */
class ChatService {
  constructor() {
    /** @type {Set<function>} */
    this._listeners = new Set();
    /** @type {function|null} internal Matrix event handler (for cleanup) */
    this._timelineHandler = null;
    this._decryptedHandler = null;
  }

  // ─── Timeline listener lifecycle ─────────────────────────────────────────

  /**
   * Attach room timeline listeners to the Matrix client.
   * Safe to call multiple times — removes previous listeners first.
   */
  initTimelineListeners() {
    const client = matrixManager.getClient();
    if (!client) return;

    this._removeListeners(client);

    this._timelineHandler = (event, room, toStartOfTimeline) => {
      if (!matrixManager.isCryptoReadyForTimelinePersistence()) return;
      // Skip historical events loaded during initial sync
      if (toStartOfTimeline) return;

      // We already render our own optimistic local-echo in useChat().
      // Matrix SDK may also emit a local-echo event for the same outgoing
      // message, which would create a duplicate bubble in the sender UI.
      // Ignore SDK local-echo timeline entries from the current user.
      const myUserId = client.getUserId?.();
      const isOwnEvent = event.getSender?.() === myUserId;
      const eventId = event.getId?.();
      const isSdkLocalEcho =
        !eventId ||
        eventId.startsWith('~') || // matrix-js-sdk local echo id pattern
        event.status != null ||    // sending / queued local status
        !!event.getUnsigned?.()?.transaction_id;
      if (isOwnEvent && isSdkLocalEcho) return;

      const type = event.getType();

      // Handle redactions: remove the target event from local storage
      if (type === 'm.room.redaction') {
        const redacts = event.event?.redacts || event.getAssociatedId?.();
        if (redacts) storageService.redactMessage(redacts);
        return;
      }

      // Handle edits (m.replace relationship): update the body in local storage
      if (type === 'm.room.message') {
        const rel = event.getContent()?.['m.relates_to'];
        if (rel?.rel_type === 'm.replace' && rel.event_id) {
          const newBody = event.getContent()?.['m.new_content']?.body;
          if (newBody) storageService.updateMessageBody(rel.event_id, newBody);
          return;
        }
      }

      this._handleEvent(event, false);
    };

    // Event.decrypted fires after the SDK finishes a decryption attempt —
    // either successfully (event type changes to m.room.message) or with a
    // permanent failure (isDecryptionFailure() returns true).  In both cases
    // we want to UPDATE the existing placeholder rather than append a duplicate.
    this._decryptedHandler = (event) => {
      if (!matrixManager.isCryptoReadyForTimelinePersistence()) return;
      this._handleEvent(event, true);
    };

    client.on('Room.timeline', this._timelineHandler);
    client.on('Event.decrypted', this._decryptedHandler);
  }

  /** Tear down timeline listeners (called on logout). */
  disposeListeners() {
    const client = matrixManager.getClient();
    if (client) this._removeListeners(client);
  }

  _removeListeners(client) {
    if (this._timelineHandler) {
      client.removeListener('Room.timeline', this._timelineHandler);
      this._timelineHandler = null;
    }
    if (this._decryptedHandler) {
      client.removeListener('Event.decrypted', this._decryptedHandler);
      this._decryptedHandler = null;
    }
  }

  /**
   * @param {import('matrix-js-sdk').MatrixEvent} event
   * @param {boolean} isUpdate  true when called from Event.decrypted — the
   *   subscriber should REPLACE an existing item rather than append a new one.
   */
  _handleEvent(event, isUpdate) {
    if (!matrixManager.isCryptoReadyForTimelinePersistence()) return;
    const client = matrixManager.getClient();
    if (!client) return;
    const myUserId = client.getUserId();

    const item = normalizeMatrixEvent(event, myUserId);
    if (!item) return;

    item.isUpdate = isUpdate;

    // Persist to local SQLite (overwrites any previous placeholder)
    storageService.saveEvent(item);

    // Notify subscribers (hooks, etc.)
    this._notify(item);
  }

  // ─── Pub / sub ────────────────────────────────────────────────────────────

  /**
   * Subscribe to new timeline items.
   * @param {function(TimelineItem): void} listener
   * @returns {function} unsubscribe function
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notify(item) {
    this._listeners.forEach((l) => {
      try { l(item); } catch (e) { console.error('[chatService] listener error:', e); }
    });
  }

  // ─── Sending ──────────────────────────────────────────────────────────────

  /**
   * Send a plain-text message to a room (E2EE when enabled on the room).
   *
   * @param {string} roomId
   * @param {string} body
   * @returns {Promise<{ eventId: string }>}
   */
  async sendMessage(roomId, body) {
    const client = matrixManager.getClient();
    if (!client) throw new Error('Matrix client not initialized.');
    if (!body?.trim()) throw new Error('Message body cannot be empty.');

    const res = await client.sendMessage(roomId, {
      msgtype: 'm.text',
      body: body.trim(),
    });

    return { eventId: res.event_id };
  }

  // ─── History ──────────────────────────────────────────────────────────────

  /**
   * Load older messages for a room from the homeserver.
   *
   * @param {string} roomId
   * @param {number} [limit=30]
   * @returns {Promise<TimelineItem[]>}
   */
  async fetchRoomHistory(roomId, limit = 30) {
    const client = matrixManager.getClient();
    if (!client) return [];

    const room = client.getRoom(roomId);
    if (!room) return [];

    try {
      await client.scrollback(room, limit);
    } catch (err) {
      console.warn('[chatService] scrollback error:', err);
      return [];
    }

    const myUserId = client.getUserId();
    const timeline = room.getLiveTimeline?.()?.getEvents?.() || [];

    const items = timeline
      .map((evt) => normalizeMatrixEvent(evt, myUserId))
      .filter(Boolean);

    // Persist any events we haven't stored yet
    items.forEach((item) => storageService.saveEvent(item));

    return items;
  }

  /**
   * Get a snapshot of the current in-memory timeline for a room from the SDK.
   * Used for the initial load when SQLite has no data yet.
   *
   * @param {string} roomId
   * @returns {TimelineItem[]}
   */
  getInMemoryTimeline(roomId) {
    const client = matrixManager.getClient();
    if (!client) return [];

    const room = client.getRoom(roomId);
    if (!room) return [];

    const myUserId = client.getUserId();
    const events = room.getLiveTimeline?.()?.getEvents?.() || [];

    return events.map((evt) => normalizeMatrixEvent(evt, myUserId)).filter(Boolean);
  }

  /**
   * In-memory timeline: up to maxCount newest messages with ts >= minTs.
   */
  getRecentInMemoryTimeline(roomId, minTs, maxCount) {
    const items = this.getInMemoryTimeline(roomId);
    return takeRecentWithinWindow(items, minTs, maxCount);
  }

  /**
   * Hydrate from the server until some messages fall in [minTs, ∞) or scrollback stalls.
   */
  async fetchRecentRoomHistory(roomId, minTs, maxCount) {
    const client = matrixManager.getClient();
    if (!client) return [];

    const room = client.getRoom(roomId);
    if (!room) return [];

    const myUserId = client.getUserId();
    let prevTimelineLen = -1;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const timeline = room.getLiveTimeline?.()?.getEvents?.() || [];
      const items = timeline
        .map((evt) => normalizeMatrixEvent(evt, myUserId))
        .filter(Boolean);

      items.forEach((item) => storageService.saveEvent(item));

      const recent = takeRecentWithinWindow(items, minTs, maxCount);
      if (recent.length > 0) return recent;

      if (attempt > 0 && timeline.length === prevTimelineLen) break;
      prevTimelineLen = timeline.length;

      try {
        await client.scrollback(room, Math.max(40, maxCount));
      } catch (err) {
        console.warn('[chatService] fetchRecentRoomHistory scrollback:', err);
        break;
      }
    }

    return [];
  }

  /**
   * Most recent `maxCount` messages from the live timeline (any age). Used when
   * the 24h window is empty but the room still has history.
   */
  getLatestInMemoryTimeline(roomId, maxCount) {
    const items = this.getInMemoryTimeline(roomId);
    if (items.length <= maxCount) return items;
    return items.slice(-maxCount);
  }

  /**
   * Messages strictly older than oldestTs, excluding ids already in the UI.
   */
  async fetchOlderMessages(roomId, oldestTs, limit, excludeIds) {
    const client = matrixManager.getClient();
    if (!client) return [];

    const room = client.getRoom(roomId);
    if (!room) return [];

    const myUserId = client.getUserId();
    let prevTimelineLen = -1;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const timeline = room.getLiveTimeline?.()?.getEvents?.() || [];
      const items = timeline
        .map((evt) => normalizeMatrixEvent(evt, myUserId))
        .filter(Boolean);

      items.forEach((item) => storageService.saveEvent(item));

      const candidates = items.filter(
        (m) =>
          (m.timestamp ?? 0) < oldestTs &&
          m.eventId &&
          !excludeIds.has(m.eventId),
      );
      candidates.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
      const batch = candidates.slice(0, limit).reverse();
      if (batch.length > 0) return batch;

      if (attempt > 0 && timeline.length === prevTimelineLen) break;
      prevTimelineLen = timeline.length;

      try {
        await client.scrollback(room, limit);
      } catch (err) {
        console.warn('[chatService] fetchOlderMessages scrollback:', err);
        break;
      }
    }

    return [];
  }
}

export const chatService = new ChatService();
