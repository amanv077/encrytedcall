import { useCallback, useState } from 'react';
import { matrixManager } from '../utils/matrixClient';

/**
 * Step 1 scope:
 * - Send Matrix poll creation event (m.poll.start)
 * - No listener/storage/redux logic here yet
 */
export function usePolls() {
  const [creatingPoll, setCreatingPoll] = useState(false);

  const createPoll = useCallback(async (roomId, draft) => {
    if (!roomId) throw new Error('No active room selected.');
    if (!draft?.question?.trim()) throw new Error('Poll question is required.');
    if (!Array.isArray(draft?.options) || draft.options.length < 2) {
      throw new Error('Poll must have at least two options.');
    }

    const client = matrixManager.getClient();
    if (!client) throw new Error('Matrix client not initialized.');

    setCreatingPoll(true);
    try {
      const question = draft.question.trim();
      const answerOptions = draft.options
        .filter((o) => o?.label?.trim())
        .map((o, idx) => ({
          id: o.id || `opt_${idx + 1}`,
          'org.matrix.msc1767.text': o.label.trim(),
        }));

      if (answerOptions.length < 2) {
        throw new Error('Poll must include at least two non-empty options.');
      }

      const content = {
        // MSC3381-style payload in stable event type
        question: {
          'org.matrix.msc1767.text': question,
        },
        kind: 'm.disclosed',
        max_selections: draft.allowMultiple ? answerOptions.length : 1,
        answers: answerOptions,
      };

      const response = await client.sendEvent(roomId, 'm.poll.start', content);
      return response;
    } finally {
      setCreatingPoll(false);
    }
  }, []);

  return {
    creatingPoll,
    createPoll,
  };
}

