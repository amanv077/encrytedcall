/**
 * Normalises raw Matrix SDK events into plain `TimelineItem` objects that the
 * UI can consume without depending on the SDK event structure.
 *
 * TimelineItem shapes
 * -------------------
 * type: 'message'
 *   { eventId, roomId, sender, senderName, body, msgtype, timestamp,
 *     isOutgoing, isEncrypted, status }
 *
 * type: 'call'
 *   { eventId, roomId, sender, senderName, callType, outcome, timestamp,
 *     isOutgoing, callId }
 *   outcome: 'started' | 'answered' | 'missed' | 'ended' | 'rejected'
 *   callType: 'voice' | 'video'
 *
 * type: 'invite'
 *   { eventId, roomId, targetUserId, targetName, invitedBy, timestamp }
 *
 * type: 'system'
 *   { eventId, roomId, sender, text, timestamp }
 */

/**
 * @param {import('matrix-js-sdk').MatrixEvent} event
 * @param {string} myUserId
 * @returns {TimelineItem|null}
 */
export function normalizeMatrixEvent(event, myUserId) {
  if (!event) return null;

  const eventId = event.getId();
  const roomId = event.getRoomId();
  const sender = event.getSender();
  const senderName =
    event.sender?.name ||
    event.sender?.rawDisplayName ||
    sender ||
    'Unknown';
  const timestamp = event.getTs() || Date.now();
  const isOutgoing = sender === myUserId;
  const type = event.getType();
  const content = event.getContent() || {};

  // ── Text messages ─────────────────────────────────────────────────────────
  if (type === 'm.room.message') {
    const msgtype = content.msgtype || 'm.text';
    let body = content.body || '';

    // Render location as text for now
    if (msgtype === 'm.image') body = '[Image]';
    else if (msgtype === 'm.file') body = `[File: ${content.body}]`;
    else if (msgtype === 'm.audio') body = '[Audio message]';
    else if (msgtype === 'm.video') body = '[Video]';

    return {
      type: 'message',
      eventId,
      roomId,
      sender,
      senderName,
      body,
      msgtype,
      timestamp,
      isOutgoing,
      isEncrypted: event.isEncrypted?.() ?? false,
      status: 'delivered',
    };
  }

  // Encrypted event that has not yet been decrypted
  if (type === 'm.room.encrypted') {
    return {
      type: 'message',
      eventId,
      roomId,
      sender,
      senderName,
      body: '🔒 Encrypted message (decrypting…)',
      msgtype: 'm.text',
      timestamp,
      isOutgoing,
      isEncrypted: true,
      status: 'decrypting',
    };
  }

  // ── Call events ───────────────────────────────────────────────────────────
  if (type === 'm.call.invite') {
    const offerType = content?.offer?.type;
    const hasVideo =
      offerType === 'video' ||
      (content?.offer?.sdp || '').includes('m=video');
    return {
      type: 'call',
      eventId,
      roomId,
      sender,
      senderName,
      callType: hasVideo ? 'video' : 'voice',
      outcome: 'started',
      timestamp,
      isOutgoing,
      callId: content.call_id || null,
    };
  }

  if (type === 'm.call.answer') {
    return {
      type: 'call',
      eventId,
      roomId,
      sender,
      senderName,
      callType: 'unknown',
      outcome: 'answered',
      timestamp,
      isOutgoing,
      callId: content.call_id || null,
    };
  }

  if (type === 'm.call.hangup') {
    const reason = content.reason;
    const outcome =
      reason === 'user_hangup' ? 'ended'
      : reason === 'invite_timeout' ? 'missed'
      : reason === 'user_busy' ? 'missed'
      : 'ended';
    return {
      type: 'call',
      eventId,
      roomId,
      sender,
      senderName,
      callType: 'unknown',
      outcome,
      timestamp,
      isOutgoing,
      callId: content.call_id || null,
    };
  }

  if (type === 'm.call.reject') {
    return {
      type: 'call',
      eventId,
      roomId,
      sender,
      senderName,
      callType: 'unknown',
      outcome: 'rejected',
      timestamp,
      isOutgoing,
      callId: content.call_id || null,
    };
  }

  // ── Room membership / invite ──────────────────────────────────────────────
  if (type === 'm.room.member') {
    const membership = content.membership;
    const targetUserId = event.getStateKey();

    if (membership === 'invite' && targetUserId === myUserId) {
      // Someone invited the local user into this room
      return {
        type: 'invite',
        eventId,
        roomId,
        targetUserId,
        targetName: content.displayname || targetUserId,
        invitedBy: sender,
        invitedByName: senderName,
        timestamp,
      };
    }

    if (membership === 'join' || membership === 'leave') {
      const verb =
        membership === 'join'
          ? `${senderName} joined`
          : `${senderName} left`;
      return {
        type: 'system',
        eventId,
        roomId,
        sender,
        text: verb,
        timestamp,
      };
    }

    return null;
  }

  // ── Room creation ─────────────────────────────────────────────────────────
  if (type === 'm.room.create') {
    return {
      type: 'system',
      eventId,
      roomId,
      sender,
      text: `${senderName} created this conversation`,
      timestamp,
    };
  }

  // ── Encryption enabled event ──────────────────────────────────────────────
  if (type === 'm.room.encryption') {
    return {
      type: 'system',
      eventId,
      roomId,
      sender,
      text: 'End-to-end encryption is enabled',
      timestamp,
    };
  }

  return null;
}

/**
 * Derive a human-readable call summary line for CallHistoryItem.
 *
 * @param {object} callItem – TimelineItem with type:'call'
 * @returns {string}
 */
export function formatCallSummary(callItem) {
  const { callType, outcome, isOutgoing, senderName } = callItem;
  const medium = callType === 'video' ? 'Video' : 'Voice';

  if (outcome === 'started' && isOutgoing) return `${medium} call`;
  if (outcome === 'started') return `Incoming ${medium.toLowerCase()} call`;
  if (outcome === 'answered') return `${medium} call`;
  if (outcome === 'ended') return `${medium} call ended`;
  if (outcome === 'missed' && isOutgoing) return `Missed ${medium.toLowerCase()} call`;
  if (outcome === 'missed') return `${senderName} missed call`;
  if (outcome === 'rejected') return `${medium} call declined`;
  return `${medium} call`;
}
