import { useState, useRef } from 'react';

const CLEAR_DELAY = 30000; // 30 seconds auto-clear

/**
 * Secure clipboard hook — automatically clears clipboard after delay.
 */
export function useClipboard() {
  const [copiedId, setCopiedId] = useState(null);
  const clearTimer = useRef(null);

  const copy = async (text, id = 'default') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);

      // Clear clipboard after delay
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(async () => {
        try {
          // Only clear if our value is still there
          const current = await navigator.clipboard.readText();
          if (current === text) {
            await navigator.clipboard.writeText('');
          }
        } catch {}
        setCopiedId(null);
      }, CLEAR_DELAY);

      // Reset "copied" indicator after 2s
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);

      return true;
    } catch {
      return false;
    }
  };

  return { copy, copiedId };
}
