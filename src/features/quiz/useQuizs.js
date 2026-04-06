import { useCallback, useRef, useState } from 'react';
import { matrixManager } from '../chat/utils/matrixClient';

function assertRoomEncrypted(client, roomId) {
  if (typeof client?.isRoomEncrypted === 'function' && !client.isRoomEncrypted(roomId)) {
    throw new Error('Quizzes are allowed only in end-to-end encrypted rooms.');
  }
}

function assertJoinedMember(client, roomId) {
  const room = client.getRoom?.(roomId);
  const membership = room?.getMyMembership?.();
  if (membership && membership !== 'join') {
    throw new Error('You must join the room to create or answer a quiz.');
  }
}

export function useQuizs() {
  const [creatingQuiz, setCreatingQuiz] = useState(false);
  const [answeringQuiz, setAnsweringQuiz] = useState(false);
  const inFlightAnswerKeys = useRef(new Set());
  const lastAnswerByQuiz = useRef(new Map());

  const createQuiz = useCallback(async (roomId, draft) => {
    if (!roomId) throw new Error('No active room selected.');
    if (!draft?.question?.trim()) throw new Error('Quiz question is required.');
    if (!Array.isArray(draft?.options) || draft.options.length < 2 || draft.options.length > 4) {
      throw new Error('Quiz must include 2 to 4 options.');
    }
    if (!draft?.correctOptionId) throw new Error('Select the correct answer.');

    const options = draft.options
      .filter((option) => option?.label?.trim())
      .map((option, idx) => ({
        id: option.id || `opt_${idx + 1}`,
        text: option.label.trim(),
      }));

    if (options.length < 2 || options.length > 4) {
      throw new Error('Quiz must include 2 to 4 non-empty options.');
    }
    const isKnownCorrect = options.some((option) => option.id === draft.correctOptionId);
    if (!isKnownCorrect) throw new Error('Correct answer must match one option.');

    const client =
      (await matrixManager.ensureDetachedPendingEvents?.()) ||
      matrixManager.getClient();
    if (!client) throw new Error('Matrix client not initialized.');
    assertRoomEncrypted(client, roomId);
    assertJoinedMember(client, roomId);

    setCreatingQuiz(true);
    try {
      const content = {
        question: draft.question.trim(),
        options,
        correct_option_id: draft.correctOptionId,
        version: 1,
      };
      return await client.sendEvent(roomId, 'com.app.quiz.start', content);

      const quizCreateData = axios.post("https://glary-xiomara-stupefactive.ngrok-free.dev/api/event", {
        eventName: "quiz",
        type: "create",
        question: draft.question.trim(),
        options: draft.correctOptionId,
        id: `poll-${Date.now()}`,
      });
      console.log('quizCreateData', quizCreateData);
    } finally {
      setCreatingQuiz(false);
    }
  }, []);

  const answerQuiz = useCallback(async (roomId, quizEventId, selectedOptionId) => {
    if (!roomId) throw new Error('No active room selected.');
    if (!quizEventId) throw new Error('Missing quiz event id.');
    if (!selectedOptionId) throw new Error('Select an answer option.');

    const client =
      (await matrixManager.ensureDetachedPendingEvents?.()) ||
      matrixManager.getClient();
    if (!client) throw new Error('Matrix client not initialized.');
    assertRoomEncrypted(client, roomId);
    assertJoinedMember(client, roomId);

    const duplicateKey = `${roomId}|${quizEventId}|${selectedOptionId}`;
    if (inFlightAnswerKeys.current.has(duplicateKey)) return null;
    if (lastAnswerByQuiz.current.get(`${roomId}|${quizEventId}`) === selectedOptionId) return null;

    inFlightAnswerKeys.current.add(duplicateKey);
    setAnsweringQuiz(true);
    try {
      const content = {
        'm.relates_to': {
          rel_type: 'm.reference',
          event_id: quizEventId,
        },
        answer_option_id: selectedOptionId,
        version: 1,
      };
      const res = await client.sendEvent(roomId, 'com.app.quiz.answer', content);
      lastAnswerByQuiz.current.set(`${roomId}|${quizEventId}`, selectedOptionId);
      return res;
    } finally {
      inFlightAnswerKeys.current.delete(duplicateKey);
      setAnsweringQuiz(false);
    }
  }, []);

  return {
    creatingQuiz,
    answeringQuiz,
    createQuiz,
    answerQuiz,
  };
}

export default useQuizs;
