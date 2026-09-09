import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, AlertTriangle, CheckCircle } from 'lucide-react';
import { prepareRegistration } from '../crypto/vault';
import { PasswordStrength } from '../components/ui/PasswordStrength';
import { useAuthStore } from '../stores/auth';
import { useVaultStore } from '../stores/vault';
import { useSetupStore } from '../stores/setup';
import api from '../lib/api';

const REQUIREMENTS = [
  { test: (p) => p.length >= 12, label: 'At least 12 characters' },
  { test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p), label: 'Mixed case' },
  { test: (p) => /[0-9]/.test(p), label: 'At least one number' },
  { test: (p) => /[^a-zA-Z0-9]/.test(p), label: 'At least one special character' },
];

export default function Register() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { loadVault } = useVaultStore();
  const { setSetup } = useSetupStore();

  const [form, setForm] = useState({ email: '', username: '', password: '', confirm: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const requirements = REQUIREMENTS.map((r) => ({ ...r, met: r.test(form.password) }));
  const allMet = requirements.every((r) => r.met);
  const passwordsMatch = form.password === form.confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!allMet || !passwordsMatch) return;

    setStatus('loading');
    setError('');

    try {
      // Derive keys and prepare registration payload
      const regData = await prepareRegistration(form.password, form.email);

      const regRes = await api.post('/api/auth/register', {
        email: form.email,
        username: form.username,
        masterPasswordHash: regData.masterPasswordHash,
        kdfParams: regData.kdfParams,
        protectedSymmetricKey: regData.protectedSymmetricKey,
      });
      // Update setup state so App doesn't redirect back to /setup after registration
      if (regRes.data.setupDone) {
        setSetup({ done: true, instanceName: regRes.data.instanceName });
      }

      // Auto-login after registration
      const preRes = await api.post('/api/auth/prelogin', { email: form.email });
      const { kdfParams, protectedSymmetricKey } = preRes.data;

      const { prepareLogin } = await import('../crypto/vault');
      const { authKeyHex, symmetricKey } = await prepareLogin(
        form.password,
        form.email,
        kdfParams,
        protectedSymmetricKey
      );

      const res = await api.post('/api/auth/login', {
        email: form.email,
        masterPasswordHash: authKeyHex,
      });

      login({
        user: res.data.user,
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
        symmetricKey,
      });

      await loadVault(res.data.vault);
      navigate('/vault');
    } catch (err) {
      setStatus('error');
      if (err.response?.data?.code === 'EMAIL_EXISTS') {
        setError('An account with this email already exists.');
      } else if (err.response?.status === 429) {
        setError('Too many registration attempts. Try again later.');
      } else {
        setError(err.response?.data?.error || 'Registration failed. Please try again.');
      }
    }
  };

  const isLoading = status === 'loading';

  return (
    <div className="min-h-screen bg-sanctum-bg flex flex-col items-center justify-center p-4">
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
          <h1 className="text-2xl font-bold text-sanctum-text">Create Account</h1>
          <p className="text-sm text-sanctum-muted mt-1">Set up your secure vault</p>
        </div>

        <div className="glass rounded-2xl px-6 py-7 shadow-glass">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-sanctum-muted mb-1.5">Email</label>
              <input
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
              <label className="block text-xs font-medium text-sanctum-muted mb-1.5">Username</label>
              <input
                type="text"
                className="input-base"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="johndoe"
                autoComplete="username"
                disabled={isLoading}
                pattern="[-a-zA-Z0-9_]+"
                minLength={2}
                maxLength={50}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-sanctum-muted mb-1.5">Master Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="input-base pr-11"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
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
              <PasswordStrength password={form.password} />

              {/* Requirements */}
              {form.password && (
                <div className="mt-3 space-y-1.5">
                  {requirements.map(({ label, met }) => (
                    <div key={label} className="flex items-center gap-2">
                      <CheckCircle
                        size={13}
                        className={`shrink-0 transition-colors ${met ? 'text-green-400' : 'text-sanctum-border'}`}
                        fill={met ? 'currentColor' : 'none'}
                      />
                      <span className={`text-xs transition-colors ${met ? 'text-green-400' : 'text-sanctum-muted'}`}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-sanctum-muted mb-1.5">Confirm Password</label>
              <input
                type="password"
                className={`input-base transition-colors ${
                  form.confirm && !passwordsMatch ? 'border-red-500/50 focus:border-red-500' : ''
                }`}
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                placeholder="Repeat your password"
                autoComplete="new-password"
                disabled={isLoading}
                required
              />
              {form.confirm && !passwordsMatch && (
                <p className="text-xs text-red-400 mt-1">Passwords don't match</p>
              )}
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

            {/* Warning */}
            <div className="p-3 bg-yellow-500/8 border border-yellow-500/20 rounded-xl">
              <p className="text-xs text-yellow-400/90">
                Your master password cannot be recovered if lost. Store it safely.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading || !allMet || !passwordsMatch}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Creating vault...</span>
                </>
              ) : (
                'Create Secure Vault'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-sanctum-muted mt-5">
          Already have an account?{' '}
          <Link to="/login" className="text-sanctum-accent hover:text-sanctum-accent-hover transition-colors font-medium">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

