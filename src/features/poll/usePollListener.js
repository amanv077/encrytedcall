import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { savePoll, saveVote, closePoll, getPollsByRoom, getVotesByPoll } from './pollDb';

/**
 * Step 2: Real-time poll listener.
 *
 * Listens to Matrix Room.timeline and dispatches Redux actions:
 * - addPoll
 * - addVote
 * - endPoll
 */
export function usePollListener(client) {
  const dispatch = useDispatch();

  useEffect(() => {
    if (!client) return undefined;
    const seenEventIds = new Set();
    const hydratedRoomIds = new Set();
    let cancelled = false;

    const readText = (value) => {
      if (!value) return '';
      if (typeof value === 'string') return value;
      return value['org.matrix.msc1767.text'] || value.text || '';
    };

    const readPollOptions = (answers = []) =>
      (answers || []).map((answer, index) => ({
        id: answer.id || `opt_${index + 1}`,
        text: readText(answer),
      }));

    const hydrateRoomFromDb = async (roomId) => {
      if (!roomId || hydratedRoomIds.has(roomId) || cancelled) return;
      const room = client.getRoom?.(roomId);
      const myMembership = room?.getMyMembership?.();
      if (myMembership && myMembership !== 'join') return;

      hydratedRoomIds.add(roomId);
      const persistedPolls = await getPollsByRoom(roomId);
      if (cancelled || !Array.isArray(persistedPolls)) return;

      for (let j = 0; j < persistedPolls.length; j += 1) {
        const poll = persistedPolls[j];
        dispatch({ type: 'polls/addPoll', payload: poll });

        const persistedVotes = await getVotesByPoll(poll.pollId);
        if (cancelled || !Array.isArray(persistedVotes)) continue;
        for (let k = 0; k < persistedVotes.length; k += 1) {
          dispatch({ type: 'polls/addVote', payload: persistedVotes[k] });
        }

        if (poll.isClosed) {
          dispatch({ type: 'polls/endPoll', payload: { pollId: poll.pollId, roomId } });
        }
      }
    };

    const hydratePollsFromDb = async () => {
      const rooms = client.getRooms?.() || [];
      for (let i = 0; i < rooms.length; i += 1) {
        await hydrateRoomFromDb(rooms[i]?.roomId);
      }
    };

    const scheduleHydration = (attempt = 0) => {
      if (cancelled) return;
      hydratePollsFromDb()
        .catch(() => console.error('[PollListener] DB hydration failed'))
        .finally(() => {
          // Matrix rooms may not be ready on first mount; retry briefly.
          if (!cancelled && hydratedRoomIds.size === 0 && attempt < 10) {
            setTimeout(() => scheduleHydration(attempt + 1), 1000);
          }
        });
    };

    const processEvent = (event, roomId, skipHistory) => {
      if (skipHistory) return; // ignore historical backfill
      if (!event || !roomId) return;
      const room = client.getRoom?.(roomId);
      const myMembership = room?.getMyMembership?.();
      if (myMembership && myMembership !== 'join') return;

      const eventType = event.getType();
      if (import.meta.env.DEV) console.log('EVENT TYPE:', eventType);
      if (eventType === 'm.room.encrypted') return;

      const eventId = event.getId();
      if (!eventId || seenEventIds.has(eventId)) return;
      seenEventIds.add(eventId);

      const content = event.getContent() || {};
      const sender = event.getSender();
      const ts = event.getTs() || Date.now();

      // m.poll.start (stable + unstable)
      if (eventType === 'm.poll.start' || eventType === 'org.matrix.msc3381.poll.start') {
        const start = content['m.poll'] || content['m.poll.start'] || content['org.matrix.msc3381.poll.start'] || content;
        const question = readText(start.question);
        const answers = Array.isArray(start.answers) ? start.answers : [];
        if (!question || answers.length < 2) return;

        const poll = {
          pollId: eventId,
          roomId,
          createdBy: sender,
          question,
          options: readPollOptions(answers),
          maxSelections: Number(start.max_selections || content.max_selections || 1),
          kind: start.kind || content.kind || 'm.disclosed',
          createdAt: ts,
          isClosed: false,
        };

        savePoll(poll).catch(() => console.error('[PollListener] savePoll failed'));
        dispatch({ type: 'polls/addPoll', payload: poll }); // addPoll
        getVotesByPoll(poll.pollId)
          .then((persistedVotes) => {
            if (!Array.isArray(persistedVotes)) return;
            for (let i = 0; i < persistedVotes.length; i += 1) {
              dispatch({ type: 'polls/addVote', payload: persistedVotes[i] });
            }
          })
          .catch(() => console.error('[PollListener] getVotesByPoll failed'));
        return;
      }

      // m.poll.response (stable + unstable)
      if (eventType === 'm.poll.response' || eventType === 'org.matrix.msc3381.poll.response') {
        const relates = content['m.relates_to'] || {};
        const response =
          content.response ||
          content['m.poll.response'] ||
          content['org.matrix.msc3381.poll.response'] ||
          {};
        const pollId = relates.event_id;
        const answers = Array.isArray(response.answers) ? response.answers : [];

        if (!pollId) return;

        const vote = {
          voteEventId: eventId,
          roomId,
          pollId,
          userId: sender,
          answerId: answers[0] || null,
          timestamp: ts,
        };

        if (!vote.answerId) return;
        if (import.meta.env.DEV) console.log('[PollListener] saveVote payload:', vote);
        saveVote(vote).catch(() => console.error('[PollListener] saveVote failed'));
        dispatch({ type: 'polls/addVote', payload: vote }); // addVote
        return;
      }

      // m.poll.end (stable + unstable)
      if (eventType === 'm.poll.end' || eventType === 'org.matrix.msc3381.poll.end') {
        const relates = content['m.relates_to'] || {};
        const pollId = relates.event_id;
        const closingMessage = readText(content['m.new_content']) || readText(content);

        if (!pollId) return;

        const ended = {
          pollId,
          roomId,
          endedBy: sender,
          endEventId: eventId,
          endedAt: ts,
          closingMessage,
        };

        closePoll(pollId).catch(() => console.error('[PollListener] closePoll failed'));
        dispatch({ type: 'polls/endPoll', payload: ended }); // endPoll
      }
    };

    const handleTimeline = (event, room, toStartOfTimeline) => {
      hydrateRoomFromDb(room?.roomId).catch(() => console.error('[PollListener] room hydration failed'));
      processEvent(event, room?.roomId, toStartOfTimeline);
    };

    // In encrypted rooms poll events may only be visible after decryption.
    const handleDecrypted = (event) => {
      processEvent(event, event.getRoomId?.(), false);
    };

    const handleSync = (state) => {
      if (state === 'PREPARED' || state === 'SYNCING') {
        scheduleHydration();
      }
    };

    scheduleHydration();
    client.on('Room.timeline', handleTimeline);
    client.on('Event.decrypted', handleDecrypted);
    client.on('sync', handleSync);
    return () => {
      cancelled = true;
      client.removeListener('Room.timeline', handleTimeline);
      client.removeListener('Event.decrypted', handleDecrypted);
      client.removeListener('sync', handleSync);
    };
  }, [client, dispatch]);
}

export default usePollListener;

