import React from 'react';
import { Badge, Progress, Typography } from 'antd';
import styles from './QuizCard.module.scss';

const { Text } = Typography;

export default function QuizResult({
  options = [],
  totalVotes = 0,
  correctOptionId = null,
  selectedOptionId = null,
}) {
  return (
    <div className={styles.resultsWrap}>
      {options.map((option) => {
        const votes = option.votes || 0;
        const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        const isCorrect = option.id === correctOptionId;
        const isMine = option.id === selectedOptionId;

        return (
          <div
            key={option.id}
            className={`${styles.resultRow} ${isCorrect ? styles.correct : ''} ${isMine ? styles.mine : ''}`}
          >
            <div className={styles.resultTop}>
              <Text strong>{option.label}</Text>
              <div className={styles.resultMeta}>
                {isCorrect && <Badge color="#52c41a" text="Correct" />}
                {isMine && <Badge color="#1677ff" text="Your answer" />}
                <Text type="secondary">{votes} ({pct}%)</Text>
              </div>
            </div>
            <Progress percent={pct} showInfo={false} strokeColor={isCorrect ? '#52c41a' : '#1677ff'} />
          </div>
        );
      })}
      <Text type="secondary" className={styles.totalVotes}>Total votes: {totalVotes}</Text>
    </div>
  );
}
