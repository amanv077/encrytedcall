import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { openUserSearch } from '../../../../store/uiSlice';
import { useMatrixData } from '../../hooks/useMatrixData';
import { matrixManager } from '../../utils/matrixClient';
import {
  Input,
  List,
  Avatar,
  Badge,
  Spin,
  Tabs,
  Tooltip,
  Dropdown,
  Tag,
} from 'antd';
import {
  SearchOutlined,
  UserOutlined,
  TeamOutlined,
  EditOutlined,
  MoreOutlined,
  MailOutlined,
} from '@ant-design/icons';
import styles from './Sidebar.module.scss';
import './Tabs.scss';

// ─── Room classification helpers ─────────────────────────────────────────────

/**
 * Returns the local user's membership in a room.
 */
function getRoomMembership(room, myUserId) {
  const m = room.getMyMembership?.();
  if (m) return m;
  return room.getMember?.(myUserId)?.membership || null;
}

/**
 * Returns true if this room is a Direct Message (1-on-1 chat).
 *
 * Detection order:
 *  1. Room ID appears in m.direct account data for any user
 *  2. SDK getDMInviter() returns a value (invite-state DM)
 *  3. Room creation event has is_direct: true
 */
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

/**
 * Returns the "other person" info for a DM room.
 */
function getDMContact(client, room) {
  const myUserId = client.getUserId();

  // For an invite, the inviter IS the contact
  const inviter = room.getDMInviter?.();
  if (inviter) {
    const m = room.getMember(inviter);
    return {
      userId: inviter,
      displayName: m?.name || m?.rawDisplayName || inviter,
      avatarUrl: m?.getAvatarUrl?.(client.getHomeserverUrl(), 40, 40, 'crop') || null,
      presence: m?.user?.presence || 'unknown',
    };
  }

  // For joined rooms, find the other member
  const joined = room.getJoinedMembers();
  const other = joined.find((m) => m.userId !== myUserId);
  if (other) {
    return {
      userId: other.userId,
      displayName: other.name || other.rawDisplayName || other.userId,
      avatarUrl: other.getAvatarUrl?.(client.getHomeserverUrl(), 40, 40, 'crop') || null,
      presence: other.user?.presence || 'unknown',
    };
  }

  // Fallback (edge case: room with only self)
  return {
    userId: null,
    displayName: room.name || 'Direct Message',
    avatarUrl: null,
    presence: 'unknown',
  };
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar({ onSelectTarget, onLogout, selectedTarget }) {
  const dispatch = useDispatch();
  const { rooms, loading: dataLoading } = useMatrixData();
  const [searchTerm, setSearchTerm] = useState('');
  const client = matrixManager.getClient();
  const myUserId = client?.getUserId();

  const term = searchTerm.toLowerCase();

  // Partition rooms into DMs (Chats) and groups (Rooms)
  // Only show active memberships (join or invite); skip left/banned rooms
  const dmRooms = (rooms || []).filter((room) => {
    const m = getRoomMembership(room, myUserId);
    return (m === 'join' || m === 'invite') && isDMRoom(client, room);
  });

  const groupRooms = (rooms || []).filter((room) => {
    const m = getRoomMembership(room, myUserId);
    return (m === 'join' || m === 'invite') && !isDMRoom(client, room);
  });

  // Apply search filter
  const filteredDMs = dmRooms.filter((room) => {
    const contact = getDMContact(client, room);
    return (
      contact.displayName?.toLowerCase().includes(term) ||
      contact.userId?.toLowerCase().includes(term) ||
      room.roomId?.toLowerCase().includes(term)
    );
  });

  const filteredGroups = groupRooms.filter(
    (room) =>
      room.name?.toLowerCase().includes(term) ||
      room.roomId?.toLowerCase().includes(term),
  );

  const menuItems = [
    { key: 'new_group', label: 'New group' },
    { key: 'settings', label: 'Settings' },
    { key: 'logout', label: 'Log out', danger: true, onClick: onLogout },
  ];

  return (
    <div className={styles.sidebar}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <Avatar
          src={client?.getUser(myUserId)?.avatarUrl || undefined}
          icon={!client?.getUser(myUserId)?.avatarUrl && <UserOutlined />}
          style={{ background: '#dfe5e7', color: '#111b21', cursor: 'pointer', flexShrink: 0 }}
        />
        <div className={styles.headerIcons}>
          <Tooltip title="New chat">
            <EditOutlined
              className={styles.icon}
              onClick={() => dispatch(openUserSearch())}
            />
          </Tooltip>
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <MoreOutlined className={styles.icon} />
          </Dropdown>
        </div>
      </div>

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div className={styles.searchWrapper}>
        <Input
          prefix={<SearchOutlined style={{ color: '#8696a0' }} />}
          placeholder="Search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
          style={{ background: '#202c33', border: 'none', color: '#e9edef' }}
        />
      </div>

      {/* ── Lists ───────────────────────────────────────────────────────── */}
      <div className={styles.listWrapper}>
        {dataLoading ? (
          <div className={styles.spinner}>
            <Spin />
          </div>
        ) : (
          <Tabs
            defaultActiveKey="chats"
            centered
            className="waTabs"
            tabBarStyle={{ margin: 0, borderBottom: '1px solid #202c33' }}
            items={[
              {
                label: 'Chats',
                key: 'chats',
                children: (
                  <List
                    itemLayout="horizontal"
                    dataSource={filteredDMs}
                    locale={{
                      emptyText: (
                        <span style={{ color: '#8696a0', fontSize: 13 }}>
                          No chats yet. Tap the pencil icon to start a conversation.
                        </span>
                      ),
                    }}
                    renderItem={(room) => {
                      const membership = getRoomMembership(room, myUserId);
                      const isInvite = membership === 'invite';
                      const contact = getDMContact(client, room);

                      return (
                        <List.Item
                          onClick={() => onSelectTarget(room.roomId)}
                          className={`${styles.listItem} ${
                            selectedTarget === room.roomId ? styles.active : ''
                          } ${isInvite ? styles.inviteItem : ''}`}
                        >
                          <List.Item.Meta
                            avatar={
                              <Badge
                                dot={!isInvite}
                                color={contact.presence === 'online' ? '#00a884' : '#8696a0'}
                                offset={[-5, 38]}
                              >
                                <Avatar
                                  src={contact.avatarUrl}
                                  icon={
                                    isInvite
                                      ? <MailOutlined />
                                      : <UserOutlined />
                                  }
                                  style={isInvite ? { background: '#ea005e' } : {}}
                                  size={48}
                                />
                              </Badge>
                            }
                            title={
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: '#e9edef', fontSize: 16 }}>
                                  {contact.displayName}
                                </span>
                                {isInvite && (
                                  <Tag
                                    color="#ea005e"
                                    style={{
                                      fontSize: 10,
                                      lineHeight: '16px',
                                      padding: '0 5px',
                                      margin: 0,
                                    }}
                                  >
                                    Invited
                                  </Tag>
                                )}
                              </div>
                            }
                            description={
                              <span style={{ color: '#8696a0', fontSize: 12 }}>
                                {isInvite
                                  ? 'Tap to accept or decline'
                                  : contact.userId}
                              </span>
                            }
                          />
                        </List.Item>
                      );
                    }}
                  />
                ),
              },
              {
                label: 'Groups',
                key: 'rooms',
                children: (
                  <List
                    itemLayout="horizontal"
                    dataSource={filteredGroups}
                    locale={{
                      emptyText: (
                        <span style={{ color: '#8696a0', fontSize: 13 }}>
                          No group rooms found.
                        </span>
                      ),
                    }}
                    renderItem={(room) => {
                      const membership = getRoomMembership(room, myUserId);
                      const isInvite = membership === 'invite';

                      return (
                        <List.Item
                          onClick={() => onSelectTarget(room.roomId)}
                          className={`${styles.listItem} ${
                            selectedTarget === room.roomId ? styles.active : ''
                          } ${isInvite ? styles.inviteItem : ''}`}
                        >
                          <List.Item.Meta
                            avatar={
                              <Avatar
                                style={{
                                  background: isInvite ? '#ea005e' : '#00a884',
                                }}
                                icon={
                                  isInvite ? <MailOutlined /> : <TeamOutlined />
                                }
                                size={48}
                              />
                            }
                            title={
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: '#e9edef', fontSize: 16 }}>
                                  {room.name || 'Unnamed Group'}
                                </span>
                                {isInvite && (
                                  <Tag
                                    color="#ea005e"
                                    style={{
                                      fontSize: 10,
                                      lineHeight: '16px',
                                      padding: '0 5px',
                                      margin: 0,
                                    }}
                                  >
                                    Invited
                                  </Tag>
                                )}
                              </div>
                            }
                            description={
                              <span style={{ color: '#8696a0', fontSize: 12 }}>
                                {isInvite ? 'Tap to accept or decline' : room.roomId}
                              </span>
                            }
                          />
                        </List.Item>
                      );
                    }}
                  />
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
