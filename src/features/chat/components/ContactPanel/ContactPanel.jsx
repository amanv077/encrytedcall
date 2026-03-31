import React from 'react';
import { Avatar, Tag } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { matrixManager } from '../../utils/matrixClient';
import styles from './ContactPanel.module.scss';

function SectionRow({ label, count }) {
  return (
    <div className={styles.sectionRow}>
      <span className={styles.sectionLabel}>
        {label}{count != null ? ` (${count})` : ''}
      </span>
      <RightOutlined className={styles.sectionArrow} />
    </div>
  );
}

function isDMRoom(client, room) {
  const mDirect = client.getAccountData?.('m.direct');
  if (mDirect?.getContent) {
    const allIds = Object.values(mDirect.getContent() || {}).flat();
    if (allIds.includes(room.roomId)) return true;
  }
  if (room.getDMInviter?.()) return true;
  const createEvt = room.currentState?.getStateEvents?.('m.room.create', '');
  if (createEvt?.getContent?.()?.is_direct) return true;
  return false;
}

/**
 * ContactPanel – always-visible right-side panel showing the active room's info.
 * Shows a placeholder when no conversation is selected.
 */
export default function ContactPanel({ roomId }) {
  const client = matrixManager.getClient();

  // ── Placeholder when no room is selected ──────────────────────────────────
  if (!client || !roomId) {
    return (
      <div className={styles.panel}>
        <div className={styles.emptyPanel}>
          <UserOutlined style={{ fontSize: 40, color: '#b3dedd' }} />
          <span className={styles.emptyText}>Select a conversation to see contact info</span>
        </div>
      </div>
    );
  }

  const myUserId = client.getUserId();
  const room     = client.getRoom(roomId);

  if (!room) {
    return (
      <div className={styles.panel}>
        <div className={styles.emptyPanel}>
          <UserOutlined style={{ fontSize: 40, color: '#b3dedd' }} />
          <span className={styles.emptyText}>Loading contact info…</span>
        </div>
      </div>
    );
  }

  const isDM   = isDMRoom(client, room);
  const joined = room.getJoinedMembers();

  if (isDM) {
    // ── DM: show the other person's profile ─────────────────────────────────
    const inviter  = room.getDMInviter?.();
    const otherId  = inviter || joined.find((m) => m.userId !== myUserId)?.userId;
    const other    = otherId ? room.getMember(otherId) : null;
    const name     = other?.name || other?.rawDisplayName || otherId || room.name;
    const avatarUrl = other?.getAvatarUrl?.(client.getHomeserverUrl(), 80, 80, 'crop') || null;
    const server   = otherId?.split(':')?.[1];

    return (
      <div className={styles.panel}>
        <div className={styles.profileTop}>
          <Avatar
            src={avatarUrl}
            icon={!avatarUrl && <UserOutlined />}
            size={72}
            className={styles.avatar}
          />
          <div className={styles.nameRow}>
            <span className={styles.name}>{name}</span>
            <SafetyCertificateOutlined className={styles.verified} title="Verified" />
          </div>
          {server && <span className={styles.subtitle}>{server}</span>}
        </div>

        <div className={styles.infoBlock}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Matrix ID</span>
            <span className={styles.infoValue}>{otherId}</span>
          </div>
        </div>

        <div className={styles.expertiseBlock}>
          <span className={styles.blockTitle}>Areas of Expertise</span>
          <div className={styles.tags}>
            <Tag className={styles.tag}>Secure Messaging</Tag>
            <Tag className={styles.tag}>E2E Encrypted</Tag>
          </div>
        </div>

        <div className={styles.sections}>
          <SectionRow label="Professional Information" />
          <SectionRow label="Clinical Cases" count={3} />
          <SectionRow label="Quizzes" count={3} />
        </div>
      </div>
    );
  }

  // ── Group room ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.panel}>
      <div className={styles.profileTop}>
        <Avatar
          icon={<TeamOutlined />}
          size={72}
          className={styles.avatar}
          style={{ background: '#006d6a', color: '#fff' }}
        />
        <div className={styles.nameRow}>
          <span className={styles.name}>{room.name || roomId}</span>
        </div>
        <span className={styles.subtitle}>{joined.length} members</span>
      </div>

      <div className={styles.infoBlock}>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Room ID</span>
          <span className={styles.infoValue} style={{ wordBreak: 'break-all', fontSize: 11 }}>
            {roomId}
          </span>
        </div>
      </div>

      <div className={styles.expertiseBlock}>
        <span className={styles.blockTitle}>Members ({joined.length})</span>
        <div className={styles.memberList}>
          {joined.slice(0, 5).map((m) => (
            <div key={m.userId} className={styles.memberRow}>
              <Avatar
                src={m.getAvatarUrl?.(client.getHomeserverUrl(), 28, 28, 'crop') || null}
                icon={<UserOutlined />}
                size={28}
              />
              <span className={styles.memberName}>
                {m.name || m.rawDisplayName || m.userId}
              </span>
            </div>
          ))}
          {joined.length > 5 && (
            <span className={styles.moreMembers}>+{joined.length - 5} more</span>
          )}
        </div>
      </div>

      <div className={styles.sections}>
        <SectionRow label="Shared Files" />
        <SectionRow label="Shared Media" />
      </div>
    </div>
  );
}
