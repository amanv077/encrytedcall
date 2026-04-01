import { useEffect, useRef } from 'react';
import {
  getQuizAnswersByRoom,
  saveQuiz,
  saveQuizAnswer,
} from './quizDb';

function mapAnswerByQuiz(rows) {
  const byQuiz = {};
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!byQuiz[row.quizId]) byQuiz[row.quizId] = {};
    byQuiz[row.quizId][row.userId] = row.selectedOptionId;
  }
  return byQuiz;
}

export function useQuizListener(client, roomId, onAnswersUpdate) {
  const seenEventIds = useRef(new Set());

  useEffect(() => {
    if (!client || !roomId || typeof onAnswersUpdate !== 'function') return undefined;
    let cancelled = false;

    const hydrateFromDb = async () => {
      const answers = await getQuizAnswersByRoom(roomId);
      if (!cancelled) onAnswersUpdate(mapAnswerByQuiz(answers));
    };

    const processEvent = (event, sourceRoomId, skipHistory) => {
      if (skipHistory) return;
      if (!event || sourceRoomId !== roomId) return;

      const eventType = event.getType?.();
      if (eventType === 'm.room.encrypted') return;

      const eventId = event.getId?.();
      if (!eventId || seenEventIds.current.has(eventId)) return;
      seenEventIds.current.add(eventId);

      const sender = event.getSender?.();
      const ts = event.getTs?.() || Date.now();
      const content = event.getContent?.() || {};

      if (eventType === 'com.app.quiz.start') {
        const question = typeof content.question === 'string' ? content.question.trim() : '';
        const options = Array.isArray(content.options) ? content.options : [];
        if (!question || options.length < 2) return;

        saveQuiz({
          quizId: eventId,
          roomId,
          question,
          options,
          correctOptionId: content.correct_option_id || '',
          createdBy: sender || '',
          createdAt: ts,
        }).catch(() => console.error('[QuizListener] saveQuiz failed'));
        return;
      }

      if (eventType === 'com.app.quiz.answer') {
        const quizId = content?.['m.relates_to']?.event_id;
        const selectedOptionId = content?.answer_option_id;
        if (!quizId || !selectedOptionId || !sender) return;

        saveQuizAnswer({
          quizId,
          userId: sender,
          selectedOptionId,
          updatedAt: ts,
        })
          .then(() => getQuizAnswersByRoom(roomId))
          .then((answers) => {
            if (!cancelled) onAnswersUpdate(mapAnswerByQuiz(answers || []));
          })
          .catch(() => console.error('[QuizListener] saveQuizAnswer failed'));
      }
    };

    const handleTimeline = (event, room, toStartOfTimeline) => {
      processEvent(event, room?.roomId, toStartOfTimeline);
    };

    const handleDecrypted = (event) => {
      processEvent(event, event.getRoomId?.(), false);
    };

    hydrateFromDb().catch(() => console.error('[QuizListener] hydrate failed'));
    client.on('Room.timeline', handleTimeline);
    client.on('Event.decrypted', handleDecrypted);
    return () => {
      cancelled = true;
      client.removeListener('Room.timeline', handleTimeline);
      client.removeListener('Event.decrypted', handleDecrypted);
    };
  }, [client, onAnswersUpdate, roomId]);
}

export default useQuizListener;
