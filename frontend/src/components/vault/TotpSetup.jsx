import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ShieldOff, Loader2, Copy, Check, AlertTriangle } from 'lucide-react';
import QRCode from 'qrcode';
import api from '../../lib/api';
import { useToast } from '../../hooks/useToast';
import { useClipboard } from '../../hooks/useClipboard';

function TotpCodeInput({ onSubmit, isLoading, label = 'Verification code' }) {
  const [digits, setDigits] = useState(Array(6).fill(''));
  const refs = useRef([]);

  const handleChange = (i, val) => {
    const cleaned = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = cleaned;
    setDigits(next);
    if (cleaned && i < 5) refs.current[i + 1]?.focus();
    if (next.every(d => d !== '')) onSubmit(next.join(''));
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      setDigits(text.split(''));
      onSubmit(text);
    }
  };

  return (
    <div>
      <p className="text-xs text-sanctum-muted mb-3">{label}</p>
      <div className="flex gap-2 justify-center" onPaste={handlePaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={el => refs.current[i] = el}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            disabled={isLoading}
            className={`w-10 h-12 text-center text-lg font-mono font-semibold rounded-xl border
              bg-sanctum-surface text-sanctum-text
              focus:outline-none focus:border-sanctum-accent focus:ring-1 focus:ring-sanctum-accent
              transition-all ${i === 2 ? 'mr-2' : ''}
              ${d ? 'border-sanctum-accent/50' : 'border-sanctum-border'}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── TOTP Status (manage existing) ────────────────────────────────────────────

function TotpManage({ onDisabled }) {
  const [step, setStep] = useState('idle'); // idle | confirm | loading
  const [error, setError] = useState('');
  const toast = useToast();

  const handleDisable = async (code) => {
    setStep('loading');
    setError('');
    try {
      await api.delete('/api/totp', { data: { code } });
      toast.success('2FA disabled');
      onDisabled();
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code');
      setStep('confirm');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
        <ShieldCheck size={20} className="text-green-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-green-400">2FA is active</p>
          <p className="text-xs text-sanctum-muted mt-0.5">Your account is protected with TOTP.</p>
        </div>
      </div>

      {step === 'idle' && (
        <button onClick={() => setStep('confirm')} className="btn-danger w-full text-sm flex items-center justify-center gap-2">
          <ShieldOff size={15} /> Disable 2FA
        </button>
      )}

      {(step === 'confirm' || step === 'loading') && (
        <div className="space-y-3">
          <TotpCodeInput
            label="Enter your current TOTP code to confirm"
            onSubmit={handleDisable}
            isLoading={step === 'loading'}
          />
          {error && <p className="text-xs text-red-400 text-center">{error}</p>}
          <button onClick={() => setStep('idle')} className="btn-ghost w-full text-sm">Cancel</button>
        </div>
      )}
    </div>
  );
}

// ─── TOTP Setup flow ──────────────────────────────────────────────────────────

export function TotpSetup({ totpEnabled, onStatusChange }) {
  const [phase, setPhase] = useState('idle'); // idle | setup | confirm | loading
  const [setupData, setSetupData] = useState(null); // { otpauthUrl, secretBase32, qrDataUrl }
  const [error, setError] = useState('');
  const toast = useToast();
  const { copy, copiedId } = useClipboard();

  const startSetup = async () => {
    setPhase('loading');
    setError('');
    try {
      const res = await api.post('/api/totp/setup');
      const { otpauthUrl, secretBase32 } = res.data;
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
        width: 200,
        margin: 1,
        color: { dark: '#e2e8f0', light: '#0f0f1a' },
      });
      setSetupData({ otpauthUrl, secretBase32, qrDataUrl });
      setPhase('confirm');
    } catch (err) {
      setError(err.response?.data?.error || 'Setup failed');
      setPhase('idle');
    }
  };

  const confirmSetup = async (code) => {
    setPhase('loading');
    setError('');
    try {
      await api.post('/api/totp/confirm', { code });
      toast.success('2FA enabled successfully');
      setPhase('idle');
      setSetupData(null);
      onStatusChange(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code');
      setPhase('confirm');
    }
  };

  if (totpEnabled) {
    return <TotpManage onDisabled={() => onStatusChange(false)} />;
  }

  return (
    <div className="space-y-4">
      {phase === 'idle' && (
        <>
          <div className="flex items-center gap-3 p-4 bg-yellow-500/8 border border-yellow-500/20 rounded-xl">
            <AlertTriangle size={18} className="text-yellow-400 shrink-0" />
            <p className="text-xs text-sanctum-muted">
              2FA adds a time-based one-time code as a second factor. You will need an authenticator app (Google Authenticator, Aegis, Bitwarden Authenticator…).
            </p>
          </div>
          <button onClick={startSetup} className="btn-primary w-full text-sm flex items-center justify-center gap-2">
            <ShieldCheck size={15} /> Enable 2FA
          </button>
        </>
      )}

      {phase === 'loading' && (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={24} className="animate-spin text-sanctum-accent" />
        </div>
      )}

      {phase === 'confirm' && setupData && (
        <div className="space-y-4">
          <p className="text-xs text-sanctum-muted text-center">Scan this QR code with your authenticator app</p>

          <div className="flex justify-center">
            <img
              src={setupData.qrDataUrl}
              alt="TOTP QR Code"
              className="rounded-xl border border-sanctum-border w-[200px] h-[200px]"
            />
          </div>

          <div>
            <p className="text-xs text-sanctum-muted mb-1.5">Or enter the secret manually</p>
            <div className="flex items-center gap-2 bg-sanctum-bg border border-sanctum-border rounded-xl px-3 py-2">
              <code className="text-xs text-sanctum-accent flex-1 font-mono tracking-wider break-all">
                {setupData.secretBase32}
              </code>
              <button
                onClick={() => copy(setupData.secretBase32, 'totp-secret')}
                className="text-sanctum-muted hover:text-sanctum-text transition-colors shrink-0"
              >
                {copiedId === 'totp-secret' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <TotpCodeInput
            label="Enter the 6-digit code from your app to confirm"
            onSubmit={confirmSetup}
            isLoading={phase === 'loading'}
          />

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          <button onClick={() => { setPhase('idle'); setSetupData(null); }} className="btn-ghost w-full text-sm">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export { TotpCodeInput };

