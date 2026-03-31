import React, { useState, useEffect, useMemo } from 'react';
import { Typography, Button, Space, Avatar, Tooltip } from 'antd';
import {
  PhoneOutlined,
  VideoCameraOutlined,
  SearchOutlined,
  LockOutlined,
  UserOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { setActiveRoom, selectActiveRoomId } from '../../../../store/chatSlice';
import { selectCallMode, selectUserSearchOpen } from '../../../../store/uiSlice';
import { matrixManager } from '../../utils/matrixClient';
import { roomService } from '../../utils/roomService';
import { useCallManager } from '../../hooks/useCallManager';
import { useRoomMembership } from '../../hooks/useRoomMembership';
import CallOverlay from '../CallOverlay/CallOverlay';
import ActiveCall from '../ActiveCall/ActiveCall';
import Sidebar from '../Sidebar/Sidebar';
import ChatPanel from '../ChatPanel/ChatPanel';
import UserSearch from '../UserSearch/UserSearch';
import styles from './ChatLayout.module.scss';

const { Title, Text } = Typography;

// ─── Room header helpers (mirrors Sidebar's logic) ────────────────────────────

function getRoomHeaderInfo(client, roomId) {
  if (!client || !roomId) return null;
  const room = client.getRoom(roomId);
  if (!room) return null;

  const myUserId = client.getUserId();

  // Detect DM
  let isDM = false;
  const mDirect = client.getAccountData?.('m.direct');
  if (mDirect?.getContent) {
    const allDMRoomIds = Object.values(mDirect.getContent() || {}).flat();
    if (allDMRoomIds.includes(roomId)) isDM = true;
  }
  if (!isDM && room.getDMInviter?.()) isDM = true;
  if (!isDM) {
    const createEvt = room.currentState?.getStateEvents?.('m.room.create', '');
    if (createEvt?.getContent?.()?.is_direct) isDM = true;
  }

  if (isDM) {
    // Find the other person
    const inviter = room.getDMInviter?.();
    const otherId = inviter || room.getJoinedMembers().find(m => m.userId !== myUserId)?.userId;
    const otherMember = otherId ? room.getMember(otherId) : null;
    return {
      isDM: true,
      name: otherMember?.name || otherMember?.rawDisplayName || otherId || room.name || roomId,
      avatarUrl: otherMember?.getAvatarUrl?.(client.getHomeserverUrl(), 40, 40, 'crop') || null,
      subtitle: otherId || '',
    };
  }

  // Group room
  const memberCount = room.getJoinedMemberCount?.() ?? room.getJoinedMembers().length;
  return {
    isDM: false,
    name: room.name || roomId,
    avatarUrl: null,
    subtitle: memberCount > 0 ? `${memberCount} members` : roomId,
  };
}

// ─── ChatLayout ───────────────────────────────────────────────────────────────

export default function ChatLayout({ onLogout }) {
  const dispatch = useDispatch();
  const activeRoomId = useSelector(selectActiveRoomId);
  const callMode = useSelector(selectCallMode);
  const userSearchOpen = useSelector(selectUserSearchOpen);

  const [isReady, setIsReady] = useState(matrixManager.isReady);
  const [dialerNotice, setDialerNotice] = useState('');

  const {
    incomingCall,
    activeCall,
    callState,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    isScreenSharing,
    placeCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
  } = useCallManager();

  // Poll until the Matrix client is ready
  useEffect(() => {
    if (isReady) return;
    const interval = setInterval(() => {
      if (matrixManager.isReady) {
        setIsReady(true);
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isReady]);

  const handleSelectRoom = (roomId) => {
    dispatch(setActiveRoom(roomId));
    setDialerNotice('');
  };

  const handleCall = async (isVideo = true) => {
    if (!activeRoomId) return;
    const result = await placeCall(activeRoomId, isVideo);
    if (!result?.ok) {
      setDialerNotice(result?.error?.message || 'Unable to place call.');
    } else {
      setDialerNotice('');
    }
  };

  const handlePlaceCallFromTimeline = async (roomId, isVideo) => {
    const result = await placeCall(roomId, isVideo);
    if (!result?.ok) {
      setDialerNotice(result?.error?.message || 'Unable to place call.');
    }
  };

  // Room metadata for the header (re-derived when activeRoomId changes)
  const client = matrixManager.getClient();
  const headerInfo = useMemo(
    () => getRoomHeaderInfo(client, activeRoomId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeRoomId],
  );

  const isEncrypted = activeRoomId ? roomService.isRoomEncrypted(activeRoomId) : false;
  const roomMembership = useRoomMembership(activeRoomId);
  const isInvitePending = roomMembership === 'invite';

  return (
    <div className={styles.mainLayout}>
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <Sidebar
        onSelectTarget={handleSelectRoom}
        onLogout={onLogout}
        selectedTarget={activeRoomId}
      />

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className={styles.contentArea}>

        {/* Full-screen active call */}
        {callMode === 'fullscreen' ? (
          <ActiveCall
            mode="fullscreen"
            localStream={localStream}
            remoteStream={remoteStream}
            isMuted={isMuted}
            isVideoOff={isVideoOff}
            isScreenSharing={isScreenSharing}
            callState={callState}
            toggleMute={toggleMute}
            toggleVideo={toggleVideo}
            toggleScreenShare={toggleScreenShare}
            endCall={endCall}
          />
        ) : (
          <>
            {activeRoomId ? (
              <div className={styles.chatColumn}>

                {/* ── Chat header ─────────────────────────────────────────── */}
                <div className={styles.chatHeader}>
                  <div className={styles.headerLeft}>
                    {/* Avatar: contact photo for DM, team icon for group */}
                    {headerInfo?.isDM ? (
                      <Avatar
                        src={headerInfo.avatarUrl}
                        icon={!headerInfo.avatarUrl && <UserOutlined />}
                        style={{ background: '#00a884', flexShrink: 0 }}
                        size={38}
                      />
                    ) : (
                      <Avatar
                        style={{ background: '#00a884', flexShrink: 0 }}
                        icon={<TeamOutlined />}
                        size={38}
                      />
                    )}

                    <div className={styles.headerInfo}>
                      <div className={styles.roomName}>
                        {headerInfo?.name || activeRoomId}
                      </div>
                      <div className={styles.roomSub}>
                        {isInvitePending ? (
                          <span style={{ color: '#ea005e' }}>Pending invitation</span>
                        ) : isEncrypted ? (
                          <>
                            <LockOutlined style={{ fontSize: 11, marginRight: 4 }} />
                            end-to-end encrypted
                          </>
                        ) : (
                          <span>{headerInfo?.subtitle}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Call buttons — hidden while invite is pending */}
                  {!isInvitePending && (
                    <Space className={styles.headerActions}>
                      {dialerNotice && (
                        <span className={styles.dialerNotice}>{dialerNotice}</span>
                      )}
                      <Tooltip title="Voice call">
                        <Button
                          type="text"
                          icon={<PhoneOutlined />}
                          onClick={() => handleCall(false)}
                          disabled={!isReady || callState !== 'idle'}
                          className={styles.callBtn}
                        />
                      </Tooltip>
                      <Tooltip title="Video call">
                        <Button
                          type="text"
                          icon={<VideoCameraOutlined />}
                          onClick={() => handleCall(true)}
                          disabled={!isReady || callState !== 'idle'}
                          className={styles.callBtn}
                        />
                      </Tooltip>
                      <Tooltip title="Search messages">
                        <Button
                          type="text"
                          icon={<SearchOutlined />}
                          className={styles.callBtn}
                          disabled
                        />
                      </Tooltip>
                    </Space>
                  )}
                </div>

                {/* ── Chat panel + optional PiP ────────────────────────── */}
                <div className={styles.chatPanelWrapper}>
                  <ChatPanel
                    isReady={isReady}
                    onPlaceCall={handlePlaceCallFromTimeline}
                  />

                  {callMode === 'pip' && (activeCall || incomingCall) && (
                    <ActiveCall
                      mode="pip"
                      localStream={localStream}
                      remoteStream={remoteStream}
                      isMuted={isMuted}
                      isVideoOff={isVideoOff}
                      isScreenSharing={isScreenSharing}
                      callState={callState}
                      toggleMute={toggleMute}
                      toggleVideo={toggleVideo}
                      toggleScreenShare={toggleScreenShare}
                      endCall={endCall}
                    />
                  )}
                </div>
              </div>
            ) : (
              /* Welcome state */
              <div className={styles.welcomePlaceholder}>
                <UserOutlined
                  style={{ fontSize: 72, color: '#8696a0', opacity: 0.3, marginBottom: 20 }}
                />
                <Title level={3} style={{ color: '#e9edef', fontWeight: 300, margin: 0 }}>
                  Secure Encrypted Chat
                </Title>
                <Text style={{ color: '#8696a0', textAlign: 'center', marginTop: 10 }}>
                  Select a conversation or tap the pencil icon to start a new chat.
                  <br />
                  All messages and calls are end-to-end encrypted.
                </Text>
              </div>
            )}
          </>
        )}
      </div>

      {/* Always-rendered: incoming call modal */}
      <CallOverlay
        call={incomingCall}
        onAccept={answerCall}
        onReject={rejectCall}
      />

      {/* User search modal */}
      <UserSearch open={userSearchOpen} />
    </div>
  );
}
