import React, { useState } from 'react';
import { Modal, Input, List, Avatar, Spin, Typography, Empty, Button } from 'antd';
import { SearchOutlined, UserOutlined, CloseOutlined } from '@ant-design/icons';
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
  const [query, setQuery] = useState('');

  const handleClose = () => {
    clearResults();
    setNotice('');
    setSelectedUserId(null);
    setQuery('');
    dispatch(closeUserSearch());
  };

  const handleSearch = (e) => {
    setNotice('');
    const q = e.target.value;
    setQuery(q);
    search(q);
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
      centered
      styles={{
        content: { background: '#ffffff', borderRadius: 12, border: '1px solid #e4e8ec' },
        header: { background: '#ffffff', borderBottom: '1px solid #e4e8ec' },
        body: { padding: 0 },
      }}
      className={styles.modal}
      title={
        <div className={styles.header}>
          <div>
            <div className={styles.title}>New conversation</div>
            <div className={styles.subtitle}>Search by name or `@user:server`</div>
          </div>
          <Button
            type="text"
            icon={<CloseOutlined />}
            className={styles.closeBtn}
            onClick={handleClose}
          />
        </div>
      }
    >
      <div className={styles.body}>
        <div className={styles.searchRow}>
          <Input
            autoFocus
            prefix={<SearchOutlined style={{ color: '#9ba8b5' }} />}
            placeholder="Search users…"
            onChange={handleSearch}
            value={query}
            className={styles.searchInput}
            suffix={isSearching ? <Spin size="small" /> : null}
            bordered={false}
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
                <Text style={{ color: '#9ba8b5', fontSize: 13 }}>
                  Start typing to search users on your homeserver
                </Text>
              }
              style={{ padding: '18px 0 22px' }}
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
                      className={styles.resultAvatar}
                      size={40}
                    />
                  }
                  title={
                    <span className={styles.resultTitle}>
                      {user.displayName}
                    </span>
                  }
                  description={
                    <span className={styles.resultSub}>
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
      </div>
    </Modal>
  );
}
