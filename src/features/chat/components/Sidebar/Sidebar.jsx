import React, { useState } from 'react';
import { Avatar, Spin, Dropdown } from 'antd';
import {
  SearchOutlined,
  UserOutlined,
  TeamOutlined,
  MailOutlined,
  MessageOutlined,
  UsergroupAddOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { useDispatch } from 'react-redux';
import { openUserSearch } from '../../../../store/uiSlice';
import { useMatrixData } from '../../hooks/useMatrixData';
import { matrixManager } from '../../utils/matrixClient';
import styles from './Sidebar.module.scss';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRoomMembership(room, myUserId) {
  const m = room.getMyMembership?.();
  if (m) return m;
  return room.getMember?.(myUserId)?.membership || null;
}

function isDMRoom(client, room) {
  const mDirect = client.getAccountData?.('m.direct');
  if (mDirect?.getContent) {
    const allDMRoomIds = Object.values(mDirect.getContent() || {}).flat();
    if (allDMRoomIds.includes(room.roomId)) return true;
  }
  if (room.getDMInviter?.()) return true;
  const createEvt = room.currentState?.getStateEvents?.('m.room.create', '');
  if (createEvt?.getContent?.()?.is_direct) return true;
  return false;
}

function getDMContact(client, room) {
  const myUserId = client.getUserId();
  const inviter  = room.getDMInviter?.();
  if (inviter) {
    const m = room.getMember(inviter);
    return {
      userId:      inviter,
      displayName: m?.name || m?.rawDisplayName || inviter,
      avatarUrl:   m?.getAvatarUrl?.(client.getHomeserverUrl(), 44, 44, 'crop') || null,
      presence:    m?.user?.presence || 'unknown',
    };
  }
  const joined = room.getJoinedMembers();
  const other  = joined.find((m) => m.userId !== myUserId);
  if (other) {
    return {
      userId:      other.userId,
      displayName: other.name || other.rawDisplayName || other.userId,
      avatarUrl:   other.getAvatarUrl?.(client.getHomeserverUrl(), 44, 44, 'crop') || null,
      presence:    other.user?.presence || 'unknown',
    };
  }
  return { userId: null, displayName: room.name || 'Direct Message', avatarUrl: null, presence: 'unknown' };
}

function getRoomLastMessage(room) {
  try {
    const timeline = room.getLiveTimeline?.()?.getEvents?.() || [];
    for (let i = timeline.length - 1; i >= 0; i--) {
      const e = timeline[i];
      if (e.getType() === 'm.room.message') {
        return e.getContent()?.body || '';
      }
    }
  } catch { /* ignore */ }
  return '';
}

function getRoomLastTs(room) {
  try {
    const timeline = room.getLiveTimeline?.()?.getEvents?.() || [];
    if (timeline.length > 0) return timeline[timeline.length - 1].getTs?.() || 0;
  } catch { /* ignore */ }
  return 0;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const diff = Math.floor((now - d) / 86400000);
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ─── Conversation item ────────────────────────────────────────────────────────

function ConvItem({ room, selected, onClick, client, myUserId, isDM }) {
  const membership  = getRoomMembership(room, myUserId);
  const isInvite    = membership === 'invite';
  const contact     = isDM ? getDMContact(client, room) : null;
  const name        = isDM ? contact?.displayName : (room.name || 'Unnamed Group');
  const avatarUrl   = isDM ? contact?.avatarUrl : null;
  const online      = contact?.presence === 'online';
  const lastMsg     = getRoomLastMessage(room);
  const lastTs      = getRoomLastTs(room);
  const unread      = room.getUnreadNotificationCount?.('total') || 0;

  return (
    <div
      className={`${styles.listItem}
        ${selected ? styles.listItemActive : ''}
        ${isInvite ? styles.listItemInvite : ''}`}
      onClick={onClick}
    >
      <div className={styles.avatarWrap}>
        <Avatar
          src={avatarUrl}
          icon={isDM
            ? (isInvite ? <MailOutlined /> : <UserOutlined />)
            : <TeamOutlined />}
          size={44}
          style={
            isInvite    ? { background: '#fee2e2', color: '#e53e3e' }
            : !isDM     ? { background: '#006d6a', color: '#fff' }
            : {}
          }
        />
        {online && <span className={styles.presenceDot} />}
      </div>

      <div className={styles.itemBody}>
        <div className={styles.itemTop}>
          <span className={styles.itemName}>{name}</span>
          <span className={styles.itemTime}>{formatTime(lastTs)}</span>
        </div>
        <div className={styles.itemBottom}>
          <span className={styles.itemPreview}>
            {isInvite ? 'Tap to accept or decline' : (lastMsg || (isDM ? contact?.userId : room.roomId))}
          </span>
          {isInvite && <span className={styles.inviteTag}>Invited</span>}
          {!isInvite && unread > 0 && (
            <span className={styles.unreadBadge}>{unread > 99 ? '99+' : unread}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const FILTERS = ['All', 'Unread', 'Direct', 'Groups'];

export default function Sidebar({ onSelectTarget, onLogout, selectedTarget }) {
  const dispatch = useDispatch();
  const { rooms, loading } = useMatrixData();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [activeTab, setActiveTab] = useState('chat');

  const client   = matrixManager.getClient();
  const myUserId = client?.getUserId();
  const term     = searchTerm.toLowerCase();

  const menuItems = [
    { key: 'new_group', label: 'New group' },
    { key: 'settings',  label: 'Settings' },
    { key: 'logout',    label: 'Log out', danger: true, onClick: onLogout },
  ];

  // Build filtered room list
  const allRooms = (rooms || []).filter((room) => {
    const m = getRoomMembership(room, myUserId);
    return m === 'join' || m === 'invite';
  });

  let filtered = allRooms;

  if (activeFilter === 'Unread') {
    filtered = filtered.filter((r) => (r.getUnreadNotificationCount?.('total') || 0) > 0);
  } else if (activeFilter === 'Direct') {
    filtered = filtered.filter((r) => isDMRoom(client, r));
  } else if (activeFilter === 'Groups') {
    filtered = filtered.filter((r) => !isDMRoom(client, r));
  }

  // Search
  if (term) {
    filtered = filtered.filter((room) => {
      if (isDMRoom(client, room)) {
        const c = getDMContact(client, room);
        return c.displayName?.toLowerCase().includes(term) || c.userId?.toLowerCase().includes(term);
      }
      return room.name?.toLowerCase().includes(term) || room.roomId?.toLowerCase().includes(term);
    });
  }

  // Sort by last activity
  filtered = [...filtered].sort((a, b) => getRoomLastTs(b) - getRoomLastTs(a));

  return (
    <div className={styles.sidebar}>
      {/* Search */}
      <div className={styles.searchWrapper}>
        <div className={styles.searchInput}>
          <SearchOutlined style={{ color: '#9ba8b5', fontSize: 14, flexShrink: 0 }} />
          <input
            style={{
              flex: 1, border: 'none', outline: 'none',
              background: 'transparent', fontSize: 13,
              color: '#1a1f2e', fontFamily: 'inherit',
            }}
            placeholder="Search conversations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Filter pills */}
      <div className={styles.filterRow}>
        {FILTERS.map((f) => (
          <span
            key={f}
            className={`${styles.filterPill} ${activeFilter === f ? styles.filterPillActive : ''}`}
            onClick={() => setActiveFilter(f)}
          >
            {f}
          </span>
        ))}
      </div>

      {/* Room list */}
      <div className={styles.listWrapper}>
        {loading ? (
          <div className={styles.spinner}><Spin /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyText}>No conversations found.</div>
        ) : (
          filtered.map((room) => (
            <ConvItem
              key={room.roomId}
              room={room}
              selected={selectedTarget === room.roomId}
              onClick={() => onSelectTarget(room.roomId)}
              client={client}
              myUserId={myUserId}
              isDM={isDMRoom(client, room)}
            />
          ))
        )}
      </div>

      {/* Bottom tab bar */}
      <div className={styles.bottomBar}>
        <div
          className={`${styles.bottomTab} ${activeTab === 'chat' ? styles.bottomTabActive : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <span className={styles.bottomTabIcon}>
            <MessageOutlined />
          </span>
          Chat
        </div>
        <div
          className={`${styles.bottomTab} ${activeTab === 'communities' ? styles.bottomTabActive : ''}`}
          onClick={() => setActiveTab('communities')}
        >
          <span className={styles.bottomTabIcon}>
            <UsergroupAddOutlined />
          </span>
          Communities
        </div>
      </div>
    </div>
  );
}
