import React, { useMemo } from 'react';
import { Progress, Typography } from 'antd';
import { TrophyOutlined } from '@ant-design/icons';
import styles from './PollResults.module.scss';

const { Text } = Typography;

export default function PollResults({ options = [], myVotes = [], totalVotes = 0, showWinners = true }) {
  const winnerVoteCount = useMemo(
    () => options.reduce((max, option) => (option.votes > max ? option.votes : max), 0),
    [options],
  );

  return (
    <div className={styles.resultsWrap}>
      {options.map((option) => {
        const pct = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
        const selected = myVotes.includes(option.id);
        const isWinner = showWinners && totalVotes > 0 && option.votes === winnerVoteCount;

        return (
          <div
            key={option.id}
            className={`${styles.resultRow} ${selected ? styles.selected : ''} ${isWinner ? styles.winner : ''}`}
          >
            <div className={styles.labelRow}>
              <Text strong>{option.label}</Text>
              <div className={styles.valueRow}>
                {isWinner && <TrophyOutlined className={styles.winnerIcon} aria-label="Winning option" />}
                <Text className={styles.countLabel}>
                  {option.votes} • {pct}%
                </Text>
              </div>
            </div>
            <Progress
              percent={pct}
              showInfo={false}
              size={['100%', 8]}
              strokeColor={selected ? '#00a884' : undefined}
              aria-label={`${option.label} has ${pct} percent of votes`}
            />
          </div>
        );
      })}
      {totalVotes === 0 && (
        <Text className={styles.emptyState} aria-live="polite">
          No votes yet.
        </Text>
      )}
    </div>
  );
}
