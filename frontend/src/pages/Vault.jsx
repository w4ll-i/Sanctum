import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Lock, X } from 'lucide-react';
import { useVaultStore } from '../stores/vault';
import { useAuthStore } from '../stores/auth';
import { useToast } from '../hooks/useToast';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { VaultSidebar } from '../components/vault/VaultSidebar';
import { VaultItemRow, VaultItemDetail } from '../components/vault/VaultItem';
import { ItemForm } from '../components/vault/ItemForm';
import { Modal } from '../components/ui/Modal';
import { PasswordGenerator } from '../components/vault/PasswordGenerator';
import Health from './Health';

const FILTER_LABELS = {
  all: 'All Items', favorites: 'Favorites',
  login: 'Logins', note: 'Secure Notes', card: 'Cards', identity: 'Identities',
};

export default function Vault() {
  const { searchQuery, setSearch, setSelectedItem, selectedItem, getFilteredItems, createItem, activeFilter } = useVaultStore();
  const { lock } = useAuthStore();
  const toast = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState('vault'); // 'vault' | 'health'
  const [showGenerator, setShowGenerator] = useState(false);
  const searchRef = useRef(null);

  const filtered = getFilteredItems();

  const handleCreate = async (formData) => {
    setSaving(true);
    try {
      const newItem = await createItem(formData);
      setShowAdd(false);
      setSelectedItem(newItem);
      toast.success(`"${formData.name}" added`);
    } catch (err) {
      toast.error(err.message || 'Failed to add item');
    } finally {
      setSaving(false);
    }
  };

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useKeyboardShortcuts([
    { key: 'n', mod: true, action: () => setShowAdd(true) },
    { key: 'f', mod: true, action: () => searchRef.current?.focus() },
    { key: 'l', mod: true, action: lock },
    { key: 'Escape', action: () => {
      if (showAdd) setShowAdd(false);
      else if (selectedItem) setSelectedItem(null);
      else if (searchQuery) setSearch('');
    }},
  ]);

  return (
    <div className="flex h-screen bg-sanctum-bg overflow-hidden">
      <VaultSidebar activeView={activeView} onViewChange={setActiveView} onOpenGenerator={() => setShowGenerator(true)} />

      {activeView === 'health' ? (
        <div className="flex-1 min-w-0 overflow-hidden">
          <Health onSelectItem={(item) => { setSelectedItem(item); setActiveView('vault'); }} />
        </div>
      ) : (
        <div className="flex-1 flex min-w-0">
          {/* Item list panel */}
          <div className="w-72 shrink-0 border-r border-sanctum-border flex flex-col">
            <div className="px-3 pt-4 pb-3 border-b border-sanctum-border space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-sanctum-muted" />
                  <input
                    ref={searchRef}
                    className="w-full bg-sanctum-surface border border-sanctum-border rounded-xl pl-8 pr-3 py-2.5
                               text-sm text-sanctum-text placeholder-sanctum-muted
                               focus:outline-none focus:border-sanctum-accent focus:ring-1 focus:ring-sanctum-accent transition-all"
                    placeholder="Search… (Ctrl+F)"
                    value={searchQuery}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {searchQuery && (
                    <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-sanctum-muted hover:text-sanctum-text">
                      <X size={13} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowAdd(true)}
                  className="p-2.5 bg-sanctum-accent hover:bg-sanctum-accent-hover text-white rounded-xl transition-all shrink-0"
                  title="New item (Ctrl+N)"
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-sanctum-muted">{FILTER_LABELS[activeFilter]}</span>
                <span className="text-xs text-sanctum-subtle">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                  <Lock size={24} className="text-sanctum-border mb-3" />
                  <p className="text-sm text-sanctum-muted">{searchQuery ? 'No results found' : 'No items yet'}</p>
                  {!searchQuery && (
                    <button onClick={() => setShowAdd(true)} className="text-xs text-sanctum-accent hover:text-sanctum-accent-hover mt-2 transition-colors">
                      Add your first item
                    </button>
                  )}
                </div>
              ) : (
                <AnimatePresence>
                  {filtered.map((item) => (
                    <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} layout>
                      <VaultItemRow item={item} isSelected={selectedItem?.id === item.id} onClick={() => setSelectedItem(item)} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* Detail panel */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {selectedItem ? (
              <VaultItemDetail item={selectedItem} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 rounded-2xl bg-sanctum-accent/10 border border-sanctum-accent/20 flex items-center justify-center mb-4">
                  <Lock size={24} className="text-sanctum-accent/50" />
                </div>
                <p className="text-sanctum-muted text-sm max-w-xs">Select an item to view its details, or add a new one to your vault.</p>
                <div className="mt-5 flex flex-col items-center gap-2">
                  <button onClick={() => setShowAdd(true)} className="btn-primary text-sm flex items-center gap-2">
                    <Plus size={15} /> Add Item
                  </button>
                  <p className="text-xs text-sanctum-subtle">Ctrl+N to add • Ctrl+F to search • Ctrl+L to lock</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="New Item" size="md">
        <ItemForm onSave={handleCreate} onCancel={() => setShowAdd(false)} isLoading={saving} />
      </Modal>

      <Modal isOpen={showGenerator} onClose={() => setShowGenerator(false)} title="Password Generator" size="sm">
        <PasswordGenerator />
      </Modal>
    </div>
  );
}

