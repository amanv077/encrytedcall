import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Space, Typography } from 'antd';
import { useSelector } from 'react-redux';
import PollHeader from '../PollHeader/PollHeader';
import PollOptions from '../PollOptions/PollOptions';
import PollResults from '../PollResults/PollResults';
import PollFooter from '../PollFooter/PollFooter';
import styles from './PollCard.module.scss';
import { matrixManager } from '../../utils/matrixClient';
import { usePolls } from '../../hooks/usePolls';
import { getTotalVotes, getVoteCountByOption, getVotesByPoll } from '../../../poll/pollSlice';

function computeTotalVotes(options) {
  return options.reduce((sum, option) => sum + (option.votes || 0), 0);
}

export default function PollCard({
  poll,
  showResults = true,
  lockAfterSubmit = true,
  allowVoteChange = false,
  onSubmitVote,
}) {
  const { votePoll, votingPoll, endPoll, endingPoll } = usePolls();
  const client = matrixManager.getClient();
  const myUserId = client?.getUserId?.() || null;
  const roomId = poll?.roomId || poll?.roomIdOverride || null;
  const voteCountByOption = useSelector((state) => (poll?.id ? getVoteCountByOption(state, poll.id) : {}));
  const totalVotesFromStore = useSelector((state) => (poll?.id ? getTotalVotes(state, poll.id) : 0));
  const votesByUser = useSelector((state) => (poll?.id ? getVotesByPoll(state, poll.id) : {}));

  const isCreator = Boolean(poll?.createdBy && myUserId && poll.createdBy === myUserId);
  const [selectedOptionIds, setSelectedOptionIds] = useState(poll?.myVotes || []);
  const [submitted, setSubmitted] = useState(Boolean((poll?.myVotes || []).length));
  const [lastSubmittedVotes, setLastSubmittedVotes] = useState(poll?.myVotes || []);
  const [optionsState, setOptionsState] = useState(poll?.options || []);
  const [voteError, setVoteError] = useState('');

  const selectedFromStore = myUserId ? votesByUser[myUserId] : null;
  const displayOptions = useMemo(
    () =>
      optionsState.map((option) => ({
        ...option,
        votes: voteCountByOption[option.id] ?? option.votes ?? 0,
      })),
    [optionsState, voteCountByOption],
  );
  const totalVotes = poll?.id ? totalVotesFromStore : computeTotalVotes(displayOptions);
  const isClosed = Boolean(poll?.closed);
  const disableSelection = isClosed || (lockAfterSubmit && submitted && !allowVoteChange);
  const status = isClosed ? 'closed' : submitted ? 'voted' : 'active';

  useEffect(() => {
    if (selectedFromStore) {
      setSelectedOptionIds([selectedFromStore]);
      setSubmitted(true);
    }
  }, [selectedFromStore]);

  const handleChange = (optionId, checked) => {
    if (disableSelection) return;
    if (poll.allowMultiple) {
      setSelectedOptionIds((prev) =>
        checked ? [...new Set([...prev, optionId])] : prev.filter((id) => id !== optionId),
      );
      return;
    }
    setSelectedOptionIds(checked ? [optionId] : []);
  };

  const handleSubmit = async () => {
    if (!selectedOptionIds.length || isClosed) return;
    setVoteError('');

    if (!roomId || !poll?.id) {
      setVoteError('Unable to submit vote for this poll.');
      return;
    }

    try {
      await votePoll(roomId, poll.id, selectedOptionIds);
    } catch (err) {
      setVoteError(err?.message || 'Vote submission failed.');
      return;
    }

    setOptionsState((prev) =>
      prev.map((option) => {
        const previouslySelected = submitted && lastSubmittedVotes.includes(option.id);
        const nowSelected = selectedOptionIds.includes(option.id);
        const delta = (nowSelected ? 1 : 0) - (allowVoteChange && previouslySelected ? 1 : 0);
        return {
          ...option,
          votes: Math.max((option.votes || 0) + delta, 0),
        };
      }),
    );

    setSubmitted(true);
    setLastSubmittedVotes(selectedOptionIds);
    if (onSubmitVote) onSubmitVote({ pollId: poll.id, selectedOptionIds });
  };

  const handleClear = () => {
    if (disableSelection) return;
    setSelectedOptionIds([]);
  };

  const handleEndPoll = async () => {
    if (!roomId || !poll?.id || isClosed) return;
    try {
      await endPoll(roomId, poll.id);
    } catch {
      // avoid logging decrypted poll details
      console.error('[PollCard] endPoll failed');
    }
  };

  return (
    <Card className={styles.pollCard} bodyStyle={{ padding: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }} size={10}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <PollHeader
              question={poll.question}
              status={status}
              allowMultiple={poll.allowMultiple}
              totalVotes={totalVotes}
            />
          </div>
          {isCreator && !isClosed && (
            <Button
              type="default"
              size="small"
              onClick={handleEndPoll}
              loading={endingPoll}
              aria-label="End poll"
            >
              End Poll
            </Button>
          )}
        </div>

        <div className={styles.optionsWrap}>
          <PollOptions
            options={displayOptions}
            allowMultiple={poll.allowMultiple}
            selectedOptionIds={selectedOptionIds}
            disabled={disableSelection}
            onChange={handleChange}
          />
        </div>

        {showResults && (
          <PollResults
            options={displayOptions}
            myVotes={selectedFromStore ? [selectedFromStore] : selectedOptionIds}
            totalVotes={totalVotes}
          />
        )}

        <PollFooter
          canSubmit={selectedOptionIds.length > 0}
          canChangeVote={allowVoteChange && selectedOptionIds.length > 0}
          disabled={votingPoll}
          closed={isClosed}
          onSubmit={handleSubmit}
          onClear={handleClear}
        />
        {voteError && (
          <Typography.Text type="danger" style={{ fontSize: 12 }}>
            {voteError}
          </Typography.Text>
        )}
        {isClosed && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Poll Closed
          </Typography.Text>
        )}
      </Space>
    </Card>
  );
}
