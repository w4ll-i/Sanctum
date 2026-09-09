/**
 * IndexedDB wrapper for offline vault storage.
 * Stores the encrypted vault items locally so the vault is accessible
 * even when the server is unreachable.
 *
 * Schema:
 *   DB: sanctum-offline  v1
 *   Store: vault-items  keyPath: id
 *   Store: pending-ops  keyPath: id  (queued writes when offline)
 */

const DB_NAME = 'sanctum-offline';
const DB_VERSION = 1;
const STORE_VAULT = 'vault-items';
const STORE_PENDING = 'pending-ops';

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_VAULT)) {
        db.createObjectStore(STORE_VAULT, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        db.createObjectStore(STORE_PENDING, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const req = fn(store);
    transaction.oncomplete = () => resolve(req?.result);
    transaction.onerror = () => reject(transaction.error);
  }));
}

// ─── Vault items ─────────────────────────────────────────────────────────────

/** Save all encrypted vault items to IndexedDB (full replace). */
export async function saveVaultOffline(items) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_VAULT, 'readwrite');
    const store = t.objectStore(STORE_VAULT);
    store.clear();
    for (const item of items) store.put(item);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}

/** Load all encrypted vault items from IndexedDB. */
export async function loadVaultOffline() {
  return tx(STORE_VAULT, 'readonly', store => store.getAll());
}

/** Upsert a single item in IndexedDB. */
export async function upsertItemOffline(item) {
  return tx(STORE_VAULT, 'readwrite', store => store.put(item));
}

/** Delete a single item from IndexedDB. */
export async function deleteItemOffline(id) {
  return tx(STORE_VAULT, 'readwrite', store => store.delete(id));
}

/** Clear all local vault data (on logout). */
export async function clearVaultOffline() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction([STORE_VAULT, STORE_PENDING], 'readwrite');
    t.objectStore(STORE_VAULT).clear();
    t.objectStore(STORE_PENDING).clear();
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}

// ─── Pending operations queue ─────────────────────────────────────────────────

/**
 * Queue an operation to be synced when back online.
 * @param {{ id, type: 'create'|'update'|'delete', payload }} op
 */
export async function queuePendingOp(op) {
  return tx(STORE_PENDING, 'readwrite', store => store.put({ ...op, queuedAt: Date.now() }));
}

/** Get all queued operations. */
export async function getPendingOps() {
  return tx(STORE_PENDING, 'readonly', store => store.getAll());
}

/** Remove a pending operation after it has been synced. */
export async function removePendingOp(id) {
  return tx(STORE_PENDING, 'readwrite', store => store.delete(id));
}
