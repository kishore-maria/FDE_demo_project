import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { useEffect } from 'react';
import { ordersApi } from '../api/orders.js';
import { selectIsRegistered, useAuthStore } from '../stores/useAuthStore.js';
import { useDeliveryStore } from '../stores/useDeliveryStore.js';
import { PinForm } from './DeliveryEstimate.jsx';

/** Navbar "Deliver to" control; registered users default to their default address PIN. */
export default function DeliverTo() {
  const pin = useDeliveryStore((state) => state.pin);
  const setPin = useDeliveryStore((state) => state.setPin);
  const isRegistered = useAuthStore(selectIsRegistered);

  useEffect(() => {
    if (!isRegistered || pin) return;
    let active = true;
    ordersApi
      .addresses()
      .then((addresses) => {
        const preferred = addresses.find((address) => address.isDefault) ?? addresses[0];
        if (active && preferred && !useDeliveryStore.getState().pin) setPin(preferred.pin, 'address');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isRegistered, pin, setPin]);

  return (
    <Popover className="relative">
      <PopoverButton
        className="flex flex-col items-start px-2 py-1 text-left leading-tight text-white hover:bg-bw-surface"
        aria-label={pin ? `Deliver to ${pin}, change PIN` : 'Enter delivery PIN'}
      >
        <span className="text-[11px] text-bw-muted">Deliver to</span>
        <span className="text-sm font-semibold">{pin ?? 'Enter PIN'}</span>
      </PopoverButton>
      <PopoverPanel anchor="bottom end" className="z-40 mt-1 w-72 border border-bw-border bg-bw-surface p-4 shadow-lg">
        {({ close }) => (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Where should we deliver?</p>
            <p className="text-xs text-bw-muted">Delivery dates across the store use this PIN.</p>
            <PinForm
              initialPin={pin ?? ''}
              autoFocus
              onSave={(value) => {
                setPin(value);
                close();
              }}
            />
          </div>
        )}
      </PopoverPanel>
    </Popover>
  );
}
