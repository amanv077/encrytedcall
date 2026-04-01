import React, { useMemo } from 'react';
import { Modal, Button, Typography, Space, Avatar } from 'antd';
import { PhoneOutlined, UserOutlined } from '@ant-design/icons';
import { matrixManager } from '../../utils/matrixClient';
import styles from './CallOverlay.module.scss';

const { Title, Text } = Typography;

export default function CallOverlay({ call, onAccept, onReject }) {
  if (!call) return null;

  const caller = useMemo(() => {
    try {
      const client = matrixManager.getClient();
      const otherMember =
        call.getOpponentMember?.() ||
        (client && call.roomId
          ? client.getRoom(call.roomId)?.getJoinedMembers?.()?.find((m) => m.userId !== client.getUserId())
          : null);

      const displayName =
        otherMember?.name ||
        otherMember?.rawDisplayName ||
        otherMember?.userId ||
        call.callerId ||
        'Unknown caller';

      const avatarUrl =
        (client && otherMember?.getAvatarUrl
          ? otherMember.getAvatarUrl(client.getHomeserverUrl(), 64, 64, 'crop')
          : null);

      return { displayName, avatarUrl };
    } catch {
      return { displayName: call.callerId || 'Unknown caller', avatarUrl: null };
    }
  }, [call]);

  const callKindLabel = useMemo(() => {
    if (call?.isVideoCall === true) return 'Incoming video call';
    if (call?.hasRemoteUserMediaVideoTrack === true) return 'Incoming video call';
    return 'Incoming voice call';
  }, [call]);

  return (
    <Modal
      open={true}
      closable={false}
      footer={null}
      centered
      width={360}
      maskClosable={false}
      styles={{
        body: { padding: 0 },
        content: { borderRadius: 16, overflow: 'hidden' },
      }}
      className={styles.modal}
    >
      <div className={styles.body}>
        <div className={styles.header}>
          <Avatar
            size={72}
            src={caller.avatarUrl || undefined}
            icon={!caller.avatarUrl && <UserOutlined />}
            className={styles.avatar}
          />
          <Text className={styles.callType}>{callKindLabel}</Text>
          <Title level={4} className={styles.title}>{caller.displayName}</Title>
          <Text className={styles.callerName}>Secure SynApp call</Text>
        </div>

        <Space size="large" className={styles.btnGroup}>
          <div className={styles.btnCol}>
            <Button
              shape="circle"
              size="large"
              icon={<PhoneOutlined style={{ transform: 'rotate(135deg)' }} />}
              onClick={onReject}
              className={styles.btnReject}
            />
            <span className={styles.btnLabel}>Decline</span>
          </div>

          <div className={styles.btnCol}>
            <Button
              shape="circle"
              size="large"
              icon={<PhoneOutlined />}
              onClick={onAccept}
              className={styles.btnAccept}
            />
            <span className={styles.btnLabel}>Pick up</span>
          </div>
        </Space>
      </div>
    </Modal>
  );
}
