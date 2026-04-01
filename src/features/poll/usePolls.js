import { useCallback, useState } from 'react';
import { matrixManager } from '../chat/utils/matrixClient';

export function usePolls() {
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [votingPoll, setVotingPoll] = useState(false);

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

      return await client.sendEvent(roomId, 'm.poll.start', {
        question: { 'org.matrix.msc1767.text': question },
        kind: 'm.disclosed',
        max_selections: draft.allowMultiple ? answerOptions.length : 1,
        answers: answerOptions,
      });
    } finally {
      setCreatingPoll(false);
    }
  }, []);

  const votePoll = useCallback(async (roomId, pollEventId, selectedAnswerIds) => {
    if (!roomId) throw new Error('No active room selected.');
    if (!pollEventId) throw new Error('Missing poll event id.');

    const answers = Array.isArray(selectedAnswerIds)
      ? selectedAnswerIds.filter(Boolean)
      : [selectedAnswerIds].filter(Boolean);

    if (answers.length === 0) throw new Error('Select at least one option.');

    const client = matrixManager.getClient();
    if (!client) throw new Error('Matrix client not initialized.');

    setVotingPoll(true);
    try {
      const content = {
        'm.relates_to': {
          rel_type: 'm.reference',
          event_id: pollEventId,
        },
        'org.matrix.msc3381.poll.response': {
          answers,
        },
      };

      return await client.sendEvent(roomId, 'm.poll.response', content);
    } finally {
      setVotingPoll(false);
    }
  }, []);

  return {
    creatingPoll,
    votingPoll,
    createPoll,
    votePoll,
  };
}

export default usePolls;

