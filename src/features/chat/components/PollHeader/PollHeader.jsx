import React from 'react';
import { Tag, Typography } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, StopOutlined } from '@ant-design/icons';
import styles from './PollHeader.module.scss';

const { Text, Title } = Typography;

export default function PollHeader({ question, status = 'active', totalVotes = 0, allowMultiple = false }) {
  const statusMeta = {
    active: { icon: <ClockCircleOutlined />, label: 'Active', color: 'processing' },
    voted: { icon: <CheckCircleOutlined />, label: 'Voted', color: 'success' },
    closed: { icon: <StopOutlined />, label: 'Closed', color: 'default' },
  };

  const current = statusMeta[status] || statusMeta.active;

  return (
    <div className={styles.header}>
      <div className={styles.titleRow}>
        <Title level={5} className={styles.question}>
          {question}
        </Title>
        <Tag icon={current.icon} color={current.color} className={styles.statusTag}>
          {current.label}
        </Tag>
      </div>
      <div className={styles.metaRow}>
        <Text className={styles.metaText}>
          {allowMultiple ? 'Multiple choice' : 'Single choice'}
        </Text>
        <Text className={styles.metaText}>
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
        </Text>
      </div>
    </div>
  );
}
