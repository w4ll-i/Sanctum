import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import api from '../lib/api';
import { encryptItem, decryptItem } from '../crypto/vault';
import { useAuthStore } from './auth';
import {
  saveVaultOffline, loadVaultOffline,
  upsertItemOffline, deleteItemOffline,
  clearVaultOffline, queuePendingOp,
  getPendingOps, removePendingOp,
} from '../lib/offlineDB';

function isOffline() { return !navigator.onLine; }

export const useVaultStore = create((set, get) => ({
  items: [],
  isLoading: false,
  error: null,
  searchQuery: '',
  activeFilter: 'all',
  selectedItem: null,

  setSearch: (query) => set({ searchQuery: query }),
  setFilter: (filter) => set({ activeFilter: filter }),
  setSelectedItem: (item) => set({ selectedItem: item }),

  // ── Load vault ────────────────────────────────────────────────────────────

  loadVault: async (encryptedItems) => {
    const symmetricKey = useAuthStore.getState().symmetricKey;
    if (!symmetricKey) return;

    set({ isLoading: true, error: null });
    try {
      let items;

      if (encryptedItems) {
        items = encryptedItems;
      } else if (isOffline()) {
        // Offline: load from IndexedDB
        items = await loadVaultOffline();
      } else {
        const res = await api.get('/api/vault');
        items = res.data.items;
      }

      const decrypted = await Promise.all(
        items.map(async (item) => {
          try {
            const plain = await decryptItem(item.encrypted_data, symmetricKey);
            return { ...plain, id: item.id, type: item.type, createdAt: item.created_at, updatedAt: item.updated_at };
          } catch { return null; }
        })
      );

      const validItems = decrypted.filter(Boolean);
      set({ items: validItems, isLoading: false });

      // Persist encrypted items to IndexedDB for offline access
      if (items.length > 0) saveVaultOffline(items).catch(() => {});
    } catch (err) {
      // On network error, fall back to IndexedDB
      try {
        const offlineItems = await loadVaultOffline();
        if (offlineItems.length > 0) {
          const decrypted = await Promise.all(
            offlineItems.map(async (item) => {
              try {
                const plain = await decryptItem(item.encrypted_data, symmetricKey);
                return { ...plain, id: item.id, type: item.type, createdAt: item.created_at, updatedAt: item.updated_at };
              } catch { return null; }
            })
          );
          set({ items: decrypted.filter(Boolean), isLoading: false, error: 'offline' });
          return;
        }
      } catch {}
      set({ error: err.message, isLoading: false });
    }
  },

  // ── Create ────────────────────────────────────────────────────────────────

  createItem: async (itemData) => {
    const symmetricKey = useAuthStore.getState().symmetricKey;
    if (!symmetricKey) throw new Error('Not authenticated');

    const encrypted = await encryptItem(itemData, symmetricKey);
    const now = Date.now();

    if (isOffline()) {
      const id = uuidv4();
      const newItem = { ...itemData, id, createdAt: now, updatedAt: now };
      await upsertItemOffline({ id, type: itemData.type, encrypted_data: encrypted, created_at: now, updated_at: now });
      await queuePendingOp({ id: uuidv4(), type: 'create', payload: { id, type: itemData.type, encrypted_data: encrypted } });
      set((s) => ({ items: [newItem, ...s.items] }));
      return newItem;
    }

    const res = await api.post('/api/vault/items', { type: itemData.type, encrypted_data: encrypted });
    const newItem = { ...itemData, id: res.data.id, createdAt: res.data.created_at, updatedAt: res.data.updated_at };
    await upsertItemOffline({ id: newItem.id, type: itemData.type, encrypted_data: encrypted, created_at: newItem.createdAt, updated_at: newItem.updatedAt });
    set((s) => ({ items: [newItem, ...s.items] }));
    return newItem;
  },

  // ── Update ────────────────────────────────────────────────────────────────

  updateItem: async (id, itemData) => {
    const symmetricKey = useAuthStore.getState().symmetricKey;
    if (!symmetricKey) throw new Error('Not authenticated');

    const encrypted = await encryptItem(itemData, symmetricKey);
    const now = Date.now();

    if (isOffline()) {
      const updatedItem = { ...itemData, id, updatedAt: now };
      await upsertItemOffline({ id, type: itemData.type, encrypted_data: encrypted, created_at: now, updated_at: now });
      await queuePendingOp({ id: uuidv4(), type: 'update', payload: { id, type: itemData.type, encrypted_data: encrypted } });
      set((s) => ({
        items: s.items.map((i) => (i.id === id ? updatedItem : i)),
        selectedItem: s.selectedItem?.id === id ? updatedItem : s.selectedItem,
      }));
      return updatedItem;
    }

    const res = await api.put(`/api/vault/items/${id}`, { type: itemData.type, encrypted_data: encrypted });
    const updatedItem = { ...itemData, id, updatedAt: res.data.updated_at };
    await upsertItemOffline({ id, type: itemData.type, encrypted_data: encrypted, created_at: now, updated_at: res.data.updated_at });
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? updatedItem : i)),
      selectedItem: s.selectedItem?.id === id ? updatedItem : s.selectedItem,
    }));
    return updatedItem;
  },

  // ── Delete ────────────────────────────────────────────────────────────────

  deleteItem: async (id) => {
    if (isOffline()) {
      await deleteItemOffline(id);
      await queuePendingOp({ id: uuidv4(), type: 'delete', payload: { id } });
    } else {
      await api.delete(`/api/vault/items/${id}`);
      await deleteItemOffline(id);
    }
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
      selectedItem: s.selectedItem?.id === id ? null : s.selectedItem,
    }));
  },

  // ── Sync pending ops when back online ─────────────────────────────────────

  syncPendingOps: async () => {
    const ops = await getPendingOps();
    if (!ops.length) return;

    for (const op of ops) {
      try {
        if (op.type === 'create') {
          await api.post('/api/vault/items', op.payload);
        } else if (op.type === 'update') {
          await api.put(`/api/vault/items/${op.payload.id}`, op.payload);
        } else if (op.type === 'delete') {
          await api.delete(`/api/vault/items/${op.payload.id}`);
        }
        await removePendingOp(op.id);
      } catch {}
    }

    // Refresh vault from server after sync
    get().loadVault();
  },

  toggleFavorite: async (item) => get().updateItem(item.id, { ...item, favorite: !item.favorite }),

  // ── Filters ───────────────────────────────────────────────────────────────

  getFilteredItems: () => {
    const { items, searchQuery, activeFilter } = get();
    let filtered = items;

    if (activeFilter === 'favorites') filtered = filtered.filter((i) => i.favorite);
    else if (activeFilter !== 'all') filtered = filtered.filter((i) => i.type === activeFilter);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((i) =>
        i.name?.toLowerCase().includes(q) ||
        i.data?.username?.toLowerCase().includes(q) ||
        i.data?.uris?.some((u) => u.toLowerCase().includes(q))
      );
    }

    return filtered;
  },

  getCounts: () => {
    const { items } = get();
    return {
      all: items.length,
      login: items.filter((i) => i.type === 'login').length,
      note: items.filter((i) => i.type === 'note').length,
      card: items.filter((i) => i.type === 'card').length,
      identity: items.filter((i) => i.type === 'identity').length,
      favorites: items.filter((i) => i.favorite).length,
    };
  },

  clear: async () => {
    await clearVaultOffline().catch(() => {});
    set({ items: [], selectedItem: null, searchQuery: '', activeFilter: 'all' });
  },
}));
