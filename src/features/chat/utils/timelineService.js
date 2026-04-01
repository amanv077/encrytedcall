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
  const txnId =
    (typeof event.getTxnId === 'function' && event.getTxnId()) ||
    event.getUnsigned?.()?.transaction_id ||
    null;

  const readExtText = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value['org.matrix.msc1767.text'] || value.text || '';
  };

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
      txnId,
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

  // Encrypted event — covers both "pending decryption" and "decryption failed"
  if (type === 'm.room.encrypted') {
    // isDecryptionFailure() is true once the SDK has tried and given up
    const failed = event.isDecryptionFailure?.() ?? false;
    return {
      type: 'message',
      eventId,
      txnId,
      roomId,
      sender,
      senderName,
      body: failed ? '🔒 Unable to decrypt' : '🔒 Decrypting…',
      msgtype: 'm.text',
      timestamp,
      isOutgoing,
      isEncrypted: true,
      status: failed ? 'decrypt_failed' : 'decrypting',
      isDecryptionFailure: failed,
    };
  }

  // ── Poll events ───────────────────────────────────────────────────────────
  if (type === 'm.poll.start') {
    // Accept both direct and nested payloads
    const start = content['m.poll.start'] || content['org.matrix.msc3381.poll.start'] || content;
    const question = readExtText(start.question);
    const answers = Array.isArray(start.answers) ? start.answers : [];
    const maxSelections = Number(start.max_selections || 1);

    const options = answers.map((ans, idx) => ({
      id: ans.id || `opt_${idx + 1}`,
      label: readExtText(ans),
      votes: 0,
    }));

    if (!question || options.length < 2) return null;

    return {
      type: 'poll',
      eventId,
      txnId,
      roomId,
      sender,
      senderName,
      timestamp,
      isOutgoing,
      poll: {
        id: eventId,
        roomId,
        createdBy: sender,
        question,
        options,
        allowMultiple: maxSelections > 1,
        closed: false,
        disableAfterSubmit: false,
        allowVoteChange: true,
        myVotes: [],
      },
    };
  }

  if (type === 'm.poll.end') {
    const endContent = content['m.poll.end'] || content['org.matrix.msc3381.poll.end'] || content;
    const endText = readExtText(endContent) || 'Poll ended';
    return {
      type: 'system',
      eventId,
      roomId,
      sender,
      text: endText,
      timestamp,
    };
  }

  // ── Quiz events ───────────────────────────────────────────────────────────
  if (type === 'com.app.quiz.start') {
    const question = typeof content.question === 'string' ? content.question.trim() : '';
    const answers = Array.isArray(content.options) ? content.options : [];
    const options = answers
      .map((ans, idx) => ({
        id: ans?.id || `opt_${idx + 1}`,
        label: (ans?.text || ans?.label || '').trim(),
        votes: 0,
      }))
      .filter((opt) => opt.label);

    if (!question || options.length < 2) return null;

    return {
      type: 'quiz',
      eventId,
      txnId,
      roomId,
      sender,
      senderName,
      timestamp,
      isOutgoing,
      quiz: {
        id: eventId,
        roomId,
        createdBy: sender,
        question,
        options,
        correctOptionId: content.correct_option_id || null,
      },
    };
  }

  if (type === 'com.app.quiz.answer') {
    // Answer events update existing quiz state; do not render standalone item.
    return null;
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
      txnId,
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
      txnId,
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
      txnId,
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
      txnId,
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
