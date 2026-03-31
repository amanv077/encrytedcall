import { configureStore } from '@reduxjs/toolkit';
import chatReducer from './chatSlice';
import uiReducer from './uiSlice';

const store = configureStore({
  reducer: {
    chat: chatReducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // Matrix SDK objects are not plain and can't be serialized; we only store
      // plain data in Redux so this check should pass, but keep it lenient to
      // avoid noise from any transient SDK references.
      serializableCheck: {
        ignoredActions: ['chat/appendMessage', 'chat/setMessages', 'chat/prependMessages'],
        ignoredPaths: ['chat.messagesByRoom'],
      },
    }),
});

export default store;
