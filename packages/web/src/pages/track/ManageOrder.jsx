import PropTypes from 'prop-types';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { claimGuestAccount, passwordProblem } from '../../api/auth.js';
import { errorCode, errorMessage } from '../../api/client.js';
import { orderAccessApi, ordersApi } from '../../api/orders.js';
import TextField from '../../components/TextField.jsx';
import AddressDialog from '../orders/AddressDialog.jsx';
import OrderActions from '../orders/OrderActions.jsx';

const WRONG_PHONE = "Those digits don't match the phone number on this order.";
const RATE_LIMITED = 'Too many attempts. Please wait a few minutes and try again.';
const EXPIRED = 'Your access to this order has expired. Verify again to continue.';

function verifyError(err) {
  const status = err.response?.status;
  if (status === 404) return WRONG_PHONE;
  if (status === 429) return RATE_LIMITED;
  return errorMessage(err);
}

/** Makes every call report an expired order token (401) to `onExpired` before rethrowing. */
function guard(client, onExpired) {
  return Object.fromEntries(
    Object.entries(client).map(([name, call]) => [
      name,
      (...args) =>
        call(...args).catch((err) => {
          if (err.response?.status === 401) onExpired();
          throw err;
        }),
    ]),
  );
}

function VerifyForm({ email, orderNumber, onVerified }) {
  const [phoneLast4, setPhoneLast4] = useState('');
  const [error, setError] = useState(null);
  const [accountOrder, setAccountOrder] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(phoneLast4)) {
      setError('Enter the last 4 digits');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      onVerified(await ordersApi.verifyAccess(email, orderNumber, phoneLast4));
    } catch (err) {
      if (errorCode(err) === 'ACCOUNT_ORDER') setAccountOrder(true);
      else setError(verifyError(err));
      setLoading(false);
    }
  };

  if (accountOrder) {
    return (
      <p role="alert" className="text-sm text-bw-muted">
        This order belongs to a BookWorm account.{' '}
        <Link to={`/login?redirect=${encodeURIComponent('/orders')}`} className="text-bw-link hover:underline">
          Log in
        </Link>{' '}
        to manage it.
      </p>
    );
  }

  return (
    <form noValidate onSubmit={submit} aria-label="Verify order" className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
      <TextField
        id="manage-phone"
        label="Last 4 digits of the phone number on the order"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={phoneLast4}
        onChange={(event) => setPhoneLast4(event.target.value.replace(/\D/g, ''))}
        error={error ?? undefined}
      />
      <button type="submit" className="btn-secondary sm:mt-6" disabled={loading}>
        {loading ? 'Checking…' : 'Verify'}
      </button>
    </form>
  );
}

VerifyForm.propTypes = {
  email: PropTypes.string.isRequired,
  orderNumber: PropTypes.string.isRequired,
  onVerified: PropTypes.func.isRequired,
};

function GiftPoints({ earned, balance }) {
  return (
    <section aria-label="Gift points" className="border border-bw-border bg-bw-bg-alt p-3 text-sm">
      {earned > 0 && (
        <p>
          This order earned <strong>{earned} gift points</strong>.
        </p>
      )}
      {balance > 0 ? (
        <p className="text-bw-muted">
          You have {balance} gift points (worth ₹{balance}) waiting. Create an account to redeem them on your next order.
        </p>
      ) : (
        <p className="text-bw-muted">Create an account to collect and redeem gift points on future orders.</p>
      )}
    </section>
  );
}

GiftPoints.propTypes = { earned: PropTypes.number.isRequired, balance: PropTypes.number.isRequired };

function ClaimAccount({ token, orderId, balance }) {
  const navigate = useNavigate();
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
      await claimGuestAccount(token, form.password, form.confirmPassword);
      toast.success('Your account is ready. Your orders and gift points are saved.');
      navigate(`/orders/${orderId}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form noValidate onSubmit={submit} aria-label="Create your account" className="space-y-3 border-t border-bw-border pt-4">
      <h3 className="font-semibold">Create your account</h3>
      <p className="text-sm text-bw-muted">
        Set a password to see all your orders in one place{balance > 0 ? ` and use your ${balance} gift points` : ''}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          id="manage-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(event) => setForm((f) => ({ ...f, password: event.target.value }))}
          error={errors.password}
        />
        <TextField
          id="manage-confirm"
          label="Confirm Password"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(event) => setForm((f) => ({ ...f, confirmPassword: event.target.value }))}
          error={errors.confirmPassword}
        />
      </div>
      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}

ClaimAccount.propTypes = {
  token: PropTypes.string.isRequired,
  orderId: PropTypes.string.isRequired,
  balance: PropTypes.number.isRequired,
};

/**
 * Track Order → "Manage this order" for guests: verify with the phone's last 4 digits to get a 30-minute
 * order token, then change the address, cancel or return, see gift points and claim the account.
 * `onOrderChange` receives the full order whenever it is loaded or updated.
 */
export default function ManageOrder({ email, orderNumber, onOrderChange }) {
  const [access, setAccess] = useState(null);
  const [expired, setExpired] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);

  const client =
    access &&
    guard(orderAccessApi(access.token), () => {
      setAccess(null);
      setEditingAddress(false);
      setExpired(true);
    });

  const verified = (result) => {
    setExpired(false);
    setAccess(result);
    onOrderChange(result.order);
  };

  const updated = (order) => {
    setAccess((current) => {
      // Cancelling takes back the points this order earned (never below zero), as the API does.
      const cancelledNow = order.status === 'CANCELLED' && current.order.status !== 'CANCELLED';
      const giftPoints = cancelledNow ? Math.max(0, current.giftPoints - order.totals.giftPointsEarned) : current.giftPoints;
      return { ...current, order, giftPoints };
    });
    onOrderChange(order);
  };

  const order = access?.order;
  const address = order?.shippingAddress;
  const nothingToChange = order && !order.flags.canCancel && !order.flags.canReturn && !order.flags.canModifyAddress;

  return (
    <section className="card mt-6 space-y-4 p-5" aria-label="Manage this order">
      <h2 className="text-lg font-semibold">Manage this order</h2>

      {!access && (
        <>
          {expired && (
            <p role="status" className="text-sm text-bw-warning">
              {EXPIRED}
            </p>
          )}
          <p className="text-sm text-bw-muted">
            Ordered as a guest? Confirm the last 4 digits of the phone number on the order to change the address, cancel or
            return it — and to create your account.
          </p>
          <VerifyForm email={email} orderNumber={orderNumber} onVerified={verified} />
        </>
      )}

      {access && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
            <address className="not-italic text-bw-muted" aria-label="Delivery address">
              <span className="block text-white">
                {address.firstName} {address.lastName}
              </span>
              <span className="block">{address.line1}</span>
              {address.line2 && <span className="block">{address.line2}</span>}
              <span className="block">
                {address.city} {address.pin}, {address.state}
              </span>
            </address>
            {order.flags.canModifyAddress && (
              <button type="button" className="text-sm text-bw-link hover:underline" onClick={() => setEditingAddress(true)}>
                Change address
              </button>
            )}
          </div>

          <OrderActions order={order} onUpdated={updated} client={client} showBuyAgain={false} />
          {nothingToChange && <p className="text-sm text-bw-muted">This order can no longer be changed online.</p>}

          <GiftPoints earned={order.totals.giftPointsEarned} balance={access.giftPoints} />

          {order.confirmedAt ? (
            <ClaimAccount token={access.token} orderId={order.id} balance={access.giftPoints} />
          ) : (
            <p className="text-sm text-bw-muted">You can create your account once this order is paid.</p>
          )}

          {editingAddress && (
            <AddressDialog
              order={order}
              updateAddress={client.updateAddress}
              onClose={() => setEditingAddress(false)}
              onSaved={(next) => {
                updated(next);
                setEditingAddress(false);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}

ManageOrder.propTypes = {
  email: PropTypes.string.isRequired,
  orderNumber: PropTypes.string.isRequired,
  onOrderChange: PropTypes.func.isRequired,
};
