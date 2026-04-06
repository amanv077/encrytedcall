import { useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import {
  setMessages,
  prependMessages,
  appendMessage,
  updateMessage,
  setLoading,
  setHasMore,
  selectMessages,
  selectIsLoading,
  selectHasMore,
} from '../../../store/chatSlice';
import { chatService } from '../utils/chatService';
import { storageService } from '../utils/storageService';

/** Initial view: messages from the last 24h only, capped for a light first paint. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const INITIAL_WINDOW_LIMIT = 40;
const LOAD_MORE_PAGE_SIZE = 35;

/**
 * useChat – drives the chat state for the currently active room.
 *
 * @param {string|null} roomId
 * @returns {{
 *   messages: TimelineItem[],
 *   isLoading: boolean,
 *   hasMore: boolean,
 *   sendMessage: (text: string) => Promise<void>,
 *   loadMore: () => Promise<void>,
 * }}
 */
export function useChat(roomId) {
  const dispatch = useDispatch();

  // Memoize each parameterized selector so the function reference is stable
  // between renders — React-Redux v9 throws when the selector changes every render.
  const msgSelector = useMemo(() => selectMessages(roomId), [roomId]);
  const loadingSelector = useMemo(() => selectIsLoading(roomId), [roomId]);
  const hasMoreSelector = useMemo(() => selectHasMore(roomId), [roomId]);

  const messages = useSelector(msgSelector, shallowEqual);
  const isLoading = useSelector(loadingSelector);
  const hasMore = useSelector(hasMoreSelector);

  // ── Initial load when room changes ─────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;

    const loadInitial = async () => {
      dispatch(setLoading({ roomId, loading: true }));

      const minTs = Date.now() - ONE_DAY_MS;

      // 1. SQLite: newest chunk within the last 24h only (lazy older on scroll).
      let items = storageService.isReady
        ? await storageService.getRecentMessagesSince(
            roomId,
            minTs,
            INITIAL_WINDOW_LIMIT,
          )
        : [];

      // If every item has an empty body the rows were encrypted with a
      // previous session key (now destroyed) — treat that as "no usable
      // data" so we always fall through to the Matrix SDK fallback.
      const hasUsableContent = items.some((m) => m.body && m.body.trim().length > 0);
      if (!hasUsableContent) items = [];

      // 2. In-memory Matrix timeline (same 24h window + cap).
      if (items.length === 0) {
        items = chatService.getRecentInMemoryTimeline(
          roomId,
          minTs,
          INITIAL_WINDOW_LIMIT,
        );
        items.forEach((item) => storageService.saveEvent(item));
      }

      // 3. Homeserver until the window has something or scrollback stops.
      if (items.length === 0) {
        items = await chatService.fetchRecentRoomHistory(
          roomId,
          minTs,
          INITIAL_WINDOW_LIMIT,
        );
      }

      // 4. Nothing in the last 24h — show the newest page anyway so the thread isn't blank.
      if (items.length === 0 && storageService.isReady) {
        items = await storageService.getLatestMessages(roomId, INITIAL_WINDOW_LIMIT);
        const ok = items.some((m) => m.body && m.body.trim().length > 0);
        if (!ok) items = [];
      }
      if (items.length === 0) {
        items = chatService.getLatestInMemoryTimeline(roomId, INITIAL_WINDOW_LIMIT);
        items.forEach((item) => storageService.saveEvent(item));
      }
      if (items.length === 0) {
        const full = await chatService.fetchRoomHistory(roomId, Math.max(50, INITIAL_WINDOW_LIMIT));
        if (full.length > INITIAL_WINDOW_LIMIT) {
          items = full.slice(-INITIAL_WINDOW_LIMIT);
        } else {
          items = full;
        }
      }

      dispatch(setMessages({ roomId, messages: items }));
      dispatch(setHasMore({ roomId, hasMore: items.length > 0 }));
      dispatch(setLoading({ roomId, loading: false }));
    };

    loadInitial();
  }, [roomId, dispatch]);

  // ── Subscribe to live incoming events ──────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;

    const unsubscribe = chatService.subscribe((item) => {
      if (item.roomId !== roomId) return;

      if (item.isUpdate) {
        // Event.decrypted callback: replace the existing placeholder (same
        // eventId) with the decrypted content or the "Unable to decrypt" state.
        dispatch(updateMessage({ roomId, tempId: item.eventId, message: item }));
      } else {
        dispatch(appendMessage({ roomId, message: item }));
      }
    });

    return unsubscribe;
  }, [roomId, dispatch]);

  // ── Send a message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text) => {
      if (!roomId || !text?.trim()) return;

      // Optimistic local echo
      const tempId = `local-echo-${Date.now()}`;
      const echoItem = {
        type: 'message',
        eventId: tempId,
        roomId,
        sender: 'me', // overwritten when the real event arrives
        senderName: 'You',
        body: text.trim(),
        msgtype: 'm.text',
        timestamp: Date.now(),
        isOutgoing: true,
        isEncrypted: true,
        status: 'sending',
      };
      dispatch(appendMessage({ roomId, message: echoItem }));

      try {
        const { eventId } = await chatService.sendMessage(roomId, text);
        // Replace echo with the confirmed event ID
        dispatch(
          updateMessage({
            roomId,
            tempId,
            message: { ...echoItem, eventId, status: 'delivered' },
          }),
        );
      } catch (err) {
        console.error('[useChat] sendMessage failed:', err);
        // Mark the echo as failed
        dispatch(
          updateMessage({
            roomId,
            tempId,
            message: { ...echoItem, status: 'failed' },
          }),
        );
      }
    },
    [roomId, dispatch],
  );

  // ── Load more (pagination) ─────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!roomId || isLoading || !hasMore) return;

    const oldest = messages[0];
    const oldestTs = oldest?.timestamp;
    if (oldestTs == null) {
      dispatch(setHasMore({ roomId, hasMore: false }));
      return;
    }

    dispatch(setLoading({ roomId, loading: true }));

    const existingIds = new Set(messages.map((m) => m.eventId));

    let older = storageService.isReady
      ? await storageService.getMessagesOlderThan(
          roomId,
          oldestTs,
          LOAD_MORE_PAGE_SIZE,
        )
      : [];

    older = older.filter((m) => m.eventId && !existingIds.has(m.eventId));

    if (older.length === 0) {
      older = await chatService.fetchOlderMessages(
        roomId,
        oldestTs,
        LOAD_MORE_PAGE_SIZE,
        existingIds,
      );
    }

    if (older.length > 0) {
      dispatch(prependMessages({ roomId, messages: older }));
    }

    dispatch(setHasMore({ roomId, hasMore: older.length >= LOAD_MORE_PAGE_SIZE }));
    dispatch(setLoading({ roomId, loading: false }));
  }, [roomId, isLoading, hasMore, messages, dispatch]);

  return { messages, isLoading, hasMore, sendMessage, loadMore };
}
