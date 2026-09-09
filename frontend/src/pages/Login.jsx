import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Lock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { prepareLogin } from '../crypto/vault';
import { useAuthStore } from '../stores/auth';
import { useVaultStore } from '../stores/vault';
import { TotpCodeInput } from '../components/vault/TotpSetup';
import api from '../lib/api';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { loadVault } = useVaultStore();

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | totp | error
  const [error, setError] = useState('');
  // TOTP state — kept in memory after password verification
  const [totpCtx, setTotpCtx] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return;
    setStatus('loading');
    setError('');
    try {
      const preRes = await api.post('/api/auth/prelogin', { email: form.email });
      const { kdfParams, protectedSymmetricKey } = preRes.data;

      // Derive keys client-side (Argon2id — 1-3 seconds)
      const { authKeyHex, symmetricKey } = await prepareLogin(
        form.password, form.email, kdfParams, protectedSymmetricKey
      );

      const res = await api.post('/api/auth/login', {
        email: form.email,
        masterPasswordHash: authKeyHex,
      });

      if (res.data.requiresTOTP) {
        // Keep the derived symmetricKey in memory, show TOTP step
        setTotpCtx({ tempToken: res.data.tempToken, symmetricKey });
        setStatus('totp');
        return;
      }

      await finalizeLogin(res.data, symmetricKey);
    } catch (err) {
      setStatus('error');
      const code = err.response?.data?.code;
      if (code === 'ACCOUNT_LOCKED') setError(err.response.data.error);
      else if (err.response?.status === 401) setError('Invalid email or password.');
      else if (err.response?.status === 429) setError('Too many attempts. Please wait before trying again.');
      else if (err.code === 'ERR_NETWORK') setError('Cannot connect to server. Check your connection.');
      else setError('An error occurred. Please try again.');
    }
  };

  const handleTotpVerify = async (code) => {
    if (!totpCtx) return;
    setStatus('loading');
    setError('');
    try {
      const res = await api.post('/api/totp/verify', {
        tempToken: totpCtx.tempToken,
        code,
      });
      await finalizeLogin(res.data, totpCtx.symmetricKey);
    } catch (err) {
      setStatus('totp');
      if (err.response?.status === 401) setError('Invalid code. Try again.');
      else setError('Verification failed. Please try again.');
    }
  };

  const finalizeLogin = async (data, symmetricKey) => {
    const { accessToken, refreshToken, user, vault } = data;
    login({ user, accessToken, refreshToken, symmetricKey });
    await loadVault(vault);
    navigate('/vault');
  };

  const isLoading = status === 'loading';

  return (
    <div className="min-h-screen bg-sanctum-bg flex flex-col items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 bg-sanctum-glow pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm relative"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-sanctum-accent/15 border border-sanctum-accent/25 flex items-center justify-center mb-4 glow-accent">
            <img src="/logo.png" alt="Sanctum" className="w-8 h-8 object-contain" style={{filter: 'invert(56%) sepia(74%) saturate(600%) hue-rotate(210deg) brightness(105%)'}} />
          </div>
          <h1 className="text-2xl font-bold text-sanctum-text">Sanctum</h1>
          <p className="text-sm text-sanctum-muted mt-1">Unlock your vault</p>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl px-6 py-7 shadow-glass">
          {/* TOTP step — shown after password is verified */}
          <AnimatePresence mode="wait">
          {status === 'totp' ? (
            <motion.div
              key="totp"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <div className="flex flex-col items-center gap-2 pb-2">
                <div className="w-10 h-10 rounded-xl bg-sanctum-accent/15 border border-sanctum-accent/25 flex items-center justify-center">
                  <ShieldCheck size={20} className="text-sanctum-accent" />
                </div>
                <p className="text-sm font-semibold text-sanctum-text">Two-factor authentication</p>
                <p className="text-xs text-sanctum-muted text-center">Enter the 6-digit code from your authenticator app</p>
              </div>

              <TotpCodeInput onSubmit={handleTotpVerify} isLoading={isLoading} />

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}

              {isLoading && (
                <p className="text-xs text-sanctum-muted text-center">Verifying…</p>
              )}

              <button
                type="button"
                onClick={() => { setStatus('idle'); setTotpCtx(null); setError(''); }}
                className="btn-ghost w-full text-sm"
              >
                ← Back to login
              </button>
            </motion.div>
          ) : (
          <motion.div key="password">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-sanctum-muted mb-1.5">Email</label>
              <input
                id="login-email"
                type="email"
                className="input-base"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={isLoading}
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="text-xs font-medium text-sanctum-muted">Master Password</label>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPwd ? 'text' : 'password'}
                  className="input-base pr-11"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  disabled={isLoading}
                  required
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
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl"
              >
                <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">{error}</p>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={isLoading || !form.email || !form.password}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Unlocking vault...</span>
                </>
              ) : (
                <>
                  <Lock size={15} />
                  <span>Unlock Vault</span>
                </>
              )}
            </button>
          </form>

          {isLoading && (
            <p className="text-xs text-sanctum-muted text-center mt-3">
              Deriving keys with Argon2id — this may take a moment...
            </p>
          )}
          </motion.div>
          )}
          </AnimatePresence>
        </div>

        <p className="text-center text-sm text-sanctum-muted mt-5">
          No account?{' '}
          <Link to="/register" className="text-sanctum-accent hover:text-sanctum-accent-hover transition-colors font-medium">
            Create one
          </Link>
        </p>

        {/* Security note */}
        <p className="text-center text-xs text-sanctum-subtle mt-4">
          Zero-knowledge encryption — your password never leaves this device
        </p>
      </motion.div>
    </div>
  );
}

