import React, { useState } from 'react';
import { useMatrixData } from '../../hooks/useMatrixData';
import { matrixManager } from '../../utils/matrixClient';
import { Input, List, Avatar, Badge, Spin, Tabs, Button, Tooltip, Dropdown } from 'antd';
import { 
  SearchOutlined, 
  UserOutlined, 
  MessageOutlined, 
  MailOutlined, 
  CheckOutlined, 
  CloseOutlined,
  MoreOutlined
} from '@ant-design/icons';
import styles from './Sidebar.module.scss';
import './Tabs.scss';

export default function Sidebar({ onSelectTarget, onLogout, selectedTarget }) {
  const { rooms, users, loading: dataLoading } = useMatrixData();
  const [searchTerm, setSearchTerm] = useState('');
  const [inviteActionLoading, setInviteActionLoading] = useState({});
  const client = matrixManager.getClient();
  const myUserId = client?.getUserId();

  const getRoomMembership = (room) => {
    if (!room) return null;
    const membershipFromMethod = room.getMyMembership?.();
    if (membershipFromMethod) return membershipFromMethod;
    if (myUserId) {
      const myMember = room.getMember?.(myUserId);
      if (myMember?.membership) return myMember.membership;
      const stateMembership = room.currentState?.getStateEvents?.('m.room.member', myUserId)?.getContent?.()?.membership;
      if (stateMembership) return stateMembership;
    }
    return null;
  };

  const inviteRooms = (rooms || []).filter((room) => getRoomMembership(room) === 'invite');

  const filteredUsers = (users || []).filter(user =>
    user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.userId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredRooms = (rooms || []).filter(room =>
    room.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    room.roomId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleInviteAction = async (roomId, action) => {
    if (!client) return;
    setInviteActionLoading((prev) => ({ ...prev, [roomId]: action }));
    try {
      if (action === 'accept') {
        await client.joinRoom(roomId);
      } else {
        await client.leave(roomId);
      }
    } catch (e) {
      console.error(`Failed to ${action} invite for ${roomId}`, e);
    } finally {
      setInviteActionLoading((prev) => ({ ...prev, [roomId]: null }));
    }
  };

  const menuItems = [
    { key: '1', label: 'New group' },
    { key: '2', label: 'Communities' },
    { key: '3', label: 'Starred messages' },
    { key: '4', label: 'Settings' },
    { key: '5', label: 'Log out', danger: true, onClick: onLogout },
  ];

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <Avatar src={client?.getUser(myUserId)?.avatarUrl || undefined} icon={!client?.getUser(myUserId)?.avatarUrl && <UserOutlined />} style={{ background: '#dfe5e7', color: '#111b21', cursor: 'pointer' }} />
        <div className={styles.headerIcons}>
          <Tooltip title="Communities"><UserOutlined className={styles.icon} /></Tooltip>
          <Tooltip title="Status"><div className={styles.statusIcon} /></Tooltip>
          <Tooltip title="New Chat"><MessageOutlined className={styles.icon} /></Tooltip>
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <MoreOutlined className={styles.icon} />
          </Dropdown>
        </div>
      </div>
      
      <div className={styles.searchWrapper}>
        <Input 
          prefix={<SearchOutlined style={{ color: '#8696a0' }} />} 
          placeholder="Search or start new chat" 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
          style={{ background: '#202c33', border: 'none', color: '#e9edef' }}
        />
      </div>

      <div className={styles.listWrapper}>
        {dataLoading ? (
          <div className={styles.spinner}>
            <Spin />
          </div>
        ) : (
          <Tabs 
            defaultActiveKey="1" 
            centered 
            className="waTabs"
            tabBarStyle={{ margin: 0, borderBottom: '1px solid #202c33' }}
            items={[
              {
                label: 'Chats',
                key: '1',
                children: (
                  <List
                    itemLayout="horizontal"
                    dataSource={filteredUsers}
                    renderItem={(user) => (
                      <List.Item 
                        onClick={() => onSelectTarget(user.userId)}
                        className={`${styles.listItem} ${selectedTarget === user.userId ? styles.active : ''}`}
                      >
                        <List.Item.Meta
                          avatar={
                            <Badge dot color={user.presence === 'online' ? '#00a884' : '#8696a0'} offset={[-5, 35]}>
                              <Avatar src={user.avatarUrl} icon={<UserOutlined />} size={48} />
                            </Badge>
                          }
                          title={<span style={{ color: '#e9edef', fontSize: 17 }}>{user.displayName || user.userId}</span>}
                          description={<span style={{ color: '#8696a0' }}>{user.userId}</span>}
                        />
                      </List.Item>
                    )}
                  />
                )
              },
              {
                label: 'Rooms',
                key: '2',
                children: (
                  <List
                    itemLayout="horizontal"
                    dataSource={filteredRooms}
                    renderItem={(room) => (
                      <List.Item 
                        onClick={() => onSelectTarget(room.roomId)}
                        className={`${styles.listItem} ${selectedTarget === room.roomId ? styles.active : ''}`}
                      >
                        <List.Item.Meta
                          avatar={<Avatar style={{ background: '#00a884' }} icon={<MessageOutlined />} size={48} />}
                          title={<span style={{ color: '#e9edef', fontSize: 17 }}>{room.name || 'Unnamed Room'}</span>}
                          description={<span style={{ color: '#8696a0' }}>{room.roomId}</span>}
                        />
                      </List.Item>
                    )}
                  />
                )
              },
              {
                label: <span>Invites {inviteRooms.length > 0 && <Badge count={inviteRooms.length} color="#00a884" style={{ marginLeft: 8 }} />}</span>,
                key: '3',
                children: (
                  <List
                    itemLayout="horizontal"
                    dataSource={inviteRooms}
                    renderItem={(room) => (
                      <List.Item className={styles.listItem}>
                        <List.Item.Meta
                          avatar={<Avatar style={{ background: '#ea005e' }} icon={<MailOutlined />} size={48} />}
                          title={<span style={{ color: '#e9edef' }}>{room.name || 'Direct Message'}</span>}
                          description={
                            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                              <Button 
                                size="small" 
                                type="primary" 
                                icon={<CheckOutlined />}
                                loading={inviteActionLoading[room.roomId] === 'accept'}
                                onClick={() => handleInviteAction(room.roomId, 'accept')}
                                style={{ background: '#00a884' }}
                              >
                                Accept
                              </Button>
                              <Button 
                                size="small" 
                                danger
                                icon={<CloseOutlined />}
                                loading={inviteActionLoading[room.roomId] === 'decline'}
                                onClick={() => handleInviteAction(room.roomId, 'decline')}
                              >
                                Decline
                              </Button>
                            </div>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )
              }
            ]}
          />
        )}
      </div>
    </div>
  );
}
