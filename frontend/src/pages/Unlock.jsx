import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, AlertTriangle } from 'lucide-react';
import { prepareLogin } from '../crypto/vault';
import { useAuthStore } from '../stores/auth';
import { useVaultStore } from '../stores/vault';
import api from '../lib/api';

/**
 * Unlock screen shown when vault is locked but user session is still active.
 * Re-derives keys without a new network login.
 */
export default function Unlock() {
  const { user, refreshToken, login } = useAuthStore();
  const { loadVault } = useVaultStore();
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (!password) return;
    setStatus('loading');
    setError('');

    try {
      // Get fresh KDF params + protectedSymmetricKey
      const preRes = await api.post('/api/auth/prelogin', { email: user.email });
      const { kdfParams, protectedSymmetricKey } = preRes.data;

      const { authKeyHex, symmetricKey } = await prepareLogin(
        password,
        user.email,
        kdfParams,
        protectedSymmetricKey
      );

      // Re-authenticate to get fresh tokens
      const res = await api.post('/api/auth/login', {
        email: user.email,
        masterPasswordHash: authKeyHex,
      });

      login({
        user: res.data.user,
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
        symmetricKey,
      });

      await loadVault(res.data.vault);
    } catch (err) {
      setStatus('error');
      if (err.response?.status === 401) {
        setError('Incorrect master password.');
      } else {
        setError('Failed to unlock. Check your connection.');
      }
    }
  };

  const isLoading = status === 'loading';

  return (
    <div className="min-h-screen bg-sanctum-bg flex flex-col items-center justify-center p-4">
      <div className="absolute inset-0 bg-sanctum-glow pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm relative"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-sanctum-accent/15 border border-sanctum-accent/25 flex items-center justify-center mb-4">
            <img src="/logo.png" alt="Sanctum" className="w-8 h-8 object-contain" style={{filter: 'invert(56%) sepia(74%) saturate(600%) hue-rotate(210deg) brightness(105%)'}} />
          </div>
          <h1 className="text-xl font-bold text-sanctum-text">Vault Locked</h1>
          <p className="text-sm text-sanctum-muted mt-1">{user?.email}</p>
        </div>

        <div className="glass rounded-2xl px-6 py-7 shadow-glass">
          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-sanctum-muted mb-1.5">Master Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="input-base pr-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  autoFocus
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sanctum-muted hover:text-sanctum-text transition-colors"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !password}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Unlocking...</span>
                </>
              ) : (
                <>
                  <Lock size={15} />
                  <span>Unlock</span>
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

