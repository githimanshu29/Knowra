// Redux Toolkit slice for authentication and multi-tenant context
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { UserProfile } from '../../services/api.js';

// State interface for authentication
export interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  tenantSlug: string;
}

// Initial state restoring credentials from localStorage
const storedToken = localStorage.getItem('knowra_token');
const storedUser = localStorage.getItem('knowra_user');
const storedSlug = localStorage.getItem('knowra_slug') || 'default-tenant';

const initialState: AuthState = {
  token: storedToken,
  user: storedUser ? JSON.parse(storedUser) : null,
  isAuthenticated: Boolean(storedToken),
  tenantSlug: storedSlug,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{ token: string; user: UserProfile; tenantSlug: string }>
    ) => {
      state.token = action.payload.token;
      state.user = action.payload.user;
      state.tenantSlug = action.payload.tenantSlug;
      state.isAuthenticated = true;

      localStorage.setItem('knowra_token', action.payload.token);
      localStorage.setItem('knowra_user', JSON.stringify(action.payload.user));
      localStorage.setItem('knowra_slug', action.payload.tenantSlug);
    },
    logout: (state) => {
      state.token = null;
      state.user = null;
      state.isAuthenticated = false;

      localStorage.removeItem('knowra_token');
      localStorage.removeItem('knowra_user');
    },
    setTenantSlug: (state, action: PayloadAction<string>) => {
      state.tenantSlug = action.payload;
      localStorage.setItem('knowra_slug', action.payload);
    },
  },
});

export const { setCredentials, logout, setTenantSlug } = authSlice.actions;
export default authSlice.reducer;
