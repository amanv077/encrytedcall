import { useEffect, useCallback, useRef, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import {
  setMessages,
  prependMessages,
  appendMessage,
  updateMessage,
  setLoading,
  setHasMore,
  setSending,
  selectMessages,
  selectIsLoading,
  selectHasMore,
  selectIsSending,
} from '../../../store/chatSlice';
import { chatService } from '../utils/chatService';
import { storageService } from '../utils/storageService';

const PAGE_SIZE = 50;

/**
 * useChat – drives the chat state for the currently active room.
 *
 * @param {string|null} roomId
 * @returns {{
 *   messages: TimelineItem[],
 *   isLoading: boolean,
 *   isSending: boolean,
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
  const sendingSelector = useMemo(() => selectIsSending(roomId), [roomId]);

  const messages = useSelector(msgSelector, shallowEqual);
  const isLoading = useSelector(loadingSelector);
  const hasMore = useSelector(hasMoreSelector);
  const isSending = useSelector(sendingSelector);

  // Track how many messages we've already loaded so loadMore can offset correctly
  const loadedCountRef = useRef(0);

  // ── Initial load when room changes ─────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;

    loadedCountRef.current = 0;

    const loadInitial = async () => {
      dispatch(setLoading({ roomId, loading: true }));

      // 1. Try local SQLite first (fast) — must await, worker is async
      let items = storageService.isReady
        ? await storageService.getMessages(roomId, PAGE_SIZE, 0)
        : [];

      // If every item has an empty body the rows were encrypted with a
      // previous session key (now destroyed) — treat that as "no usable
      // data" so we always fall through to the Matrix SDK fallback.
      const hasUsableContent = items.some((m) => m.body && m.body.trim().length > 0);
      if (!hasUsableContent) items = [];

      // 2. If SQLite has nothing, hydrate from the Matrix SDK's in-memory timeline
      if (items.length === 0) {
        items = chatService.getInMemoryTimeline(roomId);
        // Persist so FTS5 is populated for search this session
        items.forEach((item) => storageService.saveEvent(item));
      }

      // 3. If still nothing, fetch from homeserver
      if (items.length === 0) {
        items = await chatService.fetchRoomHistory(roomId, PAGE_SIZE);
      }

      dispatch(setMessages({ roomId, messages: items }));
      dispatch(setHasMore({ roomId, hasMore: items.length >= PAGE_SIZE }));
      loadedCountRef.current = items.length;
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
        loadedCountRef.current += 1;
      }
    });

    return unsubscribe;
  }, [roomId, dispatch]);

  // ── Send a message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text) => {
      if (!roomId || !text?.trim()) return;

      dispatch(setSending({ roomId, sending: true }));

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
      } finally {
        dispatch(setSending({ roomId, sending: false }));
      }
    },
    [roomId, dispatch],
  );

  // ── Load more (pagination) ─────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!roomId || isLoading || !hasMore) return;

    dispatch(setLoading({ roomId, loading: true }));

    const offset = loadedCountRef.current;

    // Try SQLite first — must await, worker is async
    let older = storageService.isReady
      ? await storageService.getMessages(roomId, PAGE_SIZE, offset)
      : [];

    // If SQLite doesn't have older messages, fetch from homeserver
    if (older.length === 0) {
      older = await chatService.fetchRoomHistory(roomId, PAGE_SIZE);
      // fetchRoomHistory returns the full in-memory timeline, so deduplicate
      const existingIds = new Set(messages.map((m) => m.eventId));
      older = older.filter((m) => !existingIds.has(m.eventId));
    }

    if (older.length > 0) {
      dispatch(prependMessages({ roomId, messages: older }));
      loadedCountRef.current += older.length;
    }

    dispatch(setHasMore({ roomId, hasMore: older.length >= PAGE_SIZE }));
    dispatch(setLoading({ roomId, loading: false }));
  }, [roomId, isLoading, hasMore, messages, dispatch]);

  return { messages, isLoading, isSending, hasMore, sendMessage, loadMore };
}
