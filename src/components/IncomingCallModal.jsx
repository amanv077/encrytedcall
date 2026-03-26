import React from 'react';
import { Phone, PhoneOff } from 'lucide-react';

export default function IncomingCallModal({ call, onAccept, onReject }) {
  if (!call) return null;

  return (
    <div className="incoming-modal-overlay">
      <div className="incoming-modal">
        <div className="incoming-header">
          <h3>Incoming Call</h3>
          <p>{call.roomId || "Unknown Caller"}</p>
        </div>
        <div className="incoming-actions">
          <button onClick={onReject} className="btn-reject" aria-label="Reject Call">
            <PhoneOff size={24} />
          </button>
          <button onClick={onAccept} className="btn-accept" aria-label="Accept Call">
            <Phone size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}
