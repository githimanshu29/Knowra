// Central Redux Toolkit store configuration
import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import authReducer from './slices/authSlice.js';
import chatReducer from './slices/chatSlice.js';
import documentReducer from './slices/documentSlice.js';
import uiReducer from './slices/uiSlice.js';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    chat: chatReducer,
    document: documentReducer,
    ui: uiReducer,
  },
});

// Inferred TypeScript types for dispatch and selector
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed dispatch and selector hooks
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
