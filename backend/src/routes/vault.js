const express = require('express');
const { z } = require('zod');
const { getDb, withTransaction } = require('../config/database');
const { generateId } = require('../utils/crypto');
const { authenticate, auditLog } = require('../middleware/auth');

const router = express.Router();

// All vault routes require authentication
router.use(authenticate);

const ITEM_TYPES = ['login', 'note', 'card', 'identity'];

const vaultItemSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(ITEM_TYPES),
  encrypted_data: z.string().min(32).max(65536),
});

const bulkSyncSchema = z.object({
  items: z.array(vaultItemSchema).max(10000),
  lastSync: z.number().int().optional(),
});

/**
 * GET /api/vault
 * Fetch all vault items for the authenticated user.
 */
router.get('/', (req, res) => {
  const db = getDb();
  const items = db.prepare(
    'SELECT id, type, encrypted_data, created_at, updated_at FROM vault_items WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(req.user.id);

  return res.json({ items });
});

/**
 * POST /api/vault/items
 * Create a new vault item.
 */
router.post('/items', (req, res) => {
  const db = getDb();
  const parsed = vaultItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  const { type, encrypted_data } = parsed.data;
  const id = generateId();
  const now = Date.now();

  db.prepare(`
    INSERT INTO vault_items (id, user_id, type, encrypted_data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, type, encrypted_data, now, now);

  auditLog(db, { userId: req.user.id, action: 'VAULT_CREATE', req, details: { itemId: id, type } });

  return res.status(201).json({
    id,
    type,
    encrypted_data,
    created_at: now,
    updated_at: now,
  });
});

/**
 * PUT /api/vault/items/:id
 * Update an existing vault item.
 */
router.put('/items/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid item ID' });
  }

  const parsed = z.object({
    type: z.enum(ITEM_TYPES),
    encrypted_data: z.string().min(32).max(65536),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  const { type, encrypted_data } = parsed.data;
  const now = Date.now();

  const result = db.prepare(`
    UPDATE vault_items SET type = ?, encrypted_data = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(type, encrypted_data, now, id, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Item not found', code: 'ITEM_NOT_FOUND' });
  }

  auditLog(db, { userId: req.user.id, action: 'VAULT_UPDATE', req, details: { itemId: id } });

  return res.json({ id, type, encrypted_data, updated_at: now });
});

/**
 * DELETE /api/vault/items/:id
 * Delete a vault item.
 */
router.delete('/items/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid item ID' });
  }

  const result = db.prepare(
    'DELETE FROM vault_items WHERE id = ? AND user_id = ?'
  ).run(id, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Item not found', code: 'ITEM_NOT_FOUND' });
  }

  auditLog(db, { userId: req.user.id, action: 'VAULT_DELETE', req, details: { itemId: id } });

  return res.status(204).send();
});

/**
 * POST /api/vault/sync
 * Bulk sync: client sends full vault state, server returns merged result.
 * Used for offline-first conflict resolution (last-write-wins per item).
 */
router.post('/sync', (req, res) => {
  const db = getDb();
  const parsed = bulkSyncSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  const { items } = parsed.data;
  const now = Date.now();

  const upsert = db.prepare(`
    INSERT INTO vault_items (id, user_id, type, encrypted_data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      encrypted_data = excluded.encrypted_data,
      updated_at = excluded.updated_at
    WHERE vault_items.user_id = ? AND excluded.updated_at >= vault_items.updated_at
  `);

  withTransaction(() => {
    for (const item of items) {
      upsert.run(
        item.id || generateId(),
        req.user.id,
        item.type,
        item.encrypted_data,
        now,
        now,
        req.user.id
      );
    }
  });

  // Return updated vault
  const serverItems = db.prepare(
    'SELECT id, type, encrypted_data, created_at, updated_at FROM vault_items WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(req.user.id);

  auditLog(db, { userId: req.user.id, action: 'VAULT_SYNC', req, details: { count: items.length } });

  return res.json({ items: serverItems, syncedAt: now });
});

/**
 * GET /api/vault/export
 * Export full encrypted vault as JSON (for backup).
 */
router.get('/export', (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT email, username, kdf_params, protected_symmetric_key FROM users WHERE id = ?').get(req.user.id);
  const items = db.prepare('SELECT id, type, encrypted_data, created_at, updated_at FROM vault_items WHERE user_id = ?').all(req.user.id);

  auditLog(db, { userId: req.user.id, action: 'VAULT_EXPORT', req });

  res.setHeader('Content-Disposition', 'attachment; filename="sanctum-vault-export.json"');
  res.setHeader('Content-Type', 'application/json');
  return res.json({
    version: 1,
    exportedAt: Date.now(),
    user: { email: user.email, username: user.username },
    kdfParams: JSON.parse(user.kdf_params),
    protectedSymmetricKey: user.protected_symmetric_key,
    items,
  });
});

module.exports = router;
