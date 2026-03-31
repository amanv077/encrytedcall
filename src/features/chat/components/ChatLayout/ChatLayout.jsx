import React, { useState, useEffect, useMemo } from 'react';
import { Typography, Button, Space, Avatar, Tooltip, Input } from 'antd';
import {
  PhoneOutlined,
  VideoCameraOutlined,
  SearchOutlined,
  UserOutlined,
  TeamOutlined,
  HomeOutlined,
  MessageOutlined,
  TagOutlined,
  FileTextOutlined,
  CloudOutlined,
  ToolOutlined,
  SettingOutlined,
  BellOutlined,
  GlobalOutlined,
  EllipsisOutlined,
  FormOutlined,
} from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { setActiveRoom, selectActiveRoomId } from '../../../../store/chatSlice';
import { selectCallMode, selectUserSearchOpen } from '../../../../store/uiSlice';
import { openUserSearch } from '../../../../store/uiSlice';
import { matrixManager } from '../../utils/matrixClient';
import { roomService } from '../../utils/roomService';
import { useCallManager } from '../../hooks/useCallManager';
import { useRoomMembership } from '../../hooks/useRoomMembership';
import CallOverlay from '../CallOverlay/CallOverlay';
import ActiveCall from '../ActiveCall/ActiveCall';
import Sidebar from '../Sidebar/Sidebar';
import ChatPanel from '../ChatPanel/ChatPanel';
import UserSearch from '../UserSearch/UserSearch';
import ContactPanel from '../ContactPanel/ContactPanel';
import styles from './ChatLayout.module.scss';

const { Text } = Typography;

// ── Room header helpers ───────────────────────────────────────────────────────

function getRoomHeaderInfo(client, roomId) {
  if (!client || !roomId) return null;
  const room = client.getRoom(roomId);
  if (!room) return null;

  const myUserId = client.getUserId();

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

  const memberCount = room.getJoinedMemberCount?.() ?? room.getJoinedMembers().length;
  return {
    isDM: false,
    name: room.name || roomId,
    avatarUrl: null,
    subtitle: memberCount > 0 ? `${memberCount} members` : roomId,
  };
}

// ── Nav rail item ─────────────────────────────────────────────────────────────

function NavItem({ icon, label, active, onClick }) {
  return (
    <Tooltip title={label} placement="right">
      <div className={`${styles.navItem} ${active ? styles.navItemActive : ''}`} onClick={onClick}>
        <span className={styles.navIcon}>{icon}</span>
      </div>
    </Tooltip>
  );
}

// ── ChatLayout ────────────────────────────────────────────────────────────────

export default function ChatLayout({ onLogout }) {
  const dispatch = useDispatch();
  const activeRoomId   = useSelector(selectActiveRoomId);
  const callMode       = useSelector(selectCallMode);
  const userSearchOpen = useSelector(selectUserSearchOpen);

  const [isReady, setIsReady]           = useState(matrixManager.isReady);
  const [dialerNotice, setDialerNotice] = useState('');
  const [msgSearchOpen, setMsgSearchOpen] = useState(false);

  const {
    incomingCall, activeCall, callState,
    localStream, remoteStream,
    isMuted, isVideoOff, isScreenSharing,
    placeCall, answerCall, rejectCall, endCall,
    toggleMute, toggleVideo, toggleScreenShare,
  } = useCallManager();

  useEffect(() => {
    if (isReady) return;
    const interval = setInterval(() => {
      if (matrixManager.isReady) { setIsReady(true); clearInterval(interval); }
    }, 500);
    return () => clearInterval(interval);
  }, [isReady]);

  const handleSelectRoom = (roomId) => {
    dispatch(setActiveRoom(roomId));
    setDialerNotice('');
    setMsgSearchOpen(false);
  };

  const handleCall = async (isVideo = true) => {
    if (!activeRoomId) return;
    const result = await placeCall(activeRoomId, isVideo);
    if (!result?.ok) setDialerNotice(result?.error?.message || 'Unable to place call.');
    else setDialerNotice('');
  };

  const handlePlaceCallFromTimeline = async (roomId, isVideo) => {
    const result = await placeCall(roomId, isVideo);
    if (!result?.ok) setDialerNotice(result?.error?.message || 'Unable to place call.');
  };

  const client     = matrixManager.getClient();
  const myUserId   = client?.getUserId();
  const headerInfo = useMemo(
    () => getRoomHeaderInfo(client, activeRoomId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeRoomId],
  );

  const isEncrypted    = activeRoomId ? roomService.isRoomEncrypted(activeRoomId) : false;
  const roomMembership = useRoomMembership(activeRoomId);
  const isInvitePending = roomMembership === 'invite';

  return (
    <div className={styles.appShell}>

      {/* ── Left nav rail ──────────────────────────────────────────────────── */}
      <nav className={styles.navRail}>
        <div className={styles.navLogo}>
          <div className={styles.logoCircle}>
            <MessageOutlined style={{ fontSize: 18, color: '#fff' }} />
          </div>
          <span className={styles.logoText}>SynApp</span>
        </div>

        <div className={styles.navItems}>
          <NavItem icon={<HomeOutlined />}     label="Home" />
          <NavItem icon={<MessageOutlined />}  label="Clinical Messaging" active />
          <NavItem icon={<TagOutlined />}      label="Expertise" />
          <NavItem icon={<FileTextOutlined />} label="Notes" />
          <NavItem icon={<CloudOutlined />}    label="Cloud" />
          <NavItem icon={<ToolOutlined />}     label="Clinical Tools" />
        </div>

        <div className={styles.navBottom}>
          <NavItem icon={<SettingOutlined />} label="Settings" />
          <Avatar
            src={client?.getUser(myUserId)?.avatarUrl || undefined}
            icon={<UserOutlined />}
            size={36}
            className={styles.navAvatar}
          />
        </div>
      </nav>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className={styles.mainContent}>

        {/* Top bar */}
        <div className={styles.topBar}>
          <Input
            prefix={<SearchOutlined style={{ color: '#9ba8b5' }} />}
            placeholder="Search patients, requests, messages, tools…  ⌘ K"
            className={styles.globalSearch}
            bordered={false}
          />
          <div className={styles.topBarRight}>
            <span className={styles.langToggle}>
              <GlobalOutlined style={{ marginRight: 4 }} /> English
              <span className={styles.langDivider}>|</span> Fr
            </span>
            <Tooltip title="Notifications">
              <Button type="text" icon={<BellOutlined />} className={styles.topBarBtn} />
            </Tooltip>
            <Avatar
              src={client?.getUser(myUserId)?.avatarUrl || undefined}
              icon={<UserOutlined />}
              size={32}
              style={{ cursor: 'pointer', border: '2px solid #006d6a' }}
            />
          </div>
        </div>

        {/* Body row: sidebar + chat + contact panel */}
        <div className={styles.bodyRow}>

          {/* Conversations sidebar */}
          <div className={styles.sidebarCol}>
            <div className={styles.sidebarTop}>
              <span className={styles.sidebarTitle}>Chat</span>
              <Tooltip title="New conversation">
                <Button
                  type="text"
                  icon={<FormOutlined />}
                  className={styles.newChatBtn}
                  onClick={() => dispatch(openUserSearch())}
                />
              </Tooltip>
            </div>
            <Sidebar
              onSelectTarget={handleSelectRoom}
              onLogout={onLogout}
              selectedTarget={activeRoomId}
            />
          </div>

          {/* Chat area */}
          <div className={styles.chatCol}>
            {callMode === 'fullscreen' ? (
              <ActiveCall
                mode="fullscreen"
                localStream={localStream}
                remoteStream={remoteStream}
                isMuted={isMuted} isVideoOff={isVideoOff}
                isScreenSharing={isScreenSharing} callState={callState}
                toggleMute={toggleMute} toggleVideo={toggleVideo}
                toggleScreenShare={toggleScreenShare} endCall={endCall}
              />
            ) : activeRoomId ? (
              <>
                {/* Chat header */}
                <div className={styles.chatHeader}>
                  <div className={styles.headerLeft}>
                    {headerInfo?.isDM ? (
                      <Avatar
                        src={headerInfo.avatarUrl}
                        icon={!headerInfo.avatarUrl && <UserOutlined />}
                        size={38}
                        style={{ flexShrink: 0 }}
                      />
                    ) : (
                      <Avatar icon={<TeamOutlined />} size={38}
                        style={{ background: '#006d6a', flexShrink: 0 }} />
                    )}
                    <div>
                      <div className={styles.headerName}>{headerInfo?.name || activeRoomId}</div>
                      <div className={styles.headerSub}>
                        {isInvitePending ? (
                          <span style={{ color: '#e53e3e' }}>Pending invitation</span>
                        ) : (
                          <span>{headerInfo?.subtitle}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!isInvitePending && (
                    <Space className={styles.headerActions}>
                      {dialerNotice && (
                        <span className={styles.dialerNotice}>{dialerNotice}</span>
                      )}
                      <Tooltip title="Voice call">
                        <Button type="text" icon={<PhoneOutlined />}
                          onClick={() => handleCall(false)}
                          disabled={!isReady || callState !== 'idle'}
                          className={styles.headerBtn} />
                      </Tooltip>
                      <Tooltip title="Video call">
                        <Button type="text" icon={<VideoCameraOutlined />}
                          onClick={() => handleCall(true)}
                          disabled={!isReady || callState !== 'idle'}
                          className={styles.headerBtn} />
                      </Tooltip>
                      <Tooltip title="Search messages">
                        <Button type="text" icon={<SearchOutlined />}
                          className={`${styles.headerBtn} ${msgSearchOpen ? styles.headerBtnActive : ''}`}
                          onClick={() => setMsgSearchOpen((v) => !v)} />
                      </Tooltip>
                      <Button type="text" icon={<EllipsisOutlined />} className={styles.headerBtn} />
                    </Space>
                  )}
                </div>

                {/* Chat panel + PiP */}
                <div className={styles.chatPanelWrapper}>
                  <ChatPanel
                    isReady={isReady}
                    onPlaceCall={handlePlaceCallFromTimeline}
                    msgSearchOpen={msgSearchOpen}
                    onCloseSearch={() => setMsgSearchOpen(false)}
                  />
                  {callMode === 'pip' && (activeCall || incomingCall) && (
                    <ActiveCall
                      mode="pip"
                      localStream={localStream} remoteStream={remoteStream}
                      isMuted={isMuted} isVideoOff={isVideoOff}
                      isScreenSharing={isScreenSharing} callState={callState}
                      toggleMute={toggleMute} toggleVideo={toggleVideo}
                      toggleScreenShare={toggleScreenShare} endCall={endCall}
                    />
                  )}
                </div>
              </>
            ) : (
              <div className={styles.welcomePlaceholder}>
                <div className={styles.welcomeIcon}>
                  <MessageOutlined style={{ fontSize: 40, color: '#006d6a' }} />
                </div>
                <Text className={styles.welcomeTitle}>Secure Encrypted Chat</Text>
                <Text className={styles.welcomeSub}>
                  Select a conversation or tap the pencil icon to start a new chat.
                  <br />All messages and calls are end-to-end encrypted.
                </Text>
              </div>
            )}
          </div>

          {/* Right contact panel – always rendered, shows placeholder when no room selected */}
          <ContactPanel roomId={activeRoomId} />
        </div>
      </div>

      <CallOverlay call={incomingCall} onAccept={answerCall} onReject={rejectCall} />
      <UserSearch open={userSearchOpen} />
    </div>
  );
}
