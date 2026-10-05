import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const PIN_STORAGE_KEY = 'bookworm-pin';

/**
 * The shopper's delivery PIN used for date previews. `source` is 'manual' when typed by the shopper
 * and 'address' when taken from a registered user's default address (a manual PIN is never overwritten).
 */
export const useDeliveryStore = create(
  persist(
    (set) => ({
      pin: null,
      source: null,
      setPin: (pin, source = 'manual') => set({ pin, source }),
      clear: () => set({ pin: null, source: null }),
    }),
    { name: PIN_STORAGE_KEY, storage: createJSONStorage(() => localStorage) },
  ),
);
