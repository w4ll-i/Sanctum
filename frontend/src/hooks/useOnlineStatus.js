import { useState, useEffect } from 'react';

/**
 * Returns { isOnline } — reactive online/offline status.
 * Also fires a callback when coming back online (for sync).
 */
export function useOnlineStatus(onReconnect) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      onReconnect?.();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onReconnect]);

  return { isOnline };
}
