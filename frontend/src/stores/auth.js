import { create } from 'zustand';
import api from '../lib/api';

const AUTO_LOCK_KEY = 'sanctum_autolock_minutes';
const DEFAULT_AUTO_LOCK = 15;

export const useAuthStore = create((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,
  symmetricKey: null,

  // Auto-lock
  autoLockMinutes: parseInt(localStorage.getItem(AUTO_LOCK_KEY) || String(DEFAULT_AUTO_LOCK)),
  lockTimer: null,

  setTokens: ({ accessToken, refreshToken }) => {
    set({ accessToken, refreshToken });
    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    // Store refresh token in sessionStorage (cleared when tab closes)
    sessionStorage.setItem('sanctum_refresh', refreshToken);
  },

  login: ({ user, accessToken, refreshToken, symmetricKey }) => {
    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    sessionStorage.setItem('sanctum_refresh', refreshToken);

    const { autoLockMinutes } = get();
    const lockTimer = get()._startLockTimer(autoLockMinutes);

    set({
      user,
      accessToken,
      refreshToken,
      symmetricKey,
      isAuthenticated: true,
      isLoading: false,
      lockTimer,
    });
  },

  lock: () => {
    const { lockTimer } = get();
    if (lockTimer) clearTimeout(lockTimer);

    // Clear sensitive in-memory data
    set({
      symmetricKey: null,
      accessToken: null,
      isAuthenticated: false,
      lockTimer: null,
    });

    api.defaults.headers.common['Authorization'] = '';
  },

  logout: async () => {
    const { refreshToken, lockTimer } = get();
    if (lockTimer) clearTimeout(lockTimer);

    try {
      if (refreshToken) {
        await api.post('/api/auth/logout', { refreshToken });
      }
    } catch {}

    sessionStorage.removeItem('sanctum_refresh');
    api.defaults.headers.common['Authorization'] = '';

    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      symmetricKey: null,
      isAuthenticated: false,
      isLoading: false,
      lockTimer: null,
    });
  },

  setAutoLock: (minutes) => {
    localStorage.setItem(AUTO_LOCK_KEY, String(minutes));
    const { lockTimer, _startLockTimer, isAuthenticated } = get();
    if (lockTimer) clearTimeout(lockTimer);
    const newTimer = isAuthenticated ? _startLockTimer(minutes) : null;
    set({ autoLockMinutes: minutes, lockTimer: newTimer });
  },

  resetLockTimer: () => {
    const { lockTimer, autoLockMinutes, isAuthenticated, _startLockTimer } = get();
    if (!isAuthenticated) return;
    if (lockTimer) clearTimeout(lockTimer);
    set({ lockTimer: _startLockTimer(autoLockMinutes) });
  },

  _startLockTimer: (minutes) => {
    if (minutes === 0) return null; // 0 = never
    return setTimeout(() => {
      get().lock();
    }, minutes * 60 * 1000);
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
