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
  BarChartOutlined,
  QuestionCircleOutlined,
  LockOutlined,
} from '@ant-design/icons';
import styles from './MessageInput.module.scss';

const ACTION_CHIPS = [
  { icon: <FileTextOutlined />,  label: 'Case' },
  { icon: <SolutionOutlined />,  label: 'Job' },
  { icon: <CalendarOutlined />,  label: 'Event' },
  { icon: <BarChartOutlined />,  label: 'Poll' },
  { icon: <QuestionCircleOutlined />, label: 'Quiz' },
  { icon: <AudioOutlined />,     label: 'Voice note' },
  { icon: <AppstoreOutlined />,  label: 'Interactive' },
];

/**
 * MessageInput – compose + send, with action chip tray above.
 *
 * @param {{ onSend, disabled, isEncrypted, onActionClick }} props
 */
export default function MessageInput({
  onSend,
  disabled = false,
  isEncrypted = false,
  onActionClick,
}) {
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

      {/* ── Action chips ──────────────────────────────────────────────── */}
      <div className={styles.chipsRow}>
        {ACTION_CHIPS.map(({ icon, label }) => (
          <Tooltip key={label} title={label}>
            <button
              className={styles.chip}
              disabled={disabled}
              onClick={() => onActionClick?.(label)}
              type="button"
            >
              {icon}
              <span className={styles.chipLabel}>{label}</span>
            </button>
          </Tooltip>
        ))}
      </div>

      {/* ── Compose pill: paperclip | textarea | mic/send ─────────────── */}
      <div className={styles.composerRow}>
        {/* The whole pill */}
        <div className={`${styles.composerPill} ${disabled ? styles.composerPillDisabled : ''}`}>

          {/* Left icon – attachment */}
          <Tooltip title="Attach file">
            <button className={styles.pillBtn} disabled={disabled} tabIndex={-1}>
              <PaperClipOutlined />
            </button>
          </Tooltip>

          {/* Encryption indicator (only when E2E) */}
          {isEncrypted && (
            <Tooltip title="End-to-end encrypted">
              <LockOutlined className={styles.lockIcon} />
            </Tooltip>
          )}

          {/* Text area */}
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

          {/* Right icon – send when text present, mic otherwise */}
          {text.trim() ? (
            <button
              className={`${styles.pillBtn} ${styles.pillBtnSend}`}
              onClick={handleSend}
              disabled={disabled}
            >
              <SendOutlined />
            </button>
          ) : (
            <Tooltip title="Voice message">
              <button className={styles.pillBtn} disabled={disabled} tabIndex={-1}>
                <AudioOutlined />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

    </div>
  );
}
