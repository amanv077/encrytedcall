import React from 'react';
import { Typography } from 'antd';
import { LockOutlined, ClockCircleOutlined, CheckOutlined } from '@ant-design/icons';
import styles from './MessageBubble.module.scss';

const { Text } = Typography;

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusIcon({ status }) {
  if (status === 'sending') return <ClockCircleOutlined style={{ fontSize: 11 }} />;
  if (status === 'delivered') return <CheckOutlined style={{ fontSize: 11 }} />;
  if (status === 'failed') return <span style={{ color: '#f5222d', fontSize: 11 }}>!</span>;
  if (status === 'decrypting') return <ClockCircleOutlined style={{ fontSize: 11 }} />;
  return null;
}

/**
 * MessageBubble – renders a single chat message in the timeline.
 *
 * @param {{ item: TimelineItem, showSenderName: boolean }} props
 */
export default function MessageBubble({ item, showSenderName = false }) {
  const { isOutgoing, senderName, body, timestamp, isEncrypted, status } = item;

  return (
    <div className={`${styles.wrapper} ${isOutgoing ? styles.outgoing : styles.incoming}`}>
      <div className={`${styles.bubble} ${isOutgoing ? styles.bubbleOut : styles.bubbleIn}`}>
        {!isOutgoing && showSenderName && (
          <div className={styles.senderName}>{senderName}</div>
        )}
        <Text className={styles.body}>{body}</Text>
        <div className={styles.meta}>
          {isEncrypted && (
            <LockOutlined className={styles.lockIcon} title="End-to-end encrypted" />
          )}
          <span className={styles.time}>{formatTime(timestamp)}</span>
          {isOutgoing && <StatusIcon status={status} />}
        </div>
      </div>
    </div>
  );
}
