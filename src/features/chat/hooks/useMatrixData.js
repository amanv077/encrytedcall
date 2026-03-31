import { useState, useEffect } from 'react';
import { matrixManager } from '../utils/matrixClient';

/**
 * useMatrixData – provides a live list of rooms and users from the Matrix client.
 *
 * Invitations are surfaced inline in the chat timeline (via InviteItem), so
 * this hook no longer needs to maintain a separate invite bucket.
 */
export function useMatrixData() {
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = matrixManager.getClient();
    if (!client) {
      setLoading(false);
      return;
    }

    const updateData = () => {
      const allRooms = client.getRooms() || [];
      setRooms([...allRooms]);

      // Aggregate unique users from all joined rooms (exclude self)
      const myUserId = client.getUserId();
      const userMap = new Map();
      allRooms.forEach((room) => {
        const members = room.getJoinedMembers();
        members.forEach((member) => {
          if (member.userId !== myUserId && !userMap.has(member.userId)) {
            userMap.set(member.userId, {
              userId: member.userId,
              displayName: member.name || member.userId,
              avatarUrl: member.getAvatarUrl
                ? member.getAvatarUrl(client.getHomeserverUrl(), 40, 40, 'crop')
                : null,
              presence: member.user?.presence || 'unknown',
            });
          }
        });
      });

      setUsers(Array.from(userMap.values()));
      setLoading(false);
    };

    if (matrixManager.isReady) {
      updateData();
    }

    const onSync = (state) => {
      if (state === 'PREPARED' || state === 'SYNCING') {
        updateData();
      }
    };

    client.on('sync', onSync);
    client.on('Room.name', updateData);
    client.on('RoomState.members', updateData);
    client.on('Room.myMembership', updateData);
    client.on('RoomMember.membership', updateData);
    client.on('Room.timeline', updateData);
    client.on('Room', updateData);

    const refreshInterval = setInterval(updateData, 2500);

    return () => {
      client.removeListener('sync', onSync);
      client.removeListener('Room.name', updateData);
      client.removeListener('RoomState.members', updateData);
      client.removeListener('Room.myMembership', updateData);
      client.removeListener('RoomMember.membership', updateData);
      client.removeListener('Room.timeline', updateData);
      client.removeListener('Room', updateData);
      clearInterval(refreshInterval);
    };
  }, []);

  return { rooms, users, loading };
}
