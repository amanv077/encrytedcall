import { createSlice } from '@reduxjs/toolkit';

/**
 * callMode:
 *  'hidden'     – no active call
 *  'pip'        – call is active, shown as picture-in-picture overlay in chat area
 *  'fullscreen' – call is expanded to fill the content area
 */
const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    callMode: 'hidden',
    userSearchOpen: false,
  },
  reducers: {
    setCallMode(state, action) {
      state.callMode = action.payload;
    },
    openUserSearch(state) {
      state.userSearchOpen = true;
    },
    closeUserSearch(state) {
      state.userSearchOpen = false;
    },
  },
});

export const { setCallMode, openUserSearch, closeUserSearch } = uiSlice.actions;

export default uiSlice.reducer;

// Selectors
export const selectCallMode = (state) => state.ui.callMode;
export const selectUserSearchOpen = (state) => state.ui.userSearchOpen;
