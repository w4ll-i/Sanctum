import { useState } from 'react';
import { Eye, EyeOff, RefreshCw, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { PasswordStrength } from '../ui/PasswordStrength';
import { PasswordGenerator } from './PasswordGenerator';
import { Modal } from '../ui/Modal';

const TYPE_LABELS = { login: 'Login', note: 'Secure Note', card: 'Card', identity: 'Identity' };

function LoginFields({ data, onChange }) {
  const [showPwd, setShowPwd] = useState(false);
  const [showGen, setShowGen] = useState(false);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-sanctum-muted mb-1">Username / Email</label>
        <input
          className="input-base"
          value={data.username || ''}
          onChange={(e) => onChange({ ...data, username: e.target.value })}
          placeholder="user@example.com"
          autoComplete="off"
        />
      </div>

      <div>
        <label className="block text-xs text-sanctum-muted mb-1">Password</label>
        <div className="relative">
          <input
            className="input-base pr-20"
            type={showPwd ? 'text' : 'password'}
            value={data.password || ''}
            onChange={(e) => onChange({ ...data, password: e.target.value })}
            placeholder="••••••••"
            autoComplete="new-password"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="p-1.5 rounded-lg text-sanctum-muted hover:text-sanctum-text hover:bg-sanctum-card transition-all"
            >
              {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button
              type="button"
              onClick={() => setShowGen(true)}
              className="p-1.5 rounded-lg text-sanctum-muted hover:text-sanctum-text hover:bg-sanctum-card transition-all"
              title="Generate password"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
        <PasswordStrength password={data.password} />
      </div>

      <div>
        <label className="block text-xs text-sanctum-muted mb-1">URLs</label>
        {(data.uris || ['']).map((uri, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              className="input-base flex-1"
              value={uri}
              onChange={(e) => {
                const uris = [...(data.uris || [''])];
                uris[i] = e.target.value;
                onChange({ ...data, uris });
              }}
              placeholder="https://example.com"
              autoComplete="off"
            />
            {(data.uris || ['']).length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const uris = (data.uris || ['']).filter((_, j) => j !== i);
                  onChange({ ...data, uris });
                }}
                className="p-2 text-sanctum-muted hover:text-red-400 transition-colors"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...data, uris: [...(data.uris || ['']), ''] })}
          className="text-xs text-sanctum-muted hover:text-sanctum-accent transition-colors flex items-center gap-1"
        >
          <Plus size={13} /> Add URL
        </button>
      </div>

      <div>
        <label className="block text-xs text-sanctum-muted mb-1">Notes</label>
        <textarea
          className="input-base resize-none"
          rows={3}
          value={data.notes || ''}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
          placeholder="Optional notes..."
        />
      </div>

      <Modal isOpen={showGen} onClose={() => setShowGen(false)} title="Password Generator" size="sm">
        <PasswordGenerator
          onUse={(pwd) => {
            onChange({ ...data, password: pwd });
            setShowGen(false);
          }}
        />
      </Modal>
    </div>
  );
}

function NoteFields({ data, onChange }) {
  return (
    <div>
      <label className="block text-xs text-sanctum-muted mb-1">Content</label>
      <textarea
        className="input-base resize-none font-mono text-sm"
        rows={8}
        value={data.content || ''}
        onChange={(e) => onChange({ ...data, content: e.target.value })}
        placeholder="Your secure note..."
        autoComplete="off"
      />
    </div>
  );
}

function CardFields({ data, onChange }) {
  const field = (label, key, placeholder, type = 'text') => (
    <div>
      <label className="block text-xs text-sanctum-muted mb-1">{label}</label>
      <input
        className="input-base"
        type={type}
        value={data[key] || ''}
        onChange={(e) => onChange({ ...data, [key]: e.target.value })}
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {field('Cardholder Name', 'holderName', 'John Doe')}
      {field('Card Number', 'number', '•••• •••• •••• ••••')}
      <div className="grid grid-cols-2 gap-3">
        {field('Expiry', 'expiry', 'MM/YY')}
        {field('CVV', 'cvv', '•••', 'password')}
      </div>
      {field('Notes', 'notes', 'Optional notes...')}
    </div>
  );
}

function IdentityFields({ data, onChange }) {
  const field = (label, key, placeholder) => (
    <div>
      <label className="block text-xs text-sanctum-muted mb-1">{label}</label>
      <input
        className="input-base"
        value={data[key] || ''}
        onChange={(e) => onChange({ ...data, [key]: e.target.value })}
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {field('First Name', 'firstName', 'John')}
        {field('Last Name', 'lastName', 'Doe')}
      </div>
      {field('Email', 'email', 'john@example.com')}
      {field('Phone', 'phone', '+33 6 00 00 00 00')}
      {field('Address', 'address', '123 Main St')}
      <div className="grid grid-cols-2 gap-3">
        {field('City', 'city', 'Paris')}
        {field('Postal Code', 'postalCode', '75001')}
      </div>
      {field('Country', 'country', 'France')}
      {field('Notes', 'notes', 'Optional notes...')}
    </div>
  );
}

// ── Custom Fields ──────────────────────────────────────────────────────────

const CUSTOM_FIELD_TYPES = ['text', 'password', 'boolean'];

function CustomFields({ fields = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [showPwd, setShowPwd] = useState({});

  const update = (i, patch) => {
    const next = fields.map((f, idx) => idx === i ? { ...f, ...patch } : f);
    onChange(next);
  };

  const add = () => {
    onChange([...fields, { name: '', value: '', type: 'text' }]);
    setOpen(true);
  };

  const remove = (i) => onChange(fields.filter((_, idx) => idx !== i));

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-sanctum-muted hover:text-sanctum-text transition-colors mb-2"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        Custom Fields {fields.length > 0 && <span className="text-sanctum-accent">({fields.length})</span>}
      </button>

      {open && (
        <div className="space-y-2">
          {fields.map((field, i) => (
            <div key={i} className="flex gap-2 items-start">
              <div className="flex flex-col gap-1 flex-1">
                <input
                  className="input-base text-xs py-1.5"
                  value={field.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="Field name"
                  autoComplete="off"
                />
                {field.type === 'boolean' ? (
                  <label className="flex items-center gap-2 px-2 py-1.5 text-xs text-sanctum-text cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 accent-sanctum-accent"
                      checked={field.value === 'true'}
                      onChange={(e) => update(i, { value: String(e.target.checked) })}
                    />
                    {field.value === 'true' ? 'True' : 'False'}
                  </label>
                ) : (
                  <div className="relative">
                    <input
                      className="input-base text-xs py-1.5 pr-8"
                      type={field.type === 'password' && !showPwd[i] ? 'password' : 'text'}
                      value={field.value}
                      onChange={(e) => update(i, { value: e.target.value })}
                      placeholder="Value"
                      autoComplete="off"
                    />
                    {field.type === 'password' && (
                      <button
                        type="button"
                        onClick={() => setShowPwd(p => ({ ...p, [i]: !p[i] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-sanctum-muted hover:text-sanctum-text transition-colors"
                      >
                        {showPwd[i] ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <select
                  className="input-base text-xs py-1.5 pr-1"
                  value={field.type}
                  onChange={(e) => update(i, { type: e.target.value, value: '' })}
                >
                  {CUSTOM_FIELD_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="p-1.5 text-sanctum-muted hover:text-red-400 transition-colors self-center"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={add}
            className="text-xs text-sanctum-muted hover:text-sanctum-accent transition-colors flex items-center gap-1"
          >
            <Plus size={13} /> Add custom field
          </button>
        </div>
      )}

      {!open && (
        <button
          type="button"
          onClick={add}
          className="text-xs text-sanctum-muted hover:text-sanctum-accent transition-colors flex items-center gap-1"
        >
          <Plus size={13} /> Add custom field
        </button>
      )}
    </div>
  );
}

const DATA_COMPONENTS = {
  login: LoginFields,
  note: NoteFields,
  card: CardFields,
  identity: IdentityFields,
};

export function ItemForm({ item, onSave, onCancel, isLoading }) {
  const isEdit = Boolean(item?.id);

  const [form, setForm] = useState({
    type: item?.type || 'login',
    name: item?.name || '',
    favorite: item?.favorite || false,
    data: item?.data || {},
  });
  const [error, setError] = useState('');

  const DataFields = DATA_COMPONENTS[form.type];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setError('');
    try {
      await onSave({ ...form, name: form.name.trim() });
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to save');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type selector */}
      {!isEdit && (
        <div>
          <label className="block text-xs text-sanctum-muted mb-1">Type</label>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm({ ...form, type: value, data: {} })}
                className={`text-xs py-2 rounded-xl border transition-all ${
                  form.type === value
                    ? 'bg-sanctum-accent-muted border-sanctum-accent text-sanctum-accent-hover font-medium'
                    : 'border-sanctum-border text-sanctum-muted hover:border-sanctum-border-light hover:text-sanctum-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Name */}
      <div>
        <label className="block text-xs text-sanctum-muted mb-1">Name</label>
        <input
          className="input-base"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Google, Netflix..."
          autoFocus
        />
      </div>

      {/* Type-specific fields */}
      <DataFields
        data={form.data}
        onChange={(data) => setForm({ ...form, data })}
      />

      {/* Custom fields */}
      <CustomFields
        fields={form.data.customFields || []}
        onChange={(customFields) => setForm({ ...form, data: { ...form.data, customFields } })}
      />

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="submit" className="btn-primary flex-1" disabled={isLoading}>
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving...
            </span>
          ) : (
            isEdit ? 'Save Changes' : 'Add Item'
          )}
        </button>
      </div>
    </form>
  );
}

