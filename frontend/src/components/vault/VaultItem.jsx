import { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, Eye, EyeOff, Edit2, Trash2, Star, ExternalLink, Key, FileText, CreditCard, User } from 'lucide-react';
import { useVaultStore } from '../../stores/vault';
import { useClipboard } from '../../hooks/useClipboard';
import { useToast } from '../../hooks/useToast';
import { Modal } from '../ui/Modal';
import { ItemForm } from './ItemForm';

const TYPE_ICONS = {
  login: Key,
  note: FileText,
  card: CreditCard,
  identity: User,
};

const TYPE_COLORS = {
  login: 'text-blue-400 bg-blue-500/10',
  note: 'text-yellow-400 bg-yellow-500/10',
  card: 'text-green-400 bg-green-500/10',
  identity: 'text-purple-400 bg-purple-500/10',
};

function FieldRow({ label, value, isSensitive = false, copyId }) {
  const [visible, setVisible] = useState(false);
  const { copy, copiedId } = useClipboard();

  if (!value) return null;

  return (
    <div className="group flex items-center justify-between py-2.5 border-b border-sanctum-border last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-sanctum-muted mb-0.5">{label}</p>
        <p className={`text-sm text-sanctum-text truncate font-${isSensitive ? 'mono' : 'sans'}`}>
          {isSensitive && !visible ? '•'.repeat(Math.min(value.length, 24)) : value}
        </p>
      </div>
      <div className="flex items-center gap-1 ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
        {isSensitive && (
          <button
            onClick={() => setVisible(!visible)}
            className="p-1.5 rounded-lg text-sanctum-muted hover:text-sanctum-text hover:bg-sanctum-card transition-all"
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
        <button
          onClick={() => copy(value, copyId)}
          className="p-1.5 rounded-lg text-sanctum-muted hover:text-sanctum-text hover:bg-sanctum-card transition-all"
        >
          {copiedId === copyId ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

export function VaultItemDetail({ item }) {
  const { updateItem, deleteItem, toggleFavorite } = useVaultStore();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const Icon = TYPE_ICONS[item.type] || Key;
  const colorClass = TYPE_COLORS[item.type] || TYPE_COLORS.login;

  const handleSave = async (formData) => {
    setSaving(true);
    try {
      await updateItem(item.id, formData);
      setEditing(false);
      toast.success('Item updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      await deleteItem(item.id);
      toast.success('Item deleted');
    } catch {
      toast.error('Failed to delete item');
    }
  };

  const renderFields = () => {
    const d = item.data || {};
    switch (item.type) {
      case 'login':
        return (
          <>
            {d.username && <FieldRow label="Username" value={d.username} copyId="username" />}
            {d.password && <FieldRow label="Password" value={d.password} isSensitive copyId="password" />}
            {d.uris?.filter(Boolean).map((uri, i) => (
              <div key={i} className="group flex items-center justify-between py-2.5 border-b border-sanctum-border last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-sanctum-muted mb-0.5">URL {d.uris.length > 1 ? i + 1 : ''}</p>
                  <p className="text-sm text-sanctum-accent truncate">{uri}</p>
                </div>
                <a
                  href={uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-sanctum-muted hover:text-sanctum-text hover:bg-sanctum-card ml-3"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            ))}
            {d.notes && <FieldRow label="Notes" value={d.notes} copyId="notes" />}
          </>
        );
      case 'note':
        return (
          <div className="py-2">
            <p className="text-xs text-sanctum-muted mb-2">Content</p>
            <pre className="text-sm text-sanctum-text whitespace-pre-wrap font-mono bg-sanctum-bg rounded-xl p-3 overflow-auto max-h-64">
              {d.content}
            </pre>
          </div>
        );
      case 'card':
        return (
          <>
            {d.holderName && <FieldRow label="Cardholder" value={d.holderName} copyId="holder" />}
            {d.number && <FieldRow label="Card Number" value={d.number} isSensitive copyId="cardnum" />}
            {d.expiry && <FieldRow label="Expiry" value={d.expiry} copyId="expiry" />}
            {d.cvv && <FieldRow label="CVV" value={d.cvv} isSensitive copyId="cvv" />}
            {d.notes && <FieldRow label="Notes" value={d.notes} copyId="notes" />}
          </>
        );
      case 'identity':
        return (
          <>
            {(d.firstName || d.lastName) && <FieldRow label="Name" value={[d.firstName, d.lastName].filter(Boolean).join(' ')} copyId="name" />}
            {d.email && <FieldRow label="Email" value={d.email} copyId="email" />}
            {d.phone && <FieldRow label="Phone" value={d.phone} copyId="phone" />}
            {d.address && <FieldRow label="Address" value={d.address} copyId="addr" />}
            {(d.city || d.postalCode) && <FieldRow label="City" value={[d.city, d.postalCode].filter(Boolean).join(' ')} copyId="city" />}
            {d.country && <FieldRow label="Country" value={d.country} copyId="country" />}
            {d.notes && <FieldRow label="Notes" value={d.notes} copyId="notes" />}
          </>
        );
      default:
        return null;
    }
  };

  const renderCustomFields = () => {
    const fields = item.data?.customFields;
    if (!fields?.length) return null;
    return (
      <div className="mt-1 pt-2 border-t border-sanctum-border">
        <p className="text-xs text-sanctum-muted mb-1 uppercase tracking-wider font-semibold">Custom Fields</p>
        {fields.map((f, i) => (
          f.type === 'boolean'
            ? (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-sanctum-border last:border-0">
                <p className="text-xs text-sanctum-muted">{f.name || `Field ${i + 1}`}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${f.value === 'true' ? 'bg-green-500/10 text-green-400' : 'bg-sanctum-card text-sanctum-muted'}`}>
                  {f.value === 'true' ? 'True' : 'False'}
                </span>
              </div>
            )
            : (
              <FieldRow
                key={i}
                label={f.name || `Field ${i + 1}`}
                value={f.value}
                isSensitive={f.type === 'password'}
                copyId={`custom-${i}`}
              />
            )
        ))}
      </div>
    );
  };

  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="px-6 py-5 border-b border-sanctum-border">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClass}`}>
              <Icon size={18} />
            </div>
            <div>
              <h2 className="font-semibold text-sanctum-text">{item.name}</h2>
              <p className="text-xs text-sanctum-muted capitalize">{item.type}</p>
            </div>
          </div>
          <button
            onClick={() => toggleFavorite(item)}
            className={`p-2 rounded-xl transition-all ${
              item.favorite
                ? 'text-yellow-400 bg-yellow-500/10'
                : 'text-sanctum-muted hover:text-yellow-400 hover:bg-yellow-500/10'
            }`}
          >
            <Star size={16} fill={item.favorite ? 'currentColor' : 'none'} />
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"
          >
            <Edit2 size={13} /> Edit
          </button>
          <button
            onClick={handleDelete}
            className={`text-xs flex items-center gap-1.5 py-1.5 px-3 rounded-xl border transition-all ${
              confirmDelete
                ? 'bg-red-500/20 border-red-500/40 text-red-400'
                : 'border-sanctum-border text-sanctum-muted hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10'
            }`}
          >
            <Trash2 size={13} />
            {confirmDelete ? 'Confirm?' : 'Delete'}
          </button>
          {confirmDelete && (
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-sanctum-muted hover:text-sanctum-text transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Fields */}
      <div className="flex-1 px-6 py-4 overflow-y-auto">
        {renderFields()}
        {renderCustomFields()}
        <div className="mt-4 pt-3 border-t border-sanctum-border space-y-1">
          <p className="text-xs text-sanctum-subtle">
            Created {new Date(item.createdAt).toLocaleDateString()}
          </p>
          <p className="text-xs text-sanctum-subtle">
            Modified {new Date(item.updatedAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Edit modal */}
      <Modal isOpen={editing} onClose={() => setEditing(false)} title="Edit Item" size="md">
        <ItemForm
          item={item}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
          isLoading={saving}
        />
      </Modal>
    </motion.div>
  );
}

export function VaultItemRow({ item, isSelected, onClick }) {
  const Icon = TYPE_ICONS[item.type] || Key;
  const colorClass = TYPE_COLORS[item.type] || TYPE_COLORS.login;

  const subtitle = (() => {
    if (item.type === 'login') return item.data?.username || item.data?.uris?.[0] || '';
    if (item.type === 'card') return item.data?.holderName || '';
    if (item.type === 'identity') return [item.data?.firstName, item.data?.lastName].filter(Boolean).join(' ');
    return '';
  })();

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${
        isSelected
          ? 'bg-sanctum-accent-muted border border-sanctum-accent/30'
          : 'hover:bg-sanctum-card border border-transparent'
      }`}
    >
      <div className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center ${colorClass}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-sanctum-text truncate">{item.name}</p>
          {item.favorite && <Star size={11} className="text-yellow-400 shrink-0" fill="currentColor" />}
        </div>
        {subtitle && <p className="text-xs text-sanctum-muted truncate">{subtitle}</p>}
      </div>
    </button>
  );
}

