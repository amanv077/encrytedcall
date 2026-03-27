import React, { useEffect, useRef, useState } from 'react';
import { useMatrixData } from '../hooks/useMatrixData';
import { matrixManager } from '../services/matrixClient';
import { Users, Hash, Search, User as UserIcon, MessageSquare, Mail, Check, X } from 'lucide-react';

export default function Sidebar({ onSelectTarget }) {
  const { rooms, users, loading } = useMatrixData();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'rooms' | 'invites'
  const [inviteActionLoading, setInviteActionLoading] = useState({});
  const previousInviteCountRef = useRef(0);
  const client = matrixManager.getClient();
  const myUserId = client?.getUserId();

  const getRoomMembership = (room) => {
    if (!room) return null;

    const membershipFromMethod = room.getMyMembership?.();
    if (membershipFromMethod) return membershipFromMethod;

    if (myUserId) {
      const myMember = room.getMember?.(myUserId);
      if (myMember?.membership) return myMember.membership;

      const stateMembership = room.currentState
        ?.getStateEvents?.('m.room.member', myUserId)
        ?.getContent?.()
        ?.membership;
      if (stateMembership) return stateMembership;
    }

    return null;
  };

  const inviteRooms = (rooms || []).filter((room) => getRoomMembership(room) === 'invite');

  useEffect(() => {
    const previousCount = previousInviteCountRef.current;
    const currentCount = inviteRooms.length;
    const hasNewInvite = currentCount > previousCount;

    if (hasNewInvite && activeTab !== 'invites') {
      setActiveTab('invites');
    }

    previousInviteCountRef.current = currentCount;
  }, [inviteRooms.length, activeTab]);

  const filteredUsers = (users || []).filter(user =>
    user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.userId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredRooms = (rooms || []).filter(room =>
    room.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    room.roomId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getInviteSender = (room) => {
    const myMember = myUserId ? room.getMember?.(myUserId) : null;
    const inviterId = myMember?.events?.member?.getSender?.();
    if (inviterId && inviterId !== myUserId) {
      const inviterMember = room.getMember?.(inviterId);
      return inviterMember?.name || inviterMember?.userId || inviterId;
    }

    const inviteMembers = room.getMembersWithMembership
      ? room.getMembersWithMembership('invite')
      : [];
    const inviteSender = inviteMembers.find((m) => m.userId !== myUserId) || inviteMembers[0];
    if (inviteSender) {
      return inviteSender.name || inviteSender.userId || "Unknown sender";
    }

    const joinedMembers = room.getMembersWithMembership
      ? room.getMembersWithMembership('join')
      : [];
    const sender = joinedMembers.find((m) => m.userId !== myUserId) || joinedMembers[0];
    return sender?.name || sender?.userId || "Unknown sender";
  };

  const filteredInvites = inviteRooms.filter(room => {
    const sender = getInviteSender(room);
    return (
      room.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.roomId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sender.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const handleInviteAction = async (roomId, action) => {
    const client = matrixManager.getClient();
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

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h3>Communication Hub</h3>
        <div className="search-wrapper">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search users or rooms..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="sidebar-tabs">
        <button
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={18} />
          <span className="tab-label">Users</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'rooms' ? 'active' : ''}`}
          onClick={() => setActiveTab('rooms')}
        >
          <Hash size={18} />
          <span className="tab-label">Rooms</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'invites' ? 'active' : ''}`}
          onClick={() => setActiveTab('invites')}
        >
          <Mail size={18} />
          <span className="tab-label">Invites</span>
          {inviteRooms.length > 0 && (
            <span className="tab-badge">{inviteRooms.length}</span>
          )}
        </button>
      </div>

      <div className="sidebar-content">
        {loading ? (
          <div className="sidebar-status">
             <div className="sidebar-loader-spinner"></div>
             <span>Syncing Matrix...</span>
          </div>
        ) : (
          <div className="item-list">
            {activeTab === 'users' ? (
              filteredUsers.length > 0 ? (
                filteredUsers.map(user => (
                  <button
                    key={user.userId}
                    className="sidebar-item"
                    onClick={() => onSelectTarget(user.userId)}
                    title={`Call ${user.displayName}`}
                  >
                    <div className="item-avatar">
                      {user.avatarUrl ? (
                         <img src={user.avatarUrl} alt="" />
                      ) : (
                         <div className="avatar-placeholder">
                           <UserIcon size={18} />
                         </div>
                      )}
                      <span className={`presence-dot ${user.presence}`}></span>
                    </div>
                    <div className="item-details">
                      <span className="item-primary-text">{user.displayName}</span>
                      <span className="item-secondary-text">{user.userId}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="empty-state">No users available</div>
              )
            ) : activeTab === 'rooms' ? (
              filteredRooms.length > 0 ? (
                filteredRooms.map(room => (
                  <button
                    key={room.roomId}
                    className="sidebar-item"
                    onClick={() => onSelectTarget(room.roomId)}
                    title={`Join room ${room.name}`}
                  >
                    <div className="item-avatar room">
                       <MessageSquare size={18} />
                    </div>
                    <div className="item-details">
                      <span className="item-primary-text">{room.name || 'Unnamed Room'}</span>
                      <span className="item-secondary-text">{room.roomId}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="empty-state">No rooms found</div>
              )
            ) : (
              filteredInvites.length > 0 ? (
                filteredInvites.map(room => (
                  <div key={room.roomId} className="invite-card">
                    <div className="invite-card-header">
                      <div className="item-avatar room">
                        <Mail size={18} />
                      </div>
                      <div className="item-details">
                        <span className="item-primary-text">{room.name || 'Direct Message Invite'}</span>
                        <span className="item-secondary-text">{getInviteSender(room)}</span>
                      </div>
                    </div>
                    <div className="invite-actions">
                      <button
                        className="invite-action-btn accept"
                        onClick={() => handleInviteAction(room.roomId, 'accept')}
                        disabled={Boolean(inviteActionLoading[room.roomId])}
                        title="Accept Invite"
                      >
                        <Check size={16} />
                        <span>Accept</span>
                      </button>
                      <button
                        className="invite-action-btn decline"
                        onClick={() => handleInviteAction(room.roomId, 'decline')}
                        disabled={Boolean(inviteActionLoading[room.roomId])}
                        title="Decline Invite"
                      >
                        <X size={16} />
                        <span>Decline</span>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">No pending invites</div>
              )
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
