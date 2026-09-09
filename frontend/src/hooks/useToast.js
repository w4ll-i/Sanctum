import { create } from 'zustand';

let toastId = 0;

export const useToastStore = create((set) => ({
  toasts: [],
  add: (toast) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, ...toast }] }));
    const duration = toast.duration ?? (toast.type === 'error' ? 5000 : 3000);
    if (duration > 0) {
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), duration);
    }
    return id;
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function useToast() {
  const { add } = useToastStore();
  return {
    success: (message) => add({ type: 'success', message }),
    error: (message) => add({ type: 'error', message }),
    info: (message) => add({ type: 'info', message }),
    warning: (message) => add({ type: 'warning', message }),
  };
}
