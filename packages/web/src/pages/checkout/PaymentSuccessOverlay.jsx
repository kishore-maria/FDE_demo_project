import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import PropTypes from 'prop-types';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { passwordProblem, setPassword } from '../../api/auth.js';
import { errorMessage } from '../../api/client.js';
import { CheckIcon } from '../../components/icons.jsx';
import TextField from '../../components/TextField.jsx';

function ConvertAccount({ onDone }) {
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const found = {};
    const problem = passwordProblem(form.password);
    if (problem) found.password = problem;
    if (form.confirmPassword !== form.password) found.confirmPassword = 'Passwords do not match';
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      await setPassword(form.password, form.confirmPassword);
      toast.success('Your account is ready. Your orders are saved in My Orders.');
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form noValidate onSubmit={submit} className="mt-4 space-y-3 border-t border-bw-border pt-4 text-left" aria-label="Create a password">
      <h3 className="font-semibold">Create a password to save your account</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          id="convert-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(event) => setForm((f) => ({ ...f, password: event.target.value }))}
          error={errors.password}
        />
        <TextField
          id="convert-confirm"
          label="Confirm Password"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(event) => setForm((f) => ({ ...f, confirmPassword: event.target.value }))}
          error={errors.confirmPassword}
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Create account'}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Skip for now
        </button>
      </div>
    </form>
  );
}

ConvertAccount.propTypes = { onDone: PropTypes.func.isRequired };

/** Shown after a successful payment. Guests also get their order number, a tracking link and account creation. */
export default function PaymentSuccessOverlay({ order, isGuest, onClose }) {
  const navigate = useNavigate();
  const [showConvert, setShowConvert] = useState(isGuest);
  const pointsEarned = order.totals?.giftPointsEarned ?? 0;
  const trackLink = `/track-order?orderNumber=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent(order.contactEmail)}`;
  const continueShopping = () => {
    onClose();
    navigate('/');
  };

  return (
    <Dialog open onClose={continueShopping} className="relative z-50">
      <div className="fixed inset-0 bg-black/80" aria-hidden />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <DialogPanel className="w-full max-w-2xl border border-bw-border bg-bw-surface p-6 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-bw-success">
            <CheckIcon className="h-8 w-8" />
          </span>
          <DialogTitle className="mt-4 text-xl font-semibold">Your purchase of the following reads is successful</DialogTitle>

          <ul className="mt-4 grid gap-3 text-left sm:grid-cols-2">
            {order.items.map((item) => (
              <li key={item.id} className="card flex gap-3 p-3">
                <img src={item.coverImageUrl} alt="" className="h-20 w-14 shrink-0 object-cover" />
                <div className="min-w-0">
                  <p className="font-medium">{item.title}</p>
                  {item.authorName && <p className="text-xs text-bw-muted">by {item.authorName}</p>}
                  <p className="text-xs text-bw-subtle">Qty {item.quantity}</p>
                </div>
              </li>
            ))}
          </ul>

          {pointsEarned > 0 && (
            <p className="mt-4 text-sm" data-testid="points-earned">
              You earned <strong>{pointsEarned} gift points</strong> (worth ₹{pointsEarned}) on this order.
              {isGuest && ' Create an account to redeem them on your next order.'}
            </p>
          )}
          {isGuest && (
            <div className="mt-6 space-y-2">
              <div className="mx-auto inline-block border border-bw-border bg-bw-bg-alt px-6 py-3">
                <p className="text-xs text-bw-muted">Order Number</p>
                <p className="font-mono text-2xl font-semibold" data-testid="order-number">
                  {order.orderNumber}
                </p>
              </div>
              <p>
                <Link to={trackLink} onClick={onClose}>
                  Track your order →
                </Link>
              </p>
              {showConvert && <ConvertAccount onDone={() => setShowConvert(false)} />}
            </div>
          )}

          <button type="button" className="btn-primary mt-6" onClick={continueShopping}>
            Continue your Shopping
          </button>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

PaymentSuccessOverlay.propTypes = {
  order: PropTypes.shape({
    orderNumber: PropTypes.string.isRequired,
    contactEmail: PropTypes.string.isRequired,
    items: PropTypes.arrayOf(PropTypes.object).isRequired,
  }).isRequired,
  isGuest: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
