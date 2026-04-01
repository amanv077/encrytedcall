import React, { useMemo, useState } from 'react';
import { Card } from 'antd';
import PollHeader from '../PollHeader/PollHeader';
import PollOptions from '../PollOptions/PollOptions';
import PollResults from '../PollResults/PollResults';
import PollFooter from '../PollFooter/PollFooter';
import styles from './PollCard.module.scss';

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
  const [selectedOptionIds, setSelectedOptionIds] = useState(poll?.myVotes || []);
  const [submitted, setSubmitted] = useState(Boolean((poll?.myVotes || []).length));
  const [lastSubmittedVotes, setLastSubmittedVotes] = useState(poll?.myVotes || []);
  const [optionsState, setOptionsState] = useState(poll?.options || []);

  const totalVotes = useMemo(() => computeTotalVotes(optionsState), [optionsState]);
  const isClosed = Boolean(poll?.closed);
  const disableSelection = isClosed || (lockAfterSubmit && submitted && !allowVoteChange);
  const status = isClosed ? 'closed' : submitted ? 'voted' : 'active';

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

  const handleSubmit = () => {
    if (!selectedOptionIds.length || isClosed) return;

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

  return (
    <Card className={styles.pollCard} bodyStyle={{ padding: 16 }}>
      <PollHeader
        question={poll.question}
        status={status}
        allowMultiple={poll.allowMultiple}
        totalVotes={totalVotes}
      />

      <div className={styles.optionsWrap}>
        <PollOptions
          options={optionsState}
          allowMultiple={poll.allowMultiple}
          selectedOptionIds={selectedOptionIds}
          disabled={disableSelection}
          onChange={handleChange}
        />
      </div>

      {showResults && (
        <PollResults
          options={optionsState}
          myVotes={selectedOptionIds}
          totalVotes={totalVotes}
        />
      )}

      <PollFooter
        canSubmit={selectedOptionIds.length > 0}
        canChangeVote={allowVoteChange && selectedOptionIds.length > 0}
        disabled={false}
        closed={isClosed}
        onSubmit={handleSubmit}
        onClear={handleClear}
      />
    </Card>
  );
}
