import { useEffect } from 'react';

/**
 * Register global keyboard shortcuts.
 * Skips when focus is inside an input/textarea to avoid interfering with typing.
 */
export function useKeyboardShortcuts(shortcuts) {
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;

      const isMod = e.ctrlKey || e.metaKey;

      for (const { key, mod = false, allowInInput = false, action } of shortcuts) {
        if (mod !== isMod) continue;
        if (e.key.toLowerCase() !== key.toLowerCase()) continue;
        if (isTyping && !allowInInput) continue;

        e.preventDefault();
        action(e);
        break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}
