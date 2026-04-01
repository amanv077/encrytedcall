import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Spin, Typography, Empty, Input, Modal } from 'antd';
import { LockOutlined, SearchOutlined, CloseOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { storageService } from '../../utils/storageService';
import { selectActiveRoomId } from '../../../../store/chatSlice';
import { useChat } from '../../hooks/useChat';
import { useTimeline } from '../../hooks/useTimeline';
import { useRoomMembership } from '../../hooks/useRoomMembership';
import { usePolls } from '../../hooks/usePolls';
import { addPoll, addVote, endPoll } from '../../../poll/pollSlice';
import { getPollsByRoom, getVotesByPoll } from '../../../poll/pollDb';
import { roomService } from '../../utils/roomService';
import { matrixManager } from '../../utils/matrixClient';
import MessageBubble from '../MessageBubble/MessageBubble';
import CallHistoryItem from '../CallHistoryItem/CallHistoryItem';
import InviteItem, { RoomInviteGate } from '../InviteItem/InviteItem';
import MessageInput from '../MessageInput/MessageInput';
import PollCard from '../PollCard/PollCard';
import PollCreator from '../PollCreator/PollCreator';
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
 * Wrap every occurrence of `term` inside `text` with <mark>…</mark> tags,
 * case-insensitively.  Returns the original text when there is no match.
 */
function _highlightTerm(text, term) {
  if (!text || !term) return text || '';
  try {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'gi'), (match) => `<mark>${match}</mark>`);
  } catch {
    return text;
  }
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
  const dispatch = useDispatch();
  const roomId = useSelector(selectActiveRoomId);
  const membership = useRoomMembership(roomId);
  const { createPoll, creatingPoll } = usePolls();

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
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [receiptVersion, setReceiptVersion] = useState(0);

  useEffect(() => {
    if (!roomId || membership !== 'join') return undefined;
    let cancelled = false;

    const hydrateRoomPolls = async () => {
      const polls = await getPollsByRoom(roomId);
      if (cancelled || !Array.isArray(polls)) return;

      for (let i = 0; i < polls.length; i += 1) {
        const poll = polls[i];
        dispatch(addPoll(poll));
        const votes = await getVotesByPoll(poll.pollId);
        if (cancelled || !Array.isArray(votes)) continue;
        for (let j = 0; j < votes.length; j += 1) {
          dispatch(addVote(votes[j]));
        }
        if (poll.isClosed) {
          dispatch(endPoll({ pollId: poll.pollId, roomId }));
        }
      }
    };

    hydrateRoomPolls().catch(() => console.error('[ChatPanel] poll hydration failed'));
    return () => {
      cancelled = true;
    };
  }, [dispatch, membership, roomId]);

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

    // ── Phase 1: instant in-memory search ────────────────────────────────────
    // The `timeline` array already holds the decrypted messages currently
    // displayed in Redux.  Filter it immediately so results appear with zero
    // latency regardless of whether the FTS index has been populated yet.
    const lower = q.trim().toLowerCase();
    const inMemoryResults = timeline
      .filter((item) => item.type === 'message' && item.body && item.body.toLowerCase().includes(lower))
      .map((item) => ({
        ...item,
        highlight: _highlightTerm(item.body, q.trim()),
      }))
      .reverse(); // most-recent first for search results
    setSearchResults(inMemoryResults);

    // ── Phase 2: FTS5 search in SQLite (debounced) ───────────────────────────
    // Supplements with older messages that are stored in the DB but not in the
    // current Redux window.  Results are merged, deduplicating by eventId.
    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const ftsResults = await storageService.searchMessages(roomId, q.trim());
        const inMemoryIds = new Set(inMemoryResults.map((r) => r.eventId));
        const extra = (ftsResults || []).filter((r) => !inMemoryIds.has(r.eventId));
        setSearchResults([...inMemoryResults, ...extra]);
      } catch (err) {
        console.error('[ChatPanel] searchMessages error:', err);
        // Keep the in-memory results even if FTS fails
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [roomId, timeline]);

  const isEncrypted = roomId ? roomService.isRoomEncrypted(roomId) : false;

  // Force a lightweight re-compute when Matrix read receipts arrive.
  // Receipt events do not always change timeline length/content, so relying on
  // `timeline` dependency alone can miss seen-status updates.
  useEffect(() => {
    const client = matrixManager.getClient();
    if (!client || !roomId) return;
    const onReceipt = (_event, room) => {
      if (room?.roomId === roomId) {
        setReceiptVersion((v) => v + 1);
      }
    };
    client.on('Room.receipt', onReceipt);
    return () => client.removeListener('Room.receipt', onReceipt);
  }, [roomId]);

  // Build per-message outgoing status from Matrix receipts:
  // - default outgoing state after send => delivered (double tick)
  // - seen when another member's read-marker has progressed to this message
  //   (or beyond) in the room timeline.
  const outgoingStatusByEventId = React.useMemo(() => {
    if (!roomId) return {};
    const client = matrixManager.getClient();
    const room = client?.getRoom(roomId);
    const myUserId = client?.getUserId?.();
    if (!room || !myUserId) return {};

    const roomEvents = room.getLiveTimeline?.()?.getEvents?.() || [];
    const roomIndexByEventId = new Map();
    roomEvents.forEach((evt, idx) => {
      const id = evt.getId?.();
      if (id) roomIndexByEventId.set(id, idx);
    });

    // Determine farthest read index from all other joined members.
    let maxReadIdx = -1;
    const others = room.getJoinedMembers?.().filter((m) => m.userId !== myUserId) || [];
    for (const member of others) {
      const readUpToEventId = room.getEventReadUpTo?.(member.userId, true);
      if (!readUpToEventId) continue;
      const idx = roomIndexByEventId.get(readUpToEventId);
      if (idx != null && idx > maxReadIdx) maxReadIdx = idx;
    }

    const statusMap = {};
    timeline.forEach((item) => {
      if (item.type !== 'message' || !item.isOutgoing) return;
      if (item.status === 'sending' || item.status === 'failed') {
        statusMap[item.eventId] = item.status;
        return;
      }
      const msgIdx = roomIndexByEventId.get(item.eventId);
      const seen = msgIdx != null && maxReadIdx >= 0 && msgIdx <= maxReadIdx;
      statusMap[item.eventId] = seen ? 'seen' : 'delivered';
    });
    return statusMap;
  }, [roomId, timeline, receiptVersion]);

  const handleActionClick = useCallback((actionLabel) => {
    if (actionLabel === 'Poll') {
      setPollModalOpen(true);
    }
  }, []);

  const handleCreatePoll = useCallback(async (pollDraft) => {
    if (!roomId || !pollDraft) return;
    try {
      await createPoll(roomId, pollDraft);
      setPollModalOpen(false);
    } catch (err) {
      console.error('[ChatPanel] createPoll failed:', err);
    }
  }, [createPoll, roomId]);

  // Immediately mark opened conversation as read; keeps unread badge in sync.
  useEffect(() => {
    if (!roomId || membership !== 'join') return;
    matrixManager.markRoomAsRead(roomId);
  }, [roomId, membership, timeline.length]);

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
            <Text style={{ color: '#9ba8b5' }}>
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
          <LockOutlined />
          Messages are end-to-end encrypted. No one outside this conversation can read them.
        </div>
      )}

      {/* ── Message search bar ──────────────────────────────────────────── */}
      {msgSearchOpen && (
        <div className={styles.searchBar}>
          <Input
            autoFocus
            prefix={<SearchOutlined style={{ color: '#9ba8b5' }} />}
            suffix={
              isSearching
                ? <Spin size="small" />
                : <CloseOutlined style={{ color: '#9ba8b5', cursor: 'pointer' }} onClick={onCloseSearch} />
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
              <SearchOutlined style={{ fontSize: 28, marginBottom: 8, color: '#9ba8b5' }} />
              <Text style={{ color: '#9ba8b5' }}>No messages match your search</Text>
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
              <LockOutlined style={{ fontSize: 28, marginBottom: 8, color: '#9ba8b5' }} />
              <Text style={{ color: '#9ba8b5' }}>
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
                  <MessageBubble
                    item={
                      item.isOutgoing
                        ? { ...item, status: outgoingStatusByEventId[item.eventId] || item.status || 'delivered' }
                        : item
                    }
                    showSenderName={showSenderName}
                  />
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

                {item.type === 'poll' && item.poll && (
                  <div className={styles.pollTimelineItem}>
                    <PollCard
                      poll={item.poll}
                      showResults
                      lockAfterSubmit={item.poll.disableAfterSubmit}
                      allowVoteChange={item.poll.allowVoteChange}
                    />
                  </div>
                )}
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
        onActionClick={handleActionClick}
      />

      <Modal
        title="Create Poll"
        open={pollModalOpen}
        onCancel={() => setPollModalOpen(false)}
        footer={null}
        destroyOnHidden
        width={640}
      >
        <PollCreator onCreate={handleCreatePoll} loading={creatingPoll} />
      </Modal>
    </div>
  );
}
