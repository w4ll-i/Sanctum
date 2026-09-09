import { LogOut, Lock, Key, FileText, CreditCard, User, Star, Settings, LayoutGrid, HeartPulse, WifiOff, Wand2 } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { useVaultStore } from '../../stores/vault';
import { useSetupStore } from '../../stores/setup';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { SettingsPanel } from './SettingsPanel';

const NAV_ITEMS = [
  { id: 'all', label: 'All Items', icon: LayoutGrid },
  { id: 'favorites', label: 'Favorites', icon: Star },
  { id: 'login', label: 'Logins', icon: Key },
  { id: 'note', label: 'Secure Notes', icon: FileText },
  { id: 'card', label: 'Cards', icon: CreditCard },
  { id: 'identity', label: 'Identities', icon: User },
];

export function VaultSidebar({ activeView, onViewChange, onOpenGenerator }) {
  const { user, logout, lock } = useAuthStore();
  const { activeFilter, setFilter, getCounts, syncPendingOps } = useVaultStore();
  const { instanceName } = useSetupStore();
  const [showSettings, setShowSettings] = useState(false);

  const { isOnline } = useOnlineStatus(() => {
    syncPendingOps?.();
  });

  const counts = getCounts();

  const handleFilterClick = (id) => {
    setFilter(id);
    onViewChange('vault');
  };

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-sanctum-surface border-r border-sanctum-border h-screen">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-sanctum-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sanctum-accent/20 border border-sanctum-accent/30 flex items-center justify-center">
            <img src="/logo.png" alt="Sanctum" className="w-5 h-5 object-contain" style={{filter: 'invert(56%) sepia(74%) saturate(600%) hue-rotate(210deg) brightness(105%)'}} />
          </div>
          <span className="font-semibold text-sm text-sanctum-text tracking-wide">{instanceName}</span>
        </div>
      </div>

      {/* Offline banner */}
      {!isOnline && (
        <div className="mx-2 mt-2 flex items-center gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
          <WifiOff size={13} className="text-yellow-400 shrink-0" />
          <span className="text-xs text-yellow-400">Offline mode</span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeView === 'vault' && activeFilter === id;
          return (
            <button
              key={id}
              onClick={() => handleFilterClick(id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all ${
                active
                  ? 'bg-sanctum-accent-muted text-sanctum-accent-hover font-medium'
                  : 'text-sanctum-muted hover:text-sanctum-text hover:bg-sanctum-card'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon size={15} />
                {label}
              </span>
              {counts[id] > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  active
                    ? 'bg-sanctum-accent/20 text-sanctum-accent'
                    : 'bg-sanctum-card text-sanctum-subtle'
                }`}>
                  {counts[id]}
                </span>
              )}
            </button>
          );
        })}

        {/* Health separator */}
        <div className="border-t border-sanctum-border my-2" />

        <button
          onClick={() => onViewChange('health')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all ${
            activeView === 'health'
              ? 'bg-sanctum-accent-muted text-sanctum-accent-hover font-medium'
              : 'text-sanctum-muted hover:text-sanctum-text hover:bg-sanctum-card'
          }`}
        >
          <HeartPulse size={15} />
          Password Health
        </button>
      </nav>

      {/* Bottom actions */}
      <div className="px-2 py-3 border-t border-sanctum-border space-y-0.5">
        <button
          onClick={onOpenGenerator}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-sanctum-muted hover:text-sanctum-text hover:bg-sanctum-card transition-all"
          title="Password Generator"
        >
          <Wand2 size={15} />
          Generator
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-sanctum-muted hover:text-sanctum-text hover:bg-sanctum-card transition-all"
        >
          <Settings size={15} />
          Settings
        </button>
        <button
          onClick={lock}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-sanctum-muted hover:text-sanctum-text hover:bg-sanctum-card transition-all"
          title="Lock vault (Ctrl+L)"
        >
          <Lock size={15} />
          Lock vault
        </button>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-sanctum-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>

      {/* User info */}
      <div className="px-4 py-3 border-t border-sanctum-border">
        <p className="text-xs text-sanctum-muted truncate">{user?.email}</p>
        <p className="text-xs text-sanctum-subtle truncate">{user?.username}</p>
      </div>

      <Modal isOpen={showSettings} onClose={() => setShowSettings(false)} title="Settings" size="sm">
        <SettingsPanel onClose={() => setShowSettings(false)} />
      </Modal>
    </aside>
  );
}
