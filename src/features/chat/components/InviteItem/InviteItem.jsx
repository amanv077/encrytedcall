import React, { useState } from 'react';
import { Button, Space } from 'antd';
import { CheckOutlined, CloseOutlined, MailOutlined, LockOutlined } from '@ant-design/icons';
import { matrixManager } from '../../utils/matrixClient';
import styles from './InviteItem.module.scss';

// ─── Shared action logic ──────────────────────────────────────────────────────

async function acceptInvite(roomId, setStatus) {
  setStatus('loading');
  try {
    const client = matrixManager.getClient();
    await client.joinRoom(roomId);
    setStatus('accepted');
  } catch (err) {
    console.error('[InviteItem] joinRoom failed:', err);
    setStatus('pending');
  }
}

async function declineInvite(roomId, setStatus) {
  setStatus('loading');
  try {
    const client = matrixManager.getClient();
    await client.leave(roomId);
    setStatus('declined');
  } catch (err) {
    console.error('[InviteItem] leave failed:', err);
    setStatus('pending');
  }
}

// ─── RoomInviteGate ───────────────────────────────────────────────────────────

/**
 * RoomInviteGate – full-screen centered gate shown when the user has a pending
 * room invite.  Replaces the entire chat panel until Accept or Decline is clicked.
 *
 * After accepting the invite, the Matrix client fires `Room.myMembership` which
 * causes `useRoomMembership` to return 'join' and ChatPanel unmounts this gate
 * automatically.
 *
 * @param {{ roomId: string, invitedByName: string, roomName: string }} props
 */
export function RoomInviteGate({ roomId, invitedByName, roomName }) {
  const [status, setStatus] = useState('pending'); // pending | loading | declined

  if (status === 'declined') {
    return (
      <div className={styles.gate}>
        <div className={styles.gateCard}>
          <MailOutlined className={styles.gateIcon} style={{ color: '#8696a0' }} />
          <p className={styles.gateTitle} style={{ color: '#8696a0' }}>
            Invitation declined
          </p>
          <p className={styles.gateBody} style={{ color: '#66767e' }}>
            You declined the invitation to this conversation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.gate}>
      <div className={styles.gateCard}>
        <MailOutlined className={styles.gateIcon} />

        <p className={styles.gateTitle}>You have been invited</p>

        {roomName && (
          <p className={styles.gateRoomName}>{roomName}</p>
        )}

        <p className={styles.gateBody}>
          <strong style={{ color: '#e9edef' }}>{invitedByName || 'Someone'}</strong>
          {' '}invited you to join this encrypted conversation.
        </p>

        <div className={styles.gateEncNote}>
          <LockOutlined style={{ marginRight: 5, fontSize: 12 }} />
          Messages and calls are end-to-end encrypted
        </div>

        <div className={styles.gateBtns}>
          <Button
            size="large"
            danger
            icon={<CloseOutlined />}
            loading={status === 'loading'}
            onClick={() => declineInvite(roomId, setStatus)}
            className={styles.gateBtnDecline}
          >
            Decline
          </Button>
          <Button
            size="large"
            type="primary"
            icon={<CheckOutlined />}
            loading={status === 'loading'}
            onClick={() => acceptInvite(roomId, setStatus)}
            className={styles.gateBtnAccept}
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── InviteItem (inline timeline pill) ───────────────────────────────────────

/**
 * InviteItem – small inline item shown in the timeline *after* a room has been
 * joined, as a historical record of the invite event.
 *
 * The blocking UI while the invite is still pending is handled by RoomInviteGate.
 *
 * @param {{ item: InviteTimelineItem }} props
 */
export default function InviteItem({ item }) {
  const { roomId, invitedByName } = item;
  const [status, setStatus] = useState('pending');

  if (status === 'accepted') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.pill}>
          <MailOutlined style={{ color: '#00a884' }} />
          <span className={styles.label}>You joined this conversation</span>
        </div>
      </div>
    );
  }

  if (status === 'declined') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.pill}>
          <MailOutlined style={{ color: '#8696a0' }} />
          <span className={styles.label}>Invitation declined</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.header}>
          <MailOutlined style={{ color: '#00a884', fontSize: 18 }} />
          <span className={styles.title}>Room Invitation</span>
        </div>
        <p className={styles.body}>
          <strong>{invitedByName || 'Someone'}</strong> invited you to join this conversation.
        </p>
        <Space>
          <Button
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            loading={status === 'loading'}
            onClick={() => acceptInvite(roomId, setStatus)}
            style={{ background: '#00a884', borderColor: '#00a884' }}
          >
            Accept
          </Button>
          <Button
            size="small"
            danger
            icon={<CloseOutlined />}
            loading={status === 'loading'}
            onClick={() => declineInvite(roomId, setStatus)}
          >
            Decline
          </Button>
        </Space>
      </div>
    </div>
  );
}
