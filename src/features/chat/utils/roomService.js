import { matrixManager } from './matrixClient';

/**
 * Centralised room management.
 *
 * Responsibilities:
 *  - Find an existing DM room for a given target user
 *  - Create a new DM room when none exists
 *  - Search users via the Matrix homeserver user-directory API
 */
class RoomService {
  /**
   * Find an existing DM room shared with `targetUserId`, or create a new one.
   *
   * Resolution priority (highest first):
   *   1. Rooms listed in m.direct account data that the local user has joined
   *   2. Any joined room that has the target as a member
   *   3. Unknown/unmapped rooms where the target appears in m.direct
   *   4. Rooms where the target has a pending invite (re-invite if stale)
   *
   * Throws when an invite was just sent (caller must wait for the target to accept).
   *
   * @param {string} targetUserId – Matrix user ID, e.g. @alice:example.org
   * @returns {Promise<string>} resolved room ID
   */
  async findOrCreateDMRoom(targetUserId) {
    const client = matrixManager.getClient();
    if (!client) throw new Error('Matrix client not initialized.');

    // --- 1. Gather m.direct-mapped room IDs for this target ----------------
    let directRoomIds = [];
    const mDirect = client.getAccountData?.('m.direct');
    if (mDirect?.getContent) {
      const content = mDirect.getContent() || {};
      directRoomIds = Array.isArray(content[targetUserId])
        ? content[targetUserId]
        : [];
    }

    // --- 2. Build candidate list from all rooms the local user has joined ---
    const rooms = client.getRooms();

    const candidateRooms = rooms
      .filter((room) => {
        if (room.getMyMembership && room.getMyMembership() !== 'join') return false;
        const targetMember = room.getMember(targetUserId);
        if (targetMember) return true;
        if (directRoomIds.includes(room.roomId)) return true;
        return false;
      })
      .map((room) => {
        const targetMember = room.getMember(targetUserId);
        const membership =
          targetMember?.membership ||
          (directRoomIds.includes(room.roomId) ? 'unknown' : 'leave');
        return { room, membership };
      });

    // --- 3. Sort each bucket by recency ------------------------------------
    const byRecency = (a, b) => {
      const aTs = a.room.getLastActiveTimestamp?.() ?? 0;
      const bTs = b.room.getLastActiveTimestamp?.() ?? 0;
      return bTs - aTs;
    };

    const bucket = (mem) => candidateRooms.filter((c) => c.membership === mem).sort(byRecency);
    const directFilter = (arr) => arr.filter((c) => directRoomIds.includes(c.room.roomId));
    const nonDirectFilter = (arr) => arr.filter((c) => !directRoomIds.includes(c.room.roomId));

    const joined = bucket('join');
    const unknown = bucket('unknown');
    const invited = bucket('invite');
    const other = candidateRooms
      .filter((c) => !['join', 'unknown', 'invite'].includes(c.membership))
      .sort(byRecency);

    const selected =
      directFilter(joined)[0] ||
      nonDirectFilter(joined)[0] ||
      directFilter(unknown)[0] ||
      nonDirectFilter(unknown)[0] ||
      directFilter(invited)[0] ||
      nonDirectFilter(invited)[0] ||
      other[0] ||
      null;

    if (selected) {
      const { room, membership } = selected;
      if (membership === 'join' || membership === 'unknown') {
        return room.roomId;
      }
      // membership is 'invite' or stale — ensure a fresh invite exists
      if (membership !== 'invite') {
        try {
          await client.invite(room.roomId, targetUserId);
        } catch (err) {
          console.warn('Re-invite failed:', err);
        }
      }
      throw new Error('Invite sent. Ask the user to accept the room invite before messaging.');
    }

    // --- 4. No room found — create a new DM room --------------------------
    const createRes = await client.createRoom({
      invite: [targetUserId],
      is_direct: true,
      preset: 'trusted_private_chat',
      visibility: 'private',
    });

    // Record in m.direct account data
    try {
      const currentContent = mDirect?.getContent?.() || {};
      const existingIds = Array.isArray(currentContent[targetUserId])
        ? currentContent[targetUserId]
        : [];
      await client.setAccountData('m.direct', {
        ...currentContent,
        [targetUserId]: [...existingIds, createRes.room_id],
      });
    } catch (err) {
      console.warn('Failed to update m.direct account data:', err);
    }

    throw new Error('Invite sent. Ask the user to accept the room invite before messaging.');
  }

  /**
   * Search users via the homeserver user-directory.
   *
   * @param {string} term – partial display name or user ID
   * @param {number} [limit=20]
   * @returns {Promise<Array<{ userId: string, displayName: string, avatarUrl: string|null }>>}
   */
  async searchUsers(term, limit = 20) {
    const client = matrixManager.getClient();
    if (!client) return [];
    if (!term || term.trim().length < 2) return [];

    try {
      const res = await client.searchUserDirectory({ term: term.trim(), limit });
      return (res.results || []).map((u) => ({
        userId: u.user_id,
        displayName: u.display_name || u.user_id,
        avatarUrl: u.avatar_url
          ? client.mxcUrlToHttp(u.avatar_url, 40, 40, 'crop')
          : null,
      }));
    } catch (err) {
      console.error('User directory search failed:', err);
      return [];
    }
  }

  /**
   * Utility: return the display name for a known room.
   */
  getRoomName(roomId) {
    const client = matrixManager.getClient();
    if (!client) return roomId;
    const room = client.getRoom(roomId);
    return room?.name || roomId;
  }

  /**
   * Utility: check whether a room has E2EE enabled.
   */
  isRoomEncrypted(roomId) {
    const client = matrixManager.getClient();
    if (!client) return false;
    return client.isRoomEncrypted(roomId);
  }
}

export const roomService = new RoomService();
