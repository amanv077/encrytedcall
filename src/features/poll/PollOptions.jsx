import React, { useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Radio, Space } from 'antd';
import { usePolls } from './usePolls';

/**
 * Step 5: Poll voting UI.
 *
 * Props:
 * - roomId
 * - pollEventId
 * - options: [{ id, text|label }]
 * - allowMultiple
 * - onVoted(response, selectedIds)
 */
export default function PollOptions({
  roomId,
  pollEventId,
  options = [],
  allowMultiple = false,
  onVoted,
}) {
  const { votePoll, votingPoll } = usePolls();
  const [selectedIds, setSelectedIds] = useState([]);
  const [error, setError] = useState('');

  const normalizedOptions = useMemo(
    () =>
      options.map((o) => ({
        id: o.id,
        label: o.text || o.label || o.id,
      })),
    [options],
  );

  const onOptionChange = (optionId, checked) => {
    if (allowMultiple) {
      setSelectedIds((prev) =>
        checked ? [...new Set([...prev, optionId])] : prev.filter((id) => id !== optionId),
      );
      return;
    }
    setSelectedIds(checked ? [optionId] : []);
  };

  const handleSubmitVote = async () => {
    setError('');
    try {
      const res = await votePoll(roomId, pollEventId, selectedIds);
      if (onVoted) onVoted(res, selectedIds);
    } catch (err) {
      setError(err?.message || 'Unable to submit vote.');
      return;
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={10}>
      {normalizedOptions.map((option) => (
        <div key={option.id}>
          {allowMultiple ? (
            <Checkbox
              checked={selectedIds.includes(option.id)}
              onChange={(e) => onOptionChange(option.id, e.target.checked)}
              disabled={votingPoll}
              aria-label={`Select option ${option.label}`}
            >
              {option.label}
            </Checkbox>
          ) : (
            <Radio
              checked={selectedIds[0] === option.id}
              onChange={() => onOptionChange(option.id, true)}
              disabled={votingPoll}
              aria-label={`Choose option ${option.label}`}
            >
              {option.label}
            </Radio>
          )}
        </div>
      ))}

      {error && <Alert type="error" showIcon message={error} />}

      <Button
        type="primary"
        onClick={handleSubmitVote}
        loading={votingPoll}
        disabled={selectedIds.length === 0 || votingPoll}
      >
        Submit Vote
      </Button>
    </Space>
  );
}

