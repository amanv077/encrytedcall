import React, { useState } from 'react';
import { Modal, Input, List, Avatar, Spin, Typography, Empty } from 'antd';
import { SearchOutlined, UserOutlined } from '@ant-design/icons';
import { useDispatch } from 'react-redux';
import { setActiveRoom } from '../../../../store/chatSlice';
import { closeUserSearch } from '../../../../store/uiSlice';
import { useSearch } from '../../hooks/useSearch';
import { roomService } from '../../utils/roomService';
import styles from './UserSearch.module.scss';

const { Text } = Typography;

/**
 * UserSearch – modal that lets the user search for contacts on the homeserver
 * and open (or create) a DM conversation with them.
 */
export default function UserSearch({ open }) {
  const dispatch = useDispatch();
  const { results, isSearching, search, clearResults } = useSearch();
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [openingRoom, setOpeningRoom] = useState(false);
  const [notice, setNotice] = useState('');

  const handleClose = () => {
    clearResults();
    setNotice('');
    setSelectedUserId(null);
    dispatch(closeUserSearch());
  };

  const handleSearch = (e) => {
    setNotice('');
    search(e.target.value);
  };

  const handleSelectUser = async (userId) => {
    setSelectedUserId(userId);
    setOpeningRoom(true);
    setNotice('');

    try {
      const roomId = await roomService.findOrCreateDMRoom(userId);
      dispatch(setActiveRoom(roomId));
      handleClose();
    } catch (err) {
      // findOrCreateDMRoom throws when an invite was just sent
      setNotice(err.message || 'An error occurred.');
    } finally {
      setOpeningRoom(false);
      setSelectedUserId(null);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      title="Find a contact"
      centered
      styles={{
        content: { background: '#202c33', borderRadius: 12 },
        header: { background: '#202c33', borderBottom: '1px solid #2a3942' },
        body: { padding: '12px 0 0' },
      }}
      className={styles.modal}
    >
      <div className={styles.searchRow}>
        <Input
          autoFocus
          prefix={<SearchOutlined style={{ color: '#8696a0' }} />}
          placeholder="Search by name or @user:server"
          onChange={handleSearch}
          className={styles.searchInput}
          style={{ background: '#2a3942', border: 'none', color: '#e9edef' }}
          suffix={isSearching ? <Spin size="small" /> : null}
        />
      </div>

      {notice && (
        <div className={styles.notice}>{notice}</div>
      )}

      <div className={styles.resultList}>
        {results.length === 0 && !isSearching && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Text style={{ color: '#8696a0', fontSize: 13 }}>
                Start typing to search users on your homeserver
              </Text>
            }
            style={{ padding: '24px 0' }}
          />
        )}

        <List
          dataSource={results}
          renderItem={(user) => (
            <List.Item
              className={styles.resultItem}
              onClick={() => handleSelectUser(user.userId)}
            >
              <List.Item.Meta
                avatar={
                  <Avatar
                    src={user.avatarUrl}
                    icon={!user.avatarUrl && <UserOutlined />}
                    style={{ background: '#00a884' }}
                    size={40}
                  />
                }
                title={
                  <span style={{ color: '#e9edef', fontSize: 15 }}>
                    {user.displayName}
                  </span>
                }
                description={
                  <span style={{ color: '#8696a0', fontSize: 12 }}>
                    {user.userId}
                  </span>
                }
              />
              {openingRoom && selectedUserId === user.userId && (
                <Spin size="small" />
              )}
            </List.Item>
          )}
        />
      </div>
    </Modal>
  );
}
