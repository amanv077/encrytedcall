import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Spin, Typography, Empty, Input } from 'antd';
import { LockOutlined, SearchOutlined, CloseOutlined } from '@ant-design/icons';
import { useSelector } from 'react-redux';
import { storageService } from '../../utils/storageService';
import { selectActiveRoomId } from '../../../../store/chatSlice';
import { useChat } from '../../hooks/useChat';
import { useTimeline } from '../../hooks/useTimeline';
import { useRoomMembership } from '../../hooks/useRoomMembership';
import { roomService } from '../../utils/roomService';
import { matrixManager } from '../../utils/matrixClient';
import MessageBubble from '../MessageBubble/MessageBubble';
import CallHistoryItem from '../CallHistoryItem/CallHistoryItem';
import InviteItem, { RoomInviteGate } from '../InviteItem/InviteItem';
import MessageInput from '../MessageInput/MessageInput';
import styles from './ChatPanel.module.scss';

const { Text } = Typography;

function SystemMessage({ text }) {
  return (
    <div className={styles.systemMessage}>
      <span>{text}</span>
    </div>
  );
}

function DateDivider({ timestamp }) {
  const label = new Date(timestamp).toLocaleDateString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return (
    <div className={styles.dateDivider}>
      <span>{label}</span>
    </div>
  );
}

function isSameDay(ts1, ts2) {
  const a = new Date(ts1);
  const b = new Date(ts2);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * ChatPanel – the main conversation view.
 *
 * Invite gate: when the selected room has membership='invite', this component
 * shows a full-screen RoomInviteGate with Accept/Decline.  The message input
 * and call buttons are hidden until the user accepts and membership becomes 'join'.
 *
 * @param {{ onPlaceCall: (roomId: string, isVideo: boolean) => void, isReady: boolean, msgSearchOpen: boolean, onCloseSearch: () => void }} props
 */
export default function ChatPanel({ onPlaceCall, isReady, msgSearchOpen, onCloseSearch }) {
  const roomId = useSelector(selectActiveRoomId);
  const membership = useRoomMembership(roomId);

  const { isLoading, isSending, hasMore, sendMessage, loadMore } = useChat(roomId);
  const timeline = useTimeline(roomId);

  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const prevScrollHeightRef = useRef(0);
  const searchDebounceRef = useRef(null);

  // ── Message search state ───────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Clear search state whenever the panel is closed or room changes
  useEffect(() => {
    if (!msgSearchOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [msgSearchOpen, roomId]);

  const handleSearchChange = useCallback((e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (!q.trim() || q.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await storageService.searchMessages(roomId, q.trim());
        setSearchResults(results || []);
      } catch (err) {
        console.error('[ChatPanel] searchMessages error:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [roomId]);

  const isEncrypted = roomId ? roomService.isRoomEncrypted(roomId) : false;

  // ── Derive invite details for the gate ──────────────────────────────────────
  const inviteDetails = React.useMemo(() => {
    if (!roomId || membership !== 'invite') return null;
    const client = matrixManager.getClient();
    const room = client?.getRoom(roomId);
    if (!room) return { invitedByName: 'Someone', roomName: roomId };

    // Find the member event that has our invite
    const myUserId = client.getUserId();
    const myMember = room.getMember(myUserId);
    const inviter = myMember?.events?.member?.getSender?.();
    const inviterMember = inviter ? room.getMember(inviter) : null;
    const invitedByName =
      inviterMember?.name || inviterMember?.rawDisplayName || inviter || 'Someone';

    return {
      invitedByName,
      roomName: room.name || room.roomId,
    };
  }, [roomId, membership]);

  // ── Scroll to bottom on new messages ───────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline.length, roomId]);

  // ── Preserve scroll position when older messages are prepended ─────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const newHeight = container.scrollHeight;
    const diff = newHeight - prevScrollHeightRef.current;
    if (diff > 0 && prevScrollHeightRef.current > 0) {
      container.scrollTop += diff;
    }
    prevScrollHeightRef.current = newHeight;
  }, [timeline.length]);

  // ── Scroll-up → load more ──────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (container.scrollTop < 80 && hasMore && !isLoading) {
      prevScrollHeightRef.current = container.scrollHeight;
      loadMore();
    }
  }, [hasMore, isLoading, loadMore]);

  // ── No room selected ────────────────────────────────────────────────────────
  if (!roomId) {
    return (
      <div className={styles.emptyState}>
        <Empty
          description={
            <Text style={{ color: '#8696a0' }}>
              Select a conversation from the sidebar
            </Text>
          }
        />
      </div>
    );
  }

  // ── Invite gate – blocks chat until the user accepts ───────────────────────
  if (membership === 'invite' && inviteDetails) {
    return (
      <RoomInviteGate
        roomId={roomId}
        invitedByName={inviteDetails.invitedByName}
        roomName={inviteDetails.roomName}
      />
    );
  }

  // ── Normal chat view ────────────────────────────────────────────────────────
  return (
    <div className={styles.panel}>
      {/* E2EE banner */}
      {isEncrypted && (
        <div className={styles.encryptionBanner}>
          <LockOutlined style={{ marginRight: 5 }} />
          Messages are end-to-end encrypted. No one outside this conversation can read them.
        </div>
      )}

      {/* ── Message search bar ──────────────────────────────────────────── */}
      {msgSearchOpen && (
        <div className={styles.searchBar}>
          <Input
            autoFocus
            prefix={<SearchOutlined style={{ color: '#8696a0' }} />}
            suffix={
              isSearching
                ? <Spin size="small" />
                : <CloseOutlined style={{ color: '#8696a0', cursor: 'pointer' }} onClick={onCloseSearch} />
            }
            placeholder="Search messages in this chat…"
            value={searchQuery}
            onChange={handleSearchChange}
            className={styles.searchInput}
          />
          {searchQuery.trim().length >= 2 && !isSearching && (
            <div className={styles.searchMeta}>
              {searchResults.length === 0
                ? 'No messages found'
                : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
            </div>
          )}
        </div>
      )}

      {/* ── Search results / normal timeline (mutually exclusive) ─────────── */}
      {msgSearchOpen && searchQuery.trim().length >= 2 ? (
        <div className={styles.searchResults}>
          {searchResults.length === 0 && !isSearching && (
            <div className={styles.noMessages}>
              <SearchOutlined style={{ fontSize: 28, marginBottom: 8, color: '#8696a0' }} />
              <Text style={{ color: '#8696a0' }}>No messages match your search</Text>
            </div>
          )}
          {searchResults.map((item) => (
            <div key={item.eventId} className={styles.searchResultItem}>
              <div className={styles.searchResultMeta}>
                <span className={styles.searchResultSender}>{item.senderName || item.sender}</span>
                <span className={styles.searchResultTime}>
                  {new Date(item.timestamp).toLocaleString([], {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
              <div
                className={styles.searchResultBody}
                dangerouslySetInnerHTML={{ __html: item.highlight || item.body }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div
          className={styles.messageList}
          ref={containerRef}
          onScroll={handleScroll}
        >
          {isLoading && (
            <div className={styles.loadingSpinner}>
              <Spin size="small" />
            </div>
          )}

          {timeline.length === 0 && !isLoading && (
            <div className={styles.noMessages}>
              <LockOutlined style={{ fontSize: 28, marginBottom: 8, color: '#8696a0' }} />
              <Text style={{ color: '#8696a0' }}>
                {isEncrypted
                  ? 'This is an end-to-end encrypted conversation.'
                  : 'Start the conversation.'}
              </Text>
            </div>
          )}

          {timeline.map((item, idx) => {
            const prevItem = idx > 0 ? timeline[idx - 1] : null;
            const showDateDivider =
              !prevItem || !isSameDay(prevItem.timestamp, item.timestamp);
            const showSenderName =
              !prevItem ||
              prevItem.type !== 'message' ||
              prevItem.sender !== item.sender;

            return (
              <React.Fragment key={item.eventId}>
                {showDateDivider && <DateDivider timestamp={item.timestamp} />}

                {item.type === 'message' && (
                  <MessageBubble item={item} showSenderName={showSenderName} />
                )}

                {item.type === 'call' && (
                  <CallHistoryItem
                    item={item}
                    onCallBack={
                      onPlaceCall
                        ? () => onPlaceCall(roomId, item.callType === 'video')
                        : null
                    }
                  />
                )}

                {item.type === 'invite' && <InviteItem item={item} />}

                {item.type === 'system' && <SystemMessage text={item.text} />}
              </React.Fragment>
            );
          })}

          <div ref={bottomRef} />
        </div>
      )}

      {/* Message input – only shown when actually joined */}
      <MessageInput
        onSend={sendMessage}
        disabled={!isReady || isSending || !roomId}
        isEncrypted={isEncrypted}
      />
    </div>
  );
}
