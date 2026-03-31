import React from 'react';
import { Button, Tooltip } from 'antd';
import { PhoneOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { formatCallSummary } from '../../utils/timelineService';
import styles from './CallHistoryItem.module.scss';

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * CallHistoryItem – renders a call event as a center-aligned item in the timeline.
 *
 * @param {{ item: CallTimelineItem, onCallBack: (roomId: string, isVideo: boolean) => void }} props
 */
export default function CallHistoryItem({ item, onCallBack }) {
  const { outcome, callType, timestamp, isOutgoing, roomId } = item;
  const summary = formatCallSummary(item);

  const isMissed = outcome === 'missed' || outcome === 'rejected';
  const isVideo = callType === 'video';

  // PhoneMissedOutlined not available in this version; use PhoneOutlined with rotation
  const CallIcon = isVideo ? VideoCameraOutlined : PhoneOutlined;
  // iconColor must be declared before iconStyle (const TDZ)
  const iconColor = isMissed ? '#f5222d' : isOutgoing ? '#8696a0' : '#00a884';
  const iconStyle = isMissed
    ? { color: iconColor, fontSize: 14, transform: 'rotate(135deg)' }
    : { color: iconColor, fontSize: 14 };

  return (
    <div className={styles.wrapper}>
      <div className={styles.pill}>
        <CallIcon style={iconStyle} />
        <span className={`${styles.label} ${isMissed ? styles.missed : ''}`}>
          {summary}
        </span>
        <span className={styles.time}>
          {formatDate(timestamp)}, {formatTime(timestamp)}
        </span>
        {onCallBack && (
          <Tooltip title={isVideo ? 'Video call back' : 'Call back'}>
            <Button
              type="text"
              size="small"
              icon={isVideo ? <VideoCameraOutlined /> : <PhoneOutlined />}
              onClick={() => onCallBack(roomId, isVideo)}
              className={styles.callbackBtn}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
}
