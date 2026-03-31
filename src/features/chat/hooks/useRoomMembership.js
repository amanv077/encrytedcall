import { useState, useEffect } from 'react';
import { matrixManager } from '../utils/matrixClient';

/**
 * useRoomMembership – reactively tracks the local user's membership in a room.
 *
 * Returns one of: 'join' | 'invite' | 'leave' | 'ban' | null
 *
 * matrix-js-sdk emits 'Room.myMembership' as:
 *   client.emit('Room.myMembership', room, membership, prevMembership)
 *
 * The first argument is the Room object, NOT a generic event object.
 */
export function useRoomMembership(roomId) {
  const [membership, setMembership] = useState(() => {
    if (!roomId) return null;
    const client = matrixManager.getClient();
    return client?.getRoom(roomId)?.getMyMembership?.() || null;
  });

  useEffect(() => {
    if (!roomId) {
      setMembership(null);
      return;
    }

    const client = matrixManager.getClient();
    if (!client) return;

    // Read the current membership immediately whenever roomId changes
    setMembership(client.getRoom(roomId)?.getMyMembership?.() || null);

    /**
     * SDK signature: (room: Room, membership: string, prevMembership: string)
     * NOT (event, room) — first arg IS the room.
     */
    const onMembership = (room, newMembership) => {
      if (room.roomId === roomId) {
        setMembership(newMembership || room.getMyMembership?.() || null);
      }
    };

    client.on('Room.myMembership', onMembership);
    return () => client.removeListener('Room.myMembership', onMembership);
  }, [roomId]);

  return membership;
}
