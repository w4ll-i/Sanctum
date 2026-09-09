import { useState, useCallback } from 'react';
import { RefreshCw, Copy, Check, Sliders } from 'lucide-react';
import { generatePassword, scorePassword } from '../../crypto/vault';
import { PasswordStrength } from '../ui/PasswordStrength';
import { useClipboard } from '../../hooks/useClipboard';

const PRESETS = [
  { label: '12', value: 12 },
  { label: '16', value: 16 },
  { label: '20', value: 20 },
  { label: '32', value: 32 },
];

export function PasswordGenerator({ onUse }) {
  const [options, setOptions] = useState({
    length: 20,
    lowercase: true,
    uppercase: true,
    digits: true,
    symbols: true,
    excludeAmbiguous: false,
  });
  const [password, setPassword] = useState(() => generatePassword({ length: 20, lowercase: true, uppercase: true, digits: true, symbols: true }));
  const { copy, copiedId } = useClipboard();

  const regenerate = useCallback(() => {
    setPassword(generatePassword(options));
  }, [options]);

  const toggle = (key) => {
    setOptions((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      setPassword(generatePassword(next));
      return next;
    });
  };

  const setLength = (length) => {
    const next = { ...options, length };
    setOptions(next);
    setPassword(generatePassword(next));
  };

  return (
    <div className="space-y-4">
      {/* Generated password display */}
      <div className="relative">
        <div className="bg-sanctum-bg border border-sanctum-border rounded-xl px-4 py-3 pr-20 font-mono text-sm text-sanctum-text break-all min-h-[52px] select-all">
          {password}
        </div>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
          <button
            onClick={regenerate}
            className="p-2 rounded-lg text-sanctum-muted hover:text-sanctum-text hover:bg-sanctum-card transition-all"
            title="Generate new"
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={() => copy(password, 'gen')}
            className="p-2 rounded-lg text-sanctum-muted hover:text-sanctum-text hover:bg-sanctum-card transition-all"
            title="Copy"
          >
            {copiedId === 'gen' ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
          </button>
        </div>
      </div>

      <PasswordStrength password={password} />

      {/* Length presets */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-sanctum-muted">Length</span>
          <span className="text-xs font-mono text-sanctum-accent">{options.length}</span>
        </div>
        <input
          type="range"
          min="8"
          max="64"
          value={options.length}
          onChange={(e) => setLength(parseInt(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                     [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                     [&::-webkit-slider-thumb]:bg-sanctum-accent [&::-webkit-slider-thumb]:cursor-pointer
                     bg-sanctum-border accent-sanctum-accent"
        />
        <div className="flex gap-2 mt-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setLength(p.value)}
              className={`flex-1 text-xs py-1 rounded-lg border transition-all ${
                options.length === p.value
                  ? 'bg-sanctum-accent-muted border-sanctum-accent text-sanctum-accent-hover'
                  : 'border-sanctum-border text-sanctum-muted hover:border-sanctum-border-light hover:text-sanctum-text'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Character options */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { key: 'lowercase', label: 'Lowercase (a-z)' },
          { key: 'uppercase', label: 'Uppercase (A-Z)' },
          { key: 'digits', label: 'Numbers (0-9)' },
          { key: 'symbols', label: 'Symbols (!@#...)' },
          { key: 'excludeAmbiguous', label: 'Exclude ambiguous' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer group">
            <div
              onClick={() => toggle(key)}
              className={`w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0 ${
                options[key]
                  ? 'bg-sanctum-accent border-sanctum-accent'
                  : 'border-sanctum-border group-hover:border-sanctum-border-light'
              }`}
            >
              {options[key] && (
                <svg viewBox="0 0 10 8" fill="none" className="w-2.5 h-2">
                  <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="text-xs text-sanctum-muted group-hover:text-sanctum-text transition-colors">{label}</span>
          </label>
        ))}
      </div>

      {onUse && (
        <button
          onClick={() => onUse(password)}
          className="btn-primary w-full text-sm"
        >
          Use this password
        </button>
      )}
    </div>
  );
}

