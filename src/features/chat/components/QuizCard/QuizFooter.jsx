import React from 'react';
import { Button, Space } from 'antd';

export default function QuizFooter({
  canSubmit = false,
  canChange = false,
  submitted = false,
  disabled = false,
  submitting = false,
  onSubmit,
  onClear,
  onSimulateVotes,
}) {
  return (
    <Space wrap>
      <Button type="primary" disabled={!canSubmit || disabled} loading={submitting} onClick={onSubmit}>
        Submit Answer
      </Button>
      <Button disabled={!canChange || disabled} onClick={onClear}>
        Clear
      </Button>
      <Button onClick={onSimulateVotes} disabled={disabled}>
        Simulate Other Votes
      </Button>
      {submitted && (
        <Button disabled>
          Result View
        </Button>
      )}
    </Space>
  );
}
