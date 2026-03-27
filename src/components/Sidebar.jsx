import React, { useState } from 'react';
import { useMatrixData } from '../hooks/useMatrixData';
import { Users, Hash, Search, User as UserIcon, MessageSquare } from 'lucide-react';

export default function Sidebar({ onSelectTarget }) {
  const { rooms, users, loading } = useMatrixData();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'rooms'

  const filteredUsers = (users || []).filter(user =>
    user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.userId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredRooms = (rooms || []).filter(room =>
    room.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    room.roomId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          <span>Users</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'rooms' ? 'active' : ''}`}
          onClick={() => setActiveTab('rooms')}
        >
          <Hash size={18} />
          <span>Rooms</span>
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
            ) : (
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
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
