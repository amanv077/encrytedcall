import { useMemo } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { selectMessages } from '../../../store/chatSlice';
import { matrixManager } from '../utils/matrixClient';
import { normalizeMatrixEvent } from '../utils/timelineService';

/**
 * useTimeline – produces a sorted, merged timeline for a given room.
 *
 * Merges:
 *  - Persisted / live chat messages (from Redux / SQLite)
 *  - Call history events  (m.call.* from Matrix SDK room timeline)
 *  - Inline room invite items (m.room.member with membership=invite)
 *
 * Returns a stable, sorted array of TypedTimelineItem objects.
 *
 * @param {string|null} roomId
 * @returns {TimelineItem[]}
 */
export function useTimeline(roomId) {
  // Memoize the parameterized selector so the function reference is stable
  // between renders. React-Redux v9 throws when the selector changes every render.
  const roomMessagesSelector = useMemo(() => selectMessages(roomId), [roomId]);
  const messages = useSelector(roomMessagesSelector, shallowEqual);

  const timeline = useMemo(() => {
    if (!roomId) return [];

    // Grab additional event types (call events, system, invites) directly
    // from the Matrix SDK's in-memory room timeline.  These are merged with
    // messages already in Redux so nothing is double-counted.
    const extraItems = [];
    const client = matrixManager.getClient();
    const room = client?.getRoom(roomId);

    if (room) {
      const myUserId = client.getUserId();
      const events = room.getLiveTimeline?.()?.getEvents?.() || [];

      for (const evt of events) {
        const t = evt.getType();
        // Only extract event types not already stored as 'message' in Redux
        if (
          t === 'm.call.invite' ||
          t === 'm.call.answer' ||
          t === 'm.call.hangup' ||
          t === 'm.call.reject' ||
          t === 'm.room.member' ||
          t === 'm.room.create' ||
          t === 'm.room.encryption'
        ) {
          const item = normalizeMatrixEvent(evt, myUserId);
          if (item) extraItems.push(item);
        }
      }
    }

    // Build a merged set, deduplicating by eventId
    const seen = new Set(messages.map((m) => m.eventId));
    const merged = [...messages];

    for (const item of extraItems) {
      if (!seen.has(item.eventId)) {
        seen.add(item.eventId);
        merged.push(item);
      }
    }

    // Sort ascending by timestamp
    merged.sort((a, b) => a.timestamp - b.timestamp);

    return merged;
  }, [roomId, messages]);

  return timeline;
}
