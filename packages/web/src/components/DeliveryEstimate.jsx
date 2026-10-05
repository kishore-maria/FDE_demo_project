import { GENERIC_DELIVERY_TEXT, estimateDelivery, isServiceablePin } from 'bookworm-shared';
import PropTypes from 'prop-types';
import { useEffect, useId, useState } from 'react';
import { useDeliveryStore } from '../stores/useDeliveryStore.js';

const PIN_PATTERN = /^\d{6}$/;

/** "2 h 15 m" / "45 m" until the dispatch cutoff. */
export function formatCountdown(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} m` : `${minutes} m`;
}

/** Re-renders every minute so countdowns and "today" stay current. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** PIN input with validation; calls onSave only for serviceable PINs. */
export function PinForm({ initialPin = '', onSave, onCancel, autoFocus = false }) {
  const id = useId();
  const [value, setValue] = useState(initialPin);
  const [error, setError] = useState(null);

  const submit = (event) => {
    event.preventDefault();
    if (!PIN_PATTERN.test(value)) return setError('Enter a 6-digit PIN');
    if (!isServiceablePin(value)) return setError(`Sorry, we don't deliver to ${value} yet`);
    setError(null);
    onSave(value);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-1" aria-label="PIN check">
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          Delivery PIN
        </label>
        <input
          id={id}
          className="input w-32"
          inputMode="numeric"
          maxLength={6}
          placeholder="PIN code"
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => {
            setValue(event.target.value.replace(/\D/g, ''));
            setError(null);
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button type="submit" className="btn-secondary">
          Check
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}

PinForm.propTypes = {
  initialPin: PropTypes.string,
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func,
  autoFocus: PropTypes.bool,
};

/** One-line delivery text for cards and cart lines: dated once a PIN is known, otherwise the server's generic text. */
export function DeliveryText({ format, fallback = GENERIC_DELIVERY_TEXT, className = 'text-xs text-bw-success' }) {
  const pin = useDeliveryStore((state) => state.pin);
  const digital = format === 'EBOOK';
  const text = digital || pin ? estimateDelivery({ pin, digital }).text : fallback;
  return <p className={className}>{text}</p>;
}

DeliveryText.propTypes = { format: PropTypes.string.isRequired, fallback: PropTypes.string, className: PropTypes.string };

/** Book detail: asks for a PIN, then shows the date, the zone, a dispatch countdown and a way to change the PIN. */
export function DeliveryCheck({ format }) {
  const pin = useDeliveryStore((state) => state.pin);
  const setPin = useDeliveryStore((state) => state.setPin);
  const [editing, setEditing] = useState(false);
  const now = useNow();

  if (format === 'EBOOK') return <p className="text-sm text-bw-success">Instant download</p>;

  if (!pin || editing) {
    return (
      <div className="space-y-1" aria-label="Check delivery">
        <p className="text-sm text-bw-muted">{pin ? 'Change delivery PIN' : 'Check the delivery date for your PIN'}</p>
        <PinForm
          initialPin={pin ?? ''}
          autoFocus={editing}
          onSave={(value) => {
            setPin(value);
            setEditing(false);
          }}
          onCancel={editing ? () => setEditing(false) : undefined}
        />
      </div>
    );
  }

  const estimate = estimateDelivery({ pin, now });
  return (
    <div className="space-y-0.5 text-sm" aria-label="Delivery estimate">
      <p className="text-bw-success">
        {estimate.text} to <span className="font-semibold">{pin}</span>{' '}
        <button type="button" className="btn-ghost px-1 py-0 text-xs" onClick={() => setEditing(true)}>
          Change
        </button>
      </p>
      {estimate.cutoffAt && (
        <p className="text-xs text-bw-muted">Order within {formatCountdown(estimate.cutoffAt - now)} to ship today</p>
      )}
    </div>
  );
}

DeliveryCheck.propTypes = { format: PropTypes.string.isRequired };

/** Checkout summary: preview for the PIN in the address form; the server commits the date at payment. */
export function DeliveryPreview({ pin, digital = false }) {
  const now = useNow();
  if (digital) return <p className="text-sm text-bw-success">Instant download</p>;
  if (!PIN_PATTERN.test(pin ?? '')) {
    return <p className="text-sm text-bw-muted">Enter your PIN to see the delivery date</p>;
  }
  const estimate = estimateDelivery({ pin, now });
  if (!estimate.serviceable) {
    return (
      <p role="alert" className="text-sm text-red-400">
        Sorry, we don&apos;t deliver to PIN {pin} yet
      </p>
    );
  }
  return (
    <div className="text-sm">
      <p className="text-bw-success">
        {estimate.text} <span className="text-bw-subtle">({estimate.label})</span>
      </p>
      {estimate.cutoffAt && (
        <p className="text-xs text-bw-muted">Pay within {formatCountdown(estimate.cutoffAt - now)} to ship today</p>
      )}
    </div>
  );
}

DeliveryPreview.propTypes = { pin: PropTypes.string, digital: PropTypes.bool };
