import React from 'react';
import { Avatar, Tag, Tooltip } from 'antd';
import {
  UserOutlined,
  SafetyCertificateOutlined,
  RightOutlined,
  CloseOutlined,
  MailOutlined,
  GlobalOutlined,
  LockOutlined,
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

/**
 * ContactPanel – collapsible right panel showing the LOGGED-IN user's profile.
 *
 * Toggled by clicking the profile avatar in the top bar.
 * Panel slides in/out via CSS width transition; the close button is only
 * visible when the panel is open (overflow:hidden clips it when collapsed).
 */
export default function ContactPanel({ open = false, onClose }) {
  const client = matrixManager.getClient();

  const panelClass = `${styles.panel} ${open ? styles.panelOpen : ''}`;

  const closeBtn = (
    <Tooltip title="Close" placement="left">
      <button className={styles.closeBtn} onClick={onClose}>
        <CloseOutlined />
      </button>
    </Tooltip>
  );

  if (!client) {
    return (
      <div className={panelClass}>
        {closeBtn}
        <div className={styles.emptyPanel}>
          <UserOutlined style={{ fontSize: 40, color: '#b3dedd' }} />
          <span className={styles.emptyText}>Not connected</span>
        </div>
      </div>
    );
  }

  const myUserId   = client.getUserId() || '';
  const myUser     = client.getUser(myUserId);
  const avatarUrl  = myUser?.avatarUrl
    ? client.mxcUrlToHttp?.(myUser.avatarUrl, 80, 80, 'crop') || myUser.avatarUrl
    : null;

  const displayName = myUser?.displayName || myUserId.split(':')[0]?.replace('@', '') || 'Me';
  const server      = myUserId.split(':')?.[1] || '';

  return (
    <div className={panelClass}>
      {closeBtn}

      {/* ── Avatar + name ─────────────────────────────────────────────── */}
      <div className={styles.profileTop}>
        <div className={styles.avatarWrap}>
          <Avatar
            src={avatarUrl}
            icon={!avatarUrl && <UserOutlined />}
            size={72}
            className={styles.avatar}
          />
          <span className={styles.onlineDot} title="Online" />
        </div>
        <div className={styles.nameRow}>
          <span className={styles.name}>{displayName}</span>
          <SafetyCertificateOutlined className={styles.verified} title="Verified account" />
        </div>
        <span className={styles.subtitle}>{server}</span>
      </div>

      {/* ── Account details ───────────────────────────────────────────── */}
      <div className={styles.infoBlock}>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Matrix ID</span>
          <span className={styles.infoValue}>{myUserId}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Home Server</span>
          <div className={styles.infoValueRow}>
            <GlobalOutlined style={{ fontSize: 12, color: '#9ba8b5' }} />
            <span className={styles.infoValue}>{server}</span>
          </div>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Security</span>
          <div className={styles.infoValueRow}>
            <LockOutlined style={{ fontSize: 12, color: '#006d6a' }} />
            <span className={styles.infoValue} style={{ color: '#006d6a' }}>End-to-end encrypted</span>
          </div>
        </div>
      </div>

      {/* ── Status tags ───────────────────────────────────────────────── */}
      <div className={styles.expertiseBlock}>
        <span className={styles.blockTitle}>Status</span>
        <div className={styles.tags}>
          <Tag className={styles.tag}>Online</Tag>
          <Tag className={styles.tag}>E2E Encrypted</Tag>
        </div>
      </div>

      {/* ── Expandable sections ───────────────────────────────────────── */}
      <div className={styles.sections}>
        <SectionRow label="Profile Settings" />
        <SectionRow label="Notification Preferences" />
        <SectionRow label="Security & Privacy" />
      </div>
    </div>
  );
}
