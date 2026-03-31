import { createSlice } from '@reduxjs/toolkit';

const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    activeRoomId: null,
    messagesByRoom: {},   // { [roomId]: TimelineItem[] }
    loadingByRoom: {},    // { [roomId]: boolean }
    hasMoreByRoom: {},    // { [roomId]: boolean }
    sendingByRoom: {},    // { [roomId]: boolean }
  },
  reducers: {
    setActiveRoom(state, action) {
      state.activeRoomId = action.payload;
    },
    setMessages(state, action) {
      const { roomId, messages } = action.payload;
      state.messagesByRoom[roomId] = messages;
    },
    prependMessages(state, action) {
      // older messages loaded via loadMore
      const { roomId, messages } = action.payload;
      const existing = state.messagesByRoom[roomId] || [];
      state.messagesByRoom[roomId] = [...messages, ...existing];
    },
    appendMessage(state, action) {
      // single new incoming/outgoing message
      const { roomId, message } = action.payload;
      if (!state.messagesByRoom[roomId]) {
        state.messagesByRoom[roomId] = [];
      }
      const existing = state.messagesByRoom[roomId];
      const alreadyExists = existing.some((m) => m.eventId === message.eventId);
      if (!alreadyExists) {
        state.messagesByRoom[roomId] = [...existing, message];
      }
    },
    updateMessage(state, action) {
      // Replace a message by tempId (local echo or eventId for in-place updates).
      const { roomId, tempId, message } = action.payload;
      const msgs = state.messagesByRoom[roomId];
      if (!msgs) return;

      // Race condition guard: Room.timeline may fire before sendMessage resolves,
      // causing the real event to already be in the list while the echo is still
      // there too.  Remove any pre-existing entry that carries the new eventId
      // BEFORE replacing the echo — otherwise we'd end up with two copies.
      const deduped =
        message.eventId && message.eventId !== tempId
          ? msgs.filter((m) => m.eventId !== message.eventId)
          : msgs;

      const idx = deduped.findIndex((m) => m.eventId === tempId);
      if (idx !== -1) {
        deduped[idx] = message;
        state.messagesByRoom[roomId] = deduped;
      }
    },
    setLoading(state, action) {
      const { roomId, loading } = action.payload;
      state.loadingByRoom[roomId] = loading;
    },
    setHasMore(state, action) {
      const { roomId, hasMore } = action.payload;
      state.hasMoreByRoom[roomId] = hasMore;
    },
    setSending(state, action) {
      const { roomId, sending } = action.payload;
      state.sendingByRoom[roomId] = sending;
    },
    clearRoom(state, action) {
      const roomId = action.payload;
      delete state.messagesByRoom[roomId];
      delete state.loadingByRoom[roomId];
      delete state.hasMoreByRoom[roomId];
      delete state.sendingByRoom[roomId];
    },
  },
});

export const {
  setActiveRoom,
  setMessages,
  prependMessages,
  appendMessage,
  updateMessage,
  setLoading,
  setHasMore,
  setSending,
  clearRoom,
} = chatSlice.actions;

export default chatSlice.reducer;

// Selectors
export const selectActiveRoomId = (state) => state.chat.activeRoomId;
export const selectMessages = (roomId) => (state) =>
  state.chat.messagesByRoom[roomId] || [];
export const selectIsLoading = (roomId) => (state) =>
  state.chat.loadingByRoom[roomId] || false;
export const selectHasMore = (roomId) => (state) =>
  state.chat.hasMoreByRoom[roomId] !== false;
export const selectIsSending = (roomId) => (state) =>
  state.chat.sendingByRoom[roomId] || false;
