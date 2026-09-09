import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth';
import { useVaultStore } from './stores/vault';
import { useSetupStore } from './stores/setup';
import { ToastContainer } from './components/ui/Toast';
import Login from './pages/Login';
import Register from './pages/Register';
import Vault from './pages/Vault';
import Unlock from './pages/Unlock';
import Setup from './pages/Setup';
import api from './lib/api';

function RequireAuth({ children }) {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-sanctum-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-sanctum-accent/30 border-t-sanctum-accent rounded-full animate-spin" />
          <p className="text-sm text-sanctum-muted">Loading...</p>
        </div>
      </div>
    );
  }

  // Locked state: authenticated user but no symmetric key in memory
  if (user && !isAuthenticated) {
    return <Unlock />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const { status } = useSetupStore();

  // Priority 1: still fetching setup status
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-sanctum-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sanctum-accent/30 border-t-sanctum-accent rounded-full animate-spin" />
      </div>
    );
  }

  // Priority 2: first-run setup not complete — allow /register so step 3 can land there
  if (status === 'needed') {
    return (
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  // Priority 3: normal auth-based routing
  if (!isLoading && isAuthenticated) {
    return (
      <Routes>
        <Route path="/vault" element={<RequireAuth><Vault /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/vault" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/vault" element={<RequireAuth><Vault /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  const { setLoading, lock } = useAuthStore();
  const { clear } = useVaultStore();
  const { setSetup } = useSetupStore();

  // Register Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // Fetch setup status before anything else renders
  useEffect(() => {
    api.get('/api/setup/status')
      .then(res => setSetup(res.data))
      .catch(() => setSetup({ done: true, instanceName: 'Sanctum' })); // fail-open: don't block app on error
  }, [setSetup]);

  // Activity tracking for auto-lock
  useEffect(() => {
    const { resetLockTimer } = useAuthStore.getState();
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const handler = () => resetLockTimer();
    events.forEach((e) => document.addEventListener(e, handler, { passive: true }));
    return () => events.forEach((e) => document.removeEventListener(e, handler));
  }, []);

  // Clear vault when locked
  useEffect(() => {
    const unsub = useAuthStore.subscribe(
      (state) => state.isAuthenticated,
      (isAuth) => { if (!isAuth) clear(); }
    );
    return unsub;
  }, [clear]);

  // Mark loading done on mount
  useEffect(() => {
    setLoading(false);
  }, [setLoading]);

  return (
    <BrowserRouter>
      <AppRoutes />
      <ToastContainer />
    </BrowserRouter>
  );
}
