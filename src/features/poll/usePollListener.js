import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { savePoll, saveVote } from './pollDb';

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

    const handleTimeline = (event, room, toStartOfTimeline) => {
      if (toStartOfTimeline) return; // ignore historical backfill
      if (!event || !room) return;

      const eventType = event.getType();
      const content = event.getContent() || {};
      const eventId = event.getId();
      const roomId = room.roomId;
      const sender = event.getSender();
      const ts = event.getTs() || Date.now();

      // m.poll.start
      if (eventType === 'm.poll.start') {
        const poll = {
          pollId: eventId,
          roomId,
          createdBy: sender,
          question: readText(content.question),
          options: readPollOptions(content.answers),
          maxSelections: Number(content.max_selections || 1),
          kind: content.kind || 'm.disclosed',
          createdAt: ts,
          isClosed: false,
        };

        console.log('[PollListener] m.poll.start', poll);
        savePoll(poll).catch((err) => console.error('[PollListener] savePoll failed:', err));
        dispatch({ type: 'polls/addPoll', payload: poll }); // addPoll
        return;
      }

      // m.poll.response
      if (eventType === 'm.poll.response') {
        const relates = content['m.relates_to'] || {};
        const response =
          content.response ||
          content['org.matrix.msc3381.poll.response'] ||
          {};
        const pollId = relates.event_id;
        const answers = Array.isArray(response.answers) ? response.answers : [];

        if (!pollId) {
          console.warn('[PollListener] m.poll.response ignored: missing poll relation', {
            eventId,
            roomId,
          });
          return;
        }

        const vote = {
          voteEventId: eventId,
          roomId,
          pollId,
          userId: sender,
          answerId: answers[0] || null,
          timestamp: ts,
        };

        if (!vote.answerId) return;
        console.log('[PollListener] m.poll.response', vote);
        saveVote(vote).catch((err) => console.error('[PollListener] saveVote failed:', err));
        dispatch({ type: 'polls/addVote', payload: vote }); // addVote
        return;
      }

      // m.poll.end
      if (eventType === 'm.poll.end') {
        const relates = content['m.relates_to'] || {};
        const pollId = relates.event_id;
        const closingMessage = readText(content['m.new_content']) || readText(content);

        if (!pollId) {
          console.warn('[PollListener] m.poll.end ignored: missing poll relation', {
            eventId,
            roomId,
          });
          return;
        }

        const ended = {
          pollId,
          roomId,
          endedBy: sender,
          endEventId: eventId,
          endedAt: ts,
          closingMessage,
        };

        console.log('[PollListener] m.poll.end', ended);
        dispatch({ type: 'polls/endPoll', payload: ended }); // endPoll
      }
    };

    client.on('Room.timeline', handleTimeline);
    return () => {
      client.removeListener('Room.timeline', handleTimeline);
    };
  }, [client, dispatch]);
}

export default usePollListener;

