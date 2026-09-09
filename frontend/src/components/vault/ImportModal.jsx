import { useState, useRef } from 'react';
import { Upload, FileText, AlertTriangle, CheckCircle, Loader2, ChevronDown } from 'lucide-react';
import { useVaultStore } from '../../stores/vault';
import { useToast } from '../../hooks/useToast';

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseBitwarden(json) {
  const data = JSON.parse(json);
  const items = [];

  for (const item of data.items || []) {
    if (item.type === 1) { // Login
      items.push({
        type: 'login',
        name: item.name || 'Imported Login',
        favorite: item.favorite || false,
        data: {
          username: item.login?.username || '',
          password: item.login?.password || '',
          uris: item.login?.uris?.map(u => u.uri).filter(Boolean) || [],
          notes: item.notes || '',
        },
      });
    } else if (item.type === 2) { // Secure note
      items.push({
        type: 'note',
        name: item.name || 'Imported Note',
        favorite: item.favorite || false,
        data: { content: item.notes || '' },
      });
    } else if (item.type === 3) { // Card
      items.push({
        type: 'card',
        name: item.name || 'Imported Card',
        favorite: false,
        data: {
          holderName: item.card?.cardholderName || '',
          number: item.card?.number || '',
          expiry: item.card?.expMonth && item.card?.expYear
            ? `${item.card.expMonth}/${item.card.expYear}`
            : '',
          cvv: item.card?.code || '',
          notes: item.notes || '',
        },
      });
    }
  }
  return items;
}

function parseChromeCSV(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const nameIdx = header.indexOf('name');
  const urlIdx = header.indexOf('url');
  const userIdx = header.indexOf('username');
  const pwdIdx = header.indexOf('password');
  if (pwdIdx === -1) throw new Error('No "password" column found');

  return lines.slice(1).map(line => {
    // Handle quoted commas
    const cols = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(c => c.replace(/^"|"$/g, '')) || [];
    return {
      type: 'login',
      name: cols[nameIdx] || cols[urlIdx] || 'Imported',
      favorite: false,
      data: {
        username: cols[userIdx] || '',
        password: cols[pwdIdx] || '',
        uris: cols[urlIdx] ? [cols[urlIdx]] : [],
        notes: '',
      },
    };
  }).filter(i => i.data.password);
}

function parse1PasswordCSV(csv) {
  // 1Password CSV: Title,Username,Password,URL,Notes,Type
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  return lines.slice(1).map(line => {
    const cols = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(c => c.replace(/^"|"$/g, '')) || [];
    return {
      type: 'login',
      name: cols[0] || 'Imported',
      favorite: false,
      data: {
        username: cols[1] || '',
        password: cols[2] || '',
        uris: cols[3] ? [cols[3]] : [],
        notes: cols[4] || '',
      },
    };
  }).filter(i => i.data.password);
}

const FORMATS = [
  { id: 'bitwarden', label: 'Bitwarden (JSON)', ext: '.json', parser: parseBitwarden },
  { id: 'chrome', label: 'Chrome / Edge (CSV)', ext: '.csv', parser: parseChromeCSV },
  { id: '1password', label: '1Password (CSV)', ext: '.csv', parser: parse1PasswordCSV },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportModal({ onClose }) {
  const { createItem } = useVaultStore();
  const toast = useToast();
  const fileRef = useRef(null);

  const [format, setFormat] = useState(FORMATS[0]);
  const [preview, setPreview] = useState(null); // parsed items before confirming
  const [phase, setPhase] = useState('select'); // select | preview | importing | done
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const items = format.parser(ev.target.result);
        if (items.length === 0) throw new Error('No importable items found');
        setPreview(items);
        setPhase('preview');
      } catch (err) {
        setError(err.message || 'Failed to parse file');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!preview) return;
    setPhase('importing');
    setProgress({ done: 0, total: preview.length });
    let succeeded = 0;

    for (let i = 0; i < preview.length; i++) {
      try {
        await createItem(preview[i]);
        succeeded++;
      } catch {}
      setProgress({ done: i + 1, total: preview.length });
    }

    setPhase('done');
    toast.success(`Imported ${succeeded} of ${preview.length} items`);
  };

  return (
    <div className="space-y-4">
      {/* Format selector */}
      {phase === 'select' && (
        <>
          <div>
            <label className="block text-xs text-sanctum-muted mb-2">Source format</label>
            <div className="space-y-1.5">
              {FORMATS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                    format.id === f.id
                      ? 'bg-sanctum-accent-muted border-sanctum-accent text-sanctum-text'
                      : 'border-sanctum-border text-sanctum-muted hover:border-sanctum-border-light hover:text-sanctum-text'
                  }`}
                >
                  <FileText size={15} />
                  <span className="text-sm">{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-sanctum-border hover:border-sanctum-accent/50 rounded-xl p-8
                       flex flex-col items-center gap-3 cursor-pointer transition-all group"
          >
            <Upload size={24} className="text-sanctum-muted group-hover:text-sanctum-accent transition-colors" />
            <div className="text-center">
              <p className="text-sm text-sanctum-text">Click to select file</p>
              <p className="text-xs text-sanctum-muted mt-1">{format.ext} file</p>
            </div>
          </div>
          <input ref={fileRef} type="file" accept={format.ext} onChange={handleFile} className="hidden" />

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <p className="text-xs text-sanctum-subtle text-center">
            All items will be encrypted with your vault key before being stored.
          </p>
        </>
      )}

      {/* Preview */}
      {phase === 'preview' && preview && (
        <>
          <div className="flex items-center gap-2 p-3 bg-sanctum-surface border border-sanctum-border rounded-xl">
            <CheckCircle size={16} className="text-green-400 shrink-0" />
            <p className="text-sm text-sanctum-text">
              <span className="font-semibold">{preview.length} items</span> ready to import
            </p>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-0.5 border border-sanctum-border rounded-xl p-2">
            {preview.slice(0, 50).map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sanctum-card">
                <span className="text-xs px-1.5 py-0.5 bg-sanctum-accent/10 text-sanctum-accent rounded capitalize">{item.type}</span>
                <span className="text-sm text-sanctum-text truncate">{item.name}</span>
              </div>
            ))}
            {preview.length > 50 && (
              <p className="text-xs text-sanctum-muted text-center py-2">…and {preview.length - 50} more</p>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setPhase('select')} className="btn-secondary flex-1 text-sm">Back</button>
            <button onClick={handleImport} className="btn-primary flex-1 text-sm">
              Import {preview.length} items
            </button>
          </div>
        </>
      )}

      {/* Importing */}
      {phase === 'importing' && (
        <div className="py-4 space-y-4">
          <div className="flex items-center justify-center gap-3">
            <Loader2 size={20} className="animate-spin text-sanctum-accent" />
            <p className="text-sm text-sanctum-text">Encrypting and importing…</p>
          </div>
          <div>
            <div className="flex justify-between text-xs text-sanctum-muted mb-1">
              <span>{progress.done} / {progress.total}</span>
              <span>{Math.round((progress.done / progress.total) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-sanctum-border rounded-full overflow-hidden">
              <div
                className="h-full bg-sanctum-accent rounded-full transition-all"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Done */}
      {phase === 'done' && (
        <div className="py-4 space-y-4 text-center">
          <CheckCircle size={32} className="text-green-400 mx-auto" />
          <p className="text-sm font-medium text-sanctum-text">Import complete!</p>
          <p className="text-xs text-sanctum-muted">{progress.done} items added to your vault.</p>
          <button onClick={onClose} className="btn-primary w-full text-sm">Done</button>
        </div>
      )}
    </div>
  );
}

