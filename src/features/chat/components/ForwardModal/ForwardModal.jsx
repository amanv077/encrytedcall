import React, { useMemo, useState } from 'react';
import { Modal, Input, List, Avatar, Spin, Typography, Empty, message as antdMessage } from 'antd';
import { SearchOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import { useMatrixData } from '../../hooks/useMatrixData';
import { roomService } from '../../utils/roomService';
import { matrixManager } from '../../utils/matrixClient';
import styles from './ForwardModal.module.scss';

const { Text } = Typography;

/**
 * ForwardModal
 * - Search users/rooms
 * - Pick one target
 * - Send forwarded message with Matrix reference relation
 */
export default function ForwardModal({ open, onClose, sourceItem }) {
  const { rooms, users, loading } = useMatrixData();
  const [query, setQuery] = useState('');
  const [forwardingKey, setForwardingKey] = useState('');

  const client = matrixManager.getClient();
  const myUserId = client?.getUserId?.();

  const joinedRooms = useMemo(
    () => (rooms || []).filter((r) => r.getMyMembership?.() === 'join'),
    [rooms],
  );

  const targets = useMemo(() => {
    const q = query.trim().toLowerCase();
    const roomTargets = joinedRooms.map((room) => ({
      key: `room:${room.roomId}`,
      type: 'room',
      roomId: room.roomId,
      name: room.name || room.roomId,
      subtitle: room.roomId,
      avatarUrl: null,
    }));

    const userTargets = (users || [])
      .filter((u) => u.userId !== myUserId)
      .map((u) => ({
        key: `user:${u.userId}`,
        type: 'user',
        userId: u.userId,
        name: u.displayName || u.userId,
        subtitle: u.userId,
        avatarUrl: u.avatarUrl || null,
      }));

    const all = [...roomTargets, ...userTargets];
    if (!q) return all;
    return all.filter((t) => t.name.toLowerCase().includes(q) || t.subtitle.toLowerCase().includes(q));
  }, [joinedRooms, users, query, myUserId]);

  const resetAndClose = () => {
    setQuery('');
    setForwardingKey('');
    onClose?.();
  };

  const handleForward = async (target) => {
    const clientNow = matrixManager.getClient();
    if (!clientNow || !sourceItem?.body) return;

    setForwardingKey(target.key);
    try {
      let roomId = target.roomId;
      if (target.type === 'user') {
        roomId = await roomService.findOrCreateDMRoom(target.userId);
      }

      const sourceRoomId = sourceItem?.roomId;
      const canReference = !!sourceItem?.eventId && sourceRoomId && sourceRoomId === roomId;

      // "Forwarded" context + matrix reference to original message
      await clientNow.sendMessage(roomId, {
        msgtype: sourceItem.msgtype || 'm.text',
        body: `Forwarded\n${sourceItem.body}`,
        // Matrix references are only valid within the SAME room.
        // Cross-room forward must not include m.reference, otherwise Synapse 400.
        'm.relates_to': canReference
          ? { rel_type: 'm.reference', event_id: sourceItem.eventId }
          : undefined,
        'com.synapp.forwarded': true,
      });

      antdMessage.success('Message forwarded');
      resetAndClose();
    } catch (err) {
      antdMessage.error(err?.message || 'Unable to forward message');
    } finally {
      setForwardingKey('');
    }
  };

  return (
    <Modal
      open={open}
      onCancel={resetAndClose}
      footer={null}
      title="Forward message"
      centered
      className={styles.modal}
    >
      <div className={styles.searchRow}>
        <Input
          autoFocus
          prefix={<SearchOutlined style={{ color: '#9ba8b5' }} />}
          placeholder="Search users or rooms"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={styles.searchInput}
          bordered={false}
        />
      </div>

      <div className={styles.listWrap}>
        {loading ? (
          <div className={styles.centerState}><Spin size="small" /></div>
        ) : targets.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text style={{ color: '#9ba8b5', fontSize: 13 }}>No users or rooms found</Text>}
          />
        ) : (
          <List
            dataSource={targets}
            renderItem={(t) => (
              <List.Item className={styles.item} onClick={() => handleForward(t)}>
                <List.Item.Meta
                  avatar={
                    <Avatar
                      src={t.avatarUrl || undefined}
                      icon={t.type === 'room' ? <TeamOutlined /> : <UserOutlined />}
                      className={styles.avatar}
                    />
                  }
                  title={<span className={styles.name}>{t.name}</span>}
                  description={<span className={styles.sub}>{t.subtitle}</span>}
                />
                {forwardingKey === t.key && <Spin size="small" />}
              </List.Item>
            )}
          />
        )}
      </div>
    </Modal>
  );
}

