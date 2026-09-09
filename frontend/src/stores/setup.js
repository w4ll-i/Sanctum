import { create } from 'zustand';

export const useSetupStore = create((set) => ({
  status: 'loading',   // 'loading' | 'needed' | 'done'
  instanceName: 'Sanctum',
  setSetup: ({ done, instanceName }) =>
    set({
      status: done ? 'done' : 'needed',
      instanceName: instanceName || 'Sanctum',
    }),
}));
