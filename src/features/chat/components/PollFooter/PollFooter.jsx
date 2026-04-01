import React from 'react';
import { Button, Space, Typography } from 'antd';
import styles from './PollFooter.module.scss';

const { Text } = Typography;

export default function PollFooter({
  canSubmit,
  canChangeVote,
  disabled = false,
  closed = false,
  onSubmit,
  onClear,
}) {
  return (
    <div className={styles.footer}>
      <Space>
        <Button
          type="primary"
          onClick={onSubmit}
          disabled={!canSubmit || disabled || closed}
          aria-label="Submit vote"
        >
          Submit Vote
        </Button>
        <Button
          onClick={onClear}
          disabled={!canChangeVote || disabled || closed}
          aria-label="Clear selected options"
        >
          Clear
        </Button>
      </Space>
      {closed && (
        <Text className={styles.closedText}>This poll is closed.</Text>
      )}
    </div>
  );
}
