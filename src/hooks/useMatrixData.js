import { useState, useEffect } from 'react';
import { matrixManager } from '../services/matrixClient';

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
      
      // Filter out rooms that the user is not joined to, if necessary
      // and sort them by last updated if possible, but for now just all rooms.
      setRooms([...allRooms]);

      // Aggregate unique users from all joined rooms
      const userMap = new Map();
      allRooms.forEach(room => {
        const members = room.getJoinedMembers();
        members.forEach(member => {
          // Don't include ourselves in the specialized user list
          if (member.userId !== client.getUserId()) {
            // Only add if not already present or if we want to prefer a more specific version
            if (!userMap.has(member.userId)) {
              userMap.set(member.userId, {
                userId: member.userId,
                displayName: member.name || member.userId,
                avatarUrl: member.getAvatarUrl ? member.getAvatarUrl(client.getHomeserverUrl(), 40, 40, 'crop') : null,
                presence: member.user?.presence || 'unknown',
              });
            }
          }
        });
      });
      
      setUsers(Array.from(userMap.values()));
      setLoading(false);
    };

    // Initial load if already ready
    if (matrixManager.isReady) {
      updateData();
    }

    const onSync = (state) => {
      if (state === 'PREPARED' || state === 'SYNCING') {
        updateData();
      }
    };

    // Matrix events to listen for data changes
    client.on('sync', onSync);
    client.on('Room.name', updateData);
    client.on('RoomState.members', updateData);
    client.on('Room', updateData);

    return () => {
      client.removeListener('sync', onSync);
      client.removeListener('Room.name', updateData);
      client.removeListener('RoomState.members', updateData);
      client.removeListener('Room', updateData);
    };
  }, []);

  return { rooms, users, loading };
}
