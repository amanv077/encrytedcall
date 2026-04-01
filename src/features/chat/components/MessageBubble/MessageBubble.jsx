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
  if (status === 'delivered') {
    return (
      <span className={styles.statusTicks} title="Delivered">
        <CheckOutlined className={`${styles.tick} ${styles.tickFirst}`} />
        <CheckOutlined className={`${styles.tick} ${styles.tickSecond}`} />
      </span>
    );
  }
  if (status === 'seen') {
    return (
      <span className={`${styles.statusTicks} ${styles.statusTicksSeen}`} title="Seen">
        <CheckOutlined className={`${styles.tick} ${styles.tickFirst}`} />
        <CheckOutlined className={`${styles.tick} ${styles.tickSecond}`} />
      </span>
    );
  }
  if (status === 'failed') return <span style={{ color: '#f5222d', fontSize: 11 }}>!</span>;
  if (status === 'decrypting') return <ClockCircleOutlined style={{ fontSize: 11 }} />;
  if (status === 'decrypt_failed') return <span style={{ color: '#faad14', fontSize: 11 }}>⚠</span>;
  return null;
}

/**
 * MessageBubble – renders a single chat message in the timeline.
 *
 * @param {{ item: TimelineItem, showSenderName: boolean }} props
 */
export default function MessageBubble({ item, showSenderName = false }) {
  const { isOutgoing, senderName, body, timestamp, isEncrypted, status, isDecryptionFailure } = item;

  const isUnreadable = status === 'decrypting' || isDecryptionFailure;

  return (
    <div className={`${styles.wrapper} ${isOutgoing ? styles.outgoing : styles.incoming}`}>
      <div
        className={`${styles.bubble} ${isOutgoing ? styles.bubbleOut : styles.bubbleIn} ${isUnreadable ? styles.bubbleUnreadable : ''}`}
      >
        {!isOutgoing && showSenderName && (
          <div className={styles.senderName}>{senderName}</div>
        )}
        <Text
          className={`${styles.body} ${isUnreadable ? styles.bodyMuted : ''}`}
          title={
            isDecryptionFailure
              ? 'This message cannot be decrypted on this device. The sender needs to be online for key sharing to work.'
              : undefined
          }
        >
          {body}
        </Text>
        <div className={styles.meta}>
          {isEncrypted && (
            <LockOutlined
              className={styles.lockIcon}
              style={isDecryptionFailure ? { color: '#faad14' } : undefined}
              title={isDecryptionFailure ? 'Decryption failed' : 'End-to-end encrypted'}
            />
          )}
          <span className={styles.time}>{formatTime(timestamp)}</span>
          {isOutgoing && <StatusIcon status={status} />}
        </div>
      </div>
    </div>
  );
}
