import React, { useState, useRef, useCallback } from 'react';
import { Button, Tooltip } from 'antd';
import { SendOutlined, LockOutlined } from '@ant-design/icons';
import styles from './MessageInput.module.scss';

/**
 * MessageInput – compose and send a chat message.
 *
 * - Enter sends; Shift+Enter inserts a newline.
 * - Disabled when no room is selected or the Matrix client is not ready.
 *
 * @param {{ onSend: (text: string) => void, disabled: boolean, isEncrypted: boolean }} props
 */
export default function MessageInput({ onSend, disabled = false, isEncrypted = false }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    // Re-focus so the user can keep typing
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
    <div className={styles.inputRow}>
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
      <Button
        type="primary"
        shape="circle"
        icon={<SendOutlined />}
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        className={styles.sendBtn}
      />
    </div>
  );
}
