import PropTypes from 'prop-types';
import { useState } from 'react';
import { errorMessage } from '../../api/client.js';
import { ordersApi } from '../../api/orders.js';

/** Apply Coupon row for the Grand Total panel. `applied` = { code, discountPaise } from /coupons/validate. */
export default function CouponField({ subtotalPaise, applied, onApply, onRemove }) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await ordersApi.validateCoupon(code.trim(), subtotalPaise);
      if (result.valid) {
        onApply(result);
        setCode('');
      } else {
        setMessage(result.message ?? 'This coupon cannot be used');
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (applied) {
    return (
      <div className="flex items-center justify-between py-1.5 text-sm">
        <span className="text-bw-muted">
          Coupon <span className="font-mono text-white">{applied.code}</span> applied
        </span>
        <button type="button" className="btn-ghost px-1 py-0 text-xs" onClick={onRemove}>
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="py-1.5">
      <label htmlFor="coupon-code" className="label">
        Apply Coupon
      </label>
      <div className="flex gap-2">
        <input
          id="coupon-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              apply();
            }
          }}
          maxLength={30}
          placeholder="e.g. BOOK10"
          className="input"
        />
        <button type="button" className="btn-secondary" onClick={apply} disabled={busy || !code.trim()}>
          Apply
        </button>
      </div>
      {message && (
        <p className="mt-1 text-xs text-red-400" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}

CouponField.propTypes = {
  subtotalPaise: PropTypes.number.isRequired,
  applied: PropTypes.shape({ code: PropTypes.string, discountPaise: PropTypes.number }),
  onApply: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
};
