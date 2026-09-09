import { useState } from 'react';
import { Download, Shield, Clock, Upload, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { useToast } from '../../hooks/useToast';
import { Modal } from '../ui/Modal';
import { TotpSetup } from './TotpSetup';
import { ImportModal } from './ImportModal';
import api from '../../lib/api';

const AUTO_LOCK_OPTIONS = [
  { value: 1, label: '1 minute' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 0, label: 'Never' },
];

export function SettingsPanel({ onClose }) {
  const { autoLockMinutes, setAutoLock, logout, user } = useAuthStore();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [logoutAll, setLogoutAll] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showTotp, setShowTotp] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(Boolean(user?.totp_enabled));

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get('/api/vault/export', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `sanctum-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Vault exported successfully');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleLogoutAll = async () => {
    if (!logoutAll) { setLogoutAll(true); return; }
    try {
      await api.post('/api/auth/logout-all');
      logout();
    } catch {
      toast.error('Failed to logout all sessions');
    }
  };

  return (
    <div className="space-y-5 overflow-y-auto max-h-[70vh]">
      {/* Auto-lock */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Clock size={15} className="text-sanctum-accent" />
          <h3 className="text-sm font-medium text-sanctum-text">Auto-lock</h3>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {AUTO_LOCK_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setAutoLock(value)}
              className={`text-xs py-2 px-3 rounded-xl border transition-all text-left ${
                autoLockMinutes === value
                  ? 'bg-sanctum-accent-muted border-sanctum-accent text-sanctum-accent-hover'
                  : 'border-sanctum-border text-sanctum-muted hover:border-sanctum-border-light hover:text-sanctum-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 2FA */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={15} className="text-sanctum-accent" />
          <h3 className="text-sm font-medium text-sanctum-text">Two-Factor Auth (2FA)</h3>
        </div>
        <button
          onClick={() => setShowTotp(true)}
          className="btn-secondary w-full text-sm"
        >
          {totpEnabled ? 'Manage 2FA' : 'Enable 2FA'}
        </button>
      </div>

      {/* Import / Export */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Download size={15} className="text-sanctum-accent" />
          <h3 className="text-sm font-medium text-sanctum-text">Import / Export</h3>
        </div>
        <div className="space-y-2">
          <button
            onClick={() => setShowImport(true)}
            className="btn-secondary w-full text-sm flex items-center justify-center gap-2"
          >
            <Upload size={14} /> Import from Bitwarden / Chrome…
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn-secondary w-full text-sm flex items-center justify-center gap-2"
          >
            <Download size={14} />
            {exporting ? 'Exporting…' : 'Export encrypted vault'}
          </button>
        </div>
      </div>

      {/* Security */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Shield size={15} className="text-sanctum-accent" />
          <h3 className="text-sm font-medium text-sanctum-text">Security</h3>
        </div>
        <button onClick={handleLogoutAll} className="btn-danger w-full text-sm">
          {logoutAll ? 'Click again to confirm' : 'Sign out all devices'}
        </button>
      </div>

      {/* TOTP modal */}
      <Modal isOpen={showTotp} onClose={() => setShowTotp(false)} title="Two-Factor Authentication" size="sm">
        <TotpSetup
          totpEnabled={totpEnabled}
          onStatusChange={(enabled) => {
            setTotpEnabled(enabled);
            setShowTotp(false);
          }}
        />
      </Modal>

      {/* Import modal */}
      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="Import Passwords" size="md">
        <ImportModal onClose={() => setShowImport(false)} />
      </Modal>
    </div>
  );
}

