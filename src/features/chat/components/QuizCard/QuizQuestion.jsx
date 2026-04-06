import React from 'react';
import { Typography, Tag } from 'antd';

const { Title, Text } = Typography;

export default function QuizQuestion({ question, submitted }) {
  return (
    <div>
      <Title level={5} style={{ margin: 0 }}>{question}</Title>
      <Text type="secondary" style={{ fontSize: 12 }}>
        Single choice quiz
      </Text>
      {submitted && (
        <div style={{ marginTop: 8 }}>
          <Tag color="blue">Submitted</Tag>
        </div>
      )}
    </div>
  );
}
