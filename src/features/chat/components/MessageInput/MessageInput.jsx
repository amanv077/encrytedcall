import React, { useState, useRef, useCallback } from 'react';
import { Tooltip } from 'antd';
import {
  SendOutlined,
  PaperClipOutlined,
  AudioOutlined,
  FileTextOutlined,
  SolutionOutlined,
  CalendarOutlined,
  AppstoreOutlined,
  LockOutlined,
} from '@ant-design/icons';
import styles from './MessageInput.module.scss';

const ACTION_CHIPS = [
  { icon: <FileTextOutlined />,  label: 'Case' },
  { icon: <SolutionOutlined />,  label: 'Job' },
  { icon: <CalendarOutlined />,  label: 'Event' },
  { icon: <AudioOutlined />,     label: 'Voice note' },
  { icon: <AppstoreOutlined />,  label: 'Interactive' },
];

/**
 * MessageInput – compose + send, with action chip tray above.
 *
 * @param {{ onSend, disabled, isEncrypted }} props
 */
export default function MessageInput({ onSend, disabled = false, isEncrypted = false }) {
  const [text, setText]   = useState('');
  const textareaRef       = useRef(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    textareaRef.current?.focus();
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className={styles.inputArea}>
      {/* Action chips row */}
      <div className={styles.chipsRow}>
        {ACTION_CHIPS.map(({ icon, label }) => (
          <Tooltip key={label} title={label}>
            <button className={styles.chip} disabled={disabled}>
              {icon}
              <span className={styles.chipLabel}>{label}</span>
            </button>
          </Tooltip>
        ))}
      </div>

      {/* Composer row */}
      <div className={styles.composerRow}>
        <Tooltip title="Attach file">
          <button className={styles.iconBtn} disabled={disabled}>
            <PaperClipOutlined />
          </button>
        </Tooltip>

        <div className={styles.inputWrapper}>
          {isEncrypted && (
            <Tooltip title="End-to-end encrypted">
              <LockOutlined className={styles.lockIcon} />
            </Tooltip>
          )}
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder={disabled ? 'Select a conversation…' : 'Type a message'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
          />
        </div>

        {text.trim() ? (
          <button
            className={`${styles.iconBtn} ${styles.sendBtn}`}
            onClick={handleSend}
            disabled={disabled}
          >
            <SendOutlined />
          </button>
        ) : (
          <Tooltip title="Voice message">
            <button className={styles.iconBtn} disabled={disabled}>
              <AudioOutlined />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
