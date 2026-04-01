import React, { useState } from 'react';
import { Col, Divider, Row, Space, Typography } from 'antd';
import PollCreator from '../PollCreator/PollCreator';
import PollCard from '../PollCard/PollCard';
import { pollDummyData } from './pollDummyData';
import styles from './PollDemo.module.scss';

const { Title, Text } = Typography;

export default function PollDemo() {
  const [polls, setPolls] = useState(pollDummyData);

  const handleCreate = (poll) => {
    setPolls((prev) => [poll, ...prev]);
  };

  const handleVoteSubmit = ({ pollId, selectedOptionIds }) => {
    setPolls((prev) =>
      prev.map((poll) => (poll.id === pollId ? { ...poll, myVotes: selectedOptionIds } : poll)),
    );
  };

  return (
    <div className={styles.demoWrap}>
      <Space direction="vertical" size={4}>
        <Title level={4} className={styles.title}>
          Poll UI Playground
        </Title>
        <Text className={styles.subtitle}>
          Frontend-only poll interaction demo with local state simulation.
        </Text>
      </Space>

      <Divider />

      <Row gutter={[16, 16]} align="top">
        <Col xs={24} xl={10}>
          <PollCreator onCreate={handleCreate} />
        </Col>
        <Col xs={24} xl={14}>
          <Space direction="vertical" size={12} className={styles.pollStack}>
            {polls.map((poll) => (
              <PollCard
                key={poll.id}
                poll={poll}
                showResults
                lockAfterSubmit={poll.disableAfterSubmit}
                allowVoteChange={poll.allowVoteChange}
                onSubmitVote={handleVoteSubmit}
              />
            ))}
          </Space>
        </Col>
      </Row>
    </div>
  );
}
