import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert, ShieldCheck, AlertTriangle, Clock,
  Loader2, RefreshCw, Key, ExternalLink, ChevronDown, ChevronRight
} from 'lucide-react';
import { useVaultStore } from '../stores/vault';
import { scorePassword } from '../crypto/vault';
import { checkPasswordsBatch } from '../services/hibp';
import { useClipboard } from '../hooks/useClipboard';
import { useToast } from '../hooks/useToast';

const REUSE_MIN = 2; // flag if same password used ≥ N times
const OLD_DAYS = 90; // flag if not updated in N days

// ─── Score helpers ──────────────────────────────────────────────────────────

function analyzeVault(items) {
  const loginItems = items.filter(i => i.type === 'login' && i.data?.password);

  // Weak passwords
  const weak = loginItems.filter(i => {
    const { score } = scorePassword(i.data.password);
    return score < 2;
  });

  // Reused passwords
  const pwMap = new Map();
  for (const item of loginItems) {
    const p = item.data.password;
    if (!pwMap.has(p)) pwMap.set(p, []);
    pwMap.get(p).push(item);
  }
  const reused = loginItems.filter(i => (pwMap.get(i.data.password)?.length ?? 0) >= REUSE_MIN);

  // Old passwords (not updated in OLD_DAYS)
  const cutoff = Date.now() - OLD_DAYS * 86400000;
  const old = loginItems.filter(i => (i.updatedAt || i.createdAt) < cutoff);

  return { loginItems, weak, reused, old };
}

// ─── Sub-components ────────────────────────────────────────────────────────

function ScoreCard({ icon: Icon, label, count, total, color, onClick, active }) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-3 p-4 rounded-2xl border transition-all text-left w-full ${
        active
          ? `${color.bg} ${color.border}`
          : 'bg-sanctum-card border-sanctum-border hover:border-sanctum-border-light'
      }`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color.icon}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-2xl font-bold text-sanctum-text">{count}</p>
        <p className="text-xs text-sanctum-muted mt-0.5">{label}</p>
      </div>
      {total > 0 && (
        <div className="w-full h-1 bg-sanctum-border rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${color.bar}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </button>
  );
}

function ItemRow({ item, badge, onSelect }) {
  const { copy, copiedId } = useClipboard();
  const subtitle = item.data?.username || item.data?.uris?.[0] || '';

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-sanctum-card transition-all group">
      <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
        <Key size={14} className="text-blue-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-sanctum-text truncate">{item.name}</p>
          {badge}
        </div>
        {subtitle && <p className="text-xs text-sanctum-muted truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {item.data?.password && (
          <button
            onClick={() => copy(item.data.password, `pwd-${item.id}`)}
            className="p-1.5 rounded-lg text-sanctum-muted hover:text-sanctum-text hover:bg-sanctum-surface transition-all"
            title="Copy password"
          >
            {copiedId === `pwd-${item.id}`
              ? <ShieldCheck size={14} className="text-green-400" />
              : <Key size={14} />}
          </button>
        )}
        <button
          onClick={() => onSelect(item)}
          className="p-1.5 rounded-lg text-sanctum-muted hover:text-sanctum-text hover:bg-sanctum-surface transition-all"
        >
          <ExternalLink size={14} />
        </button>
      </div>
    </div>
  );
}

function Section({ title, items, badge, emptyMsg, onSelectItem }) {
  const [open, setOpen] = useState(true);
  if (!items.length) return (
    <div className="text-center py-8 text-sanctum-muted text-sm">{emptyMsg}</div>
  );
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full text-left mb-2 group"
      >
        {open ? <ChevronDown size={15} className="text-sanctum-muted" /> : <ChevronRight size={15} className="text-sanctum-muted" />}
        <span className="text-xs font-semibold text-sanctum-muted uppercase tracking-wider">{title}</span>
        <span className="text-xs bg-sanctum-card border border-sanctum-border px-1.5 py-0.5 rounded-full text-sanctum-muted">{items.length}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {items.map(item => (
              <ItemRow
                key={item.id}
                item={item}
                badge={badge?.(item)}
                onSelect={onSelectItem}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

const CATEGORIES = ['breached', 'weak', 'reused', 'old'];

export default function Health({ onSelectItem }) {
  const { items } = useVaultStore();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('breached');
  const [breachResults, setBreachResults] = useState(null); // Map<id, count>
  const [checkProgress, setCheckProgress] = useState(null); // { done, total }
  const [isChecking, setIsChecking] = useState(false);

  const { loginItems, weak, reused, old } = analyzeVault(items);

  const breached = breachResults
    ? loginItems.filter(i => (breachResults.get(i.id) ?? 0) > 0)
    : [];

  const runBreachCheck = useCallback(async () => {
    if (isChecking) return;
    setIsChecking(true);
    setBreachResults(null);
    setCheckProgress({ done: 0, total: loginItems.length });

    try {
      const toCheck = loginItems.map(i => ({ id: i.id, password: i.data.password }));
      const results = await checkPasswordsBatch(toCheck, (done, total) => {
        setCheckProgress({ done, total });
      });
      setBreachResults(results);
      const count = [...results.values()].filter(v => v > 0).length;
      if (count === 0) toast.success('No breached passwords found!');
      else toast.warning(`${count} password${count > 1 ? 's' : ''} found in data breaches`);
    } catch {
      toast.error('Breach check failed — check your internet connection');
    } finally {
      setIsChecking(false);
      setCheckProgress(null);
    }
  }, [loginItems, isChecking]);

  // Auto-run breach check when visiting the page
  useEffect(() => {
    if (loginItems.length > 0 && !breachResults && !isChecking) {
      runBreachCheck();
    }
  }, []); // eslint-disable-line

  const counts = {
    breached: breachResults ? breached.length : '?',
    weak: weak.length,
    reused: reused.length,
    old: old.length,
  };

  const CARDS = [
    {
      id: 'breached', label: 'Breached', icon: ShieldAlert,
      color: { icon: 'text-red-400 bg-red-500/10', bg: 'bg-red-500/8', border: 'border-red-500/30', bar: 'bg-red-500' },
    },
    {
      id: 'weak', label: 'Weak', icon: AlertTriangle,
      color: { icon: 'text-orange-400 bg-orange-500/10', bg: 'bg-orange-500/8', border: 'border-orange-500/30', bar: 'bg-orange-500' },
    },
    {
      id: 'reused', label: 'Reused', icon: ShieldAlert,
      color: { icon: 'text-yellow-400 bg-yellow-500/10', bg: 'bg-yellow-500/8', border: 'border-yellow-500/30', bar: 'bg-yellow-500' },
    },
    {
      id: 'old', label: `Older than ${OLD_DAYS}d`, icon: Clock,
      color: { icon: 'text-blue-400 bg-blue-500/10', bg: 'bg-blue-500/8', border: 'border-blue-500/30', bar: 'bg-blue-400' },
    },
  ];

  const activeItems = { breached, weak, reused, old }[activeTab];
  const activeCard = CARDS.find(c => c.id === activeTab);

  const totalIssues = weak.length + reused.length + old.length + (breachResults ? breached.length : 0);
  const isHealthy = totalIssues === 0 && breachResults !== null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-8 py-6 border-b border-sanctum-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-sanctum-text">Password Health</h1>
            <p className="text-sm text-sanctum-muted mt-0.5">{loginItems.length} login{loginItems.length !== 1 ? 's' : ''} analysed</p>
          </div>
          <button
            onClick={runBreachCheck}
            disabled={isChecking}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            {isChecking
              ? <Loader2 size={14} className="animate-spin" />
              : <RefreshCw size={14} />}
            {isChecking ? 'Checking…' : 'Recheck breaches'}
          </button>
        </div>

        {/* Progress bar */}
        {checkProgress && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-sanctum-muted">Checking via HIBP k-anonymity…</span>
              <span className="text-xs text-sanctum-muted">{checkProgress.done}/{checkProgress.total}</span>
            </div>
            <div className="h-1 bg-sanctum-border rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-sanctum-accent rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(checkProgress.done / checkProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {/* All clear banner */}
        {isHealthy && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-2xl"
          >
            <ShieldCheck size={20} className="text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-400">Your vault looks healthy!</p>
              <p className="text-xs text-sanctum-muted mt-0.5">No breached, weak, reused or old passwords detected.</p>
            </div>
          </motion.div>
        )}

        {/* Score cards */}
        <div className="grid grid-cols-4 gap-3">
          {CARDS.map(card => (
            <ScoreCard
              key={card.id}
              icon={card.icon}
              label={card.label}
              count={counts[card.id]}
              total={loginItems.length}
              color={card.color}
              active={activeTab === card.id}
              onClick={() => setActiveTab(card.id)}
            />
          ))}
        </div>

        {/* Item list */}
        <div className="bg-sanctum-card border border-sanctum-border rounded-2xl p-4">
          <Section
            title={activeCard?.label}
            items={activeItems}
            badge={activeTab === 'breached'
              ? (item) => {
                  const n = breachResults?.get(item.id);
                  if (!n) return null;
                  return (
                    <span className="badge bg-red-500/10 text-red-400 border border-red-500/20">
                      {n.toLocaleString()}×
                    </span>
                  );
                }
              : activeTab === 'weak'
              ? (item) => {
                  const { label } = scorePassword(item.data?.password || '');
                  return <span className="badge bg-orange-500/10 text-orange-400 border border-orange-500/20">{label}</span>;
                }
              : undefined
            }
            emptyMsg={
              activeTab === 'breached' && !breachResults
                ? 'Running breach check…'
                : `No ${activeCard?.label?.toLowerCase()} passwords — great!`
            }
            onSelectItem={onSelectItem}
          />
        </div>

        {/* HIBP notice */}
        <p className="text-xs text-sanctum-subtle text-center">
          Breach detection uses <span className="text-sanctum-muted">HaveIBeenPwned k-anonymity</span> —
          only the first 5 characters of each SHA-1 hash are sent. Your passwords never leave this device.
        </p>
      </div>
    </div>
  );
}

