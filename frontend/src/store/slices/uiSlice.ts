// Redux Toolkit slice for global UI modals, active views and drawers
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type NavigationTab = 'intelligence' | 'vault' | 'security' | 'telemetry';

// State interface for global UI state
export interface UiState {
  activeView: NavigationTab;
  isAuthModalOpen: boolean;
  authModalTab: 'login' | 'register';
  isPermissionsModalOpen: boolean;
  permissionDocId: string | null;
  permissionDocTitle: string | null;
}

const initialState: UiState = {
  activeView: 'intelligence',
  isAuthModalOpen: false,
  authModalTab: 'login',
  isPermissionsModalOpen: false,
  permissionDocId: null,
  permissionDocTitle: null,
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setActiveView: (state, action: PayloadAction<NavigationTab>) => {
      state.activeView = action.payload;
    },
    openAuthModal: (state, action: PayloadAction<'login' | 'register' | undefined>) => {
      state.isAuthModalOpen = true;
      if (action.payload) {
        state.authModalTab = action.payload;
      }
    },
    closeAuthModal: (state) => {
      state.isAuthModalOpen = false;
    },
    setAuthModalTab: (state, action: PayloadAction<'login' | 'register'>) => {
      state.authModalTab = action.payload;
    },
    openPermissionsModal: (state, action: PayloadAction<{ docId: string; title: string }>) => {
      state.isPermissionsModalOpen = true;
      state.permissionDocId = action.payload.docId;
      state.permissionDocTitle = action.payload.title;
    },
    closePermissionsModal: (state) => {
      state.isPermissionsModalOpen = false;
      state.permissionDocId = null;
      state.permissionDocTitle = null;
    },
  },
});

export const {
  setActiveView,
  openAuthModal,
  closeAuthModal,
  setAuthModalTab,
  openPermissionsModal,
  closePermissionsModal,
} = uiSlice.actions;

export default uiSlice.reducer;
