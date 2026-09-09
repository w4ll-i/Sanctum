import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSetupStore } from '../stores/setup';
import api from '../lib/api';

export default function Setup() {
  const navigate = useNavigate();
  const { setSetup } = useSetupStore();
  const [step, setStep] = useState(1);
  const [instanceName, setInstanceName] = useState('Sanctum');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFinishConfig = async () => {
    setError('');
    setLoading(true);
    try {
      await api.post('/api/setup/configure', {
        instanceName: instanceName.trim() || 'Sanctum',
      });
      setSetup({ done: false, instanceName: instanceName.trim() || 'Sanctum' });
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error || 'Configuration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sanctum-bg flex flex-col items-center justify-center p-4">
      <div className="absolute inset-0 bg-sanctum-glow pointer-events-none" />

      <motion.div
        key={step}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm relative"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-sanctum-accent/15 border border-sanctum-accent/25 flex items-center justify-center mb-4 glow-accent">
            <img src="/logo.png" alt="Sanctum" className="w-8 h-8 object-contain" style={{ filter: 'invert(56%) sepia(74%) saturate(600%) hue-rotate(210deg) brightness(105%)' }} />
          </div>
        </div>

        <div className="glass rounded-2xl px-6 py-7 shadow-glass">
          {/* Step indicator */}
          <div className="flex gap-2 mb-6">
            {[1, 2].map(s => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-sanctum-accent' : 'bg-sanctum-border'}`}
              />
            ))}
          </div>

          {/* Step 1: Welcome + instance name */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-sanctum-text">Welcome to Sanctum</h1>
                <p className="text-sm text-sanctum-muted mt-1">Give your vault a name to get started.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-sanctum-muted mb-1.5">Instance name</label>
                <input
                  className="input-base"
                  value={instanceName}
                  onChange={e => setInstanceName(e.target.value)}
                  maxLength={50}
                  placeholder="Sanctum"
                  autoFocus
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                className="btn-primary w-full flex items-center justify-center gap-2"
                onClick={handleFinishConfig}
                disabled={loading || !instanceName.trim()}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  'Continue'
                )}
              </button>
            </div>
          )}

          {/* Step 2: Create first account */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-sanctum-text">Your vault is ready</h1>
                <p className="text-sm text-sanctum-muted mt-1">
                  Create your account to start using <span className="text-sanctum-text font-medium">{instanceName || 'Sanctum'}</span>.
                </p>
              </div>
              <button
                className="btn-primary w-full"
                onClick={() => navigate('/register')}
              >
                Create Account
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
