import React from 'react';
import { useSelector } from 'react-redux';
import { Badge, Card, Empty, Progress, Space, Typography } from 'antd';
import {
  getLeadingOption,
  getPollById,
  getTotalVotes,
  getVoteCountByOption,
  getVotePercentage,
} from './pollSlice';

const { Text, Title } = Typography;

export default function PollResults({ pollId }) {
  const poll = useSelector((state) => getPollById(state, pollId));
  const voteCountByOption = useSelector((state) => getVoteCountByOption(state, pollId));
  const votePercentages = useSelector((state) => getVotePercentage(state, pollId));
  const totalVotes = useSelector((state) => getTotalVotes(state, pollId));
  const leadingOptionId = useSelector((state) => getLeadingOption(state, pollId));

  if (!poll) {
    return (
      <Card size="small">
        <Empty description="Poll not found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </Card>
    );
  }

  return (
    <Card size="small" title={<Title level={5} style={{ margin: 0 }}>{poll.question}</Title>}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {poll.options.map((option) => {
          const count = voteCountByOption[option.id] || 0;
          const pct = votePercentages[option.id] || 0;
          const isLeading = option.id === leadingOptionId && totalVotes > 0;

          return (
            <div key={option.id}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                  gap: 8,
                }}
              >
                <Space size={8}>
                  <Text strong={isLeading}>{option.text || option.label || option.id}</Text>
                  {isLeading && <Badge color="#52c41a" text="Leading" />}
                </Space>
                <Text type="secondary">
                  {count} vote{count === 1 ? '' : 's'} ({pct}%)
                </Text>
              </div>

              <Progress
                percent={pct}
                showInfo={false}
                strokeColor={isLeading ? '#52c41a' : '#1677ff'}
                trailColor="#f0f0f0"
              />
            </div>
          );
        })}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <Text type="secondary">
            Total votes: {totalVotes}
          </Text>
          {totalVotes === 0 && (
            <Text type="secondary">
              No votes yet
            </Text>
          )}
        </div>
      </Space>
    </Card>
  );
}

