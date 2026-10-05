import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { formatINR } from 'bookworm-shared';
import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { errorCode, errorMessage } from '../../api/client.js';
import { ordersApi } from '../../api/orders.js';
import { BookIcon, CloseIcon } from '../../components/icons.jsx';
import { selectIsRegistered, useAuthStore } from '../../stores/useAuthStore.js';

const TABS = [
  { method: 'CREDIT_CARD', label: 'Credit Card' },
  { method: 'DEBIT_CARD', label: 'Debit card' },
  { method: 'UPI', label: 'UPI' },
  { method: 'WALLET', label: 'Wallet' },
];

/** "4242424242424242" → "4242-4242-4242-4242" (digits only, max 16). */
export function formatCardNumber(value) {
  return value
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1-');
}

/** "12" → "12/", "122028" → "12/2028" */
export function formatExpiry(value) {
  const digits = value.replace(/\D/g, '').slice(0, 6);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

function expiryProblem(expiry, now = new Date()) {
  const match = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(expiry);
  if (!match) return 'Use MM/YYYY';
  const [, month, year] = match.map(Number);
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) return 'This card has expired';
  return null;
}

function validateCard(card) {
  const errors = {};
  if (card.number.replace(/\D/g, '').length !== 16) errors.number = 'Enter the 16-digit card number';
  if (!card.nameOnCard.trim()) errors.nameOnCard = 'Enter the name on the card';
  if (!/^\d{3,4}$/.test(card.cvv)) errors.cvv = 'CVV is 3 or 4 digits';
  const expiry = expiryProblem(card.expiry);
  if (expiry) errors.expiry = expiry;
  return errors;
}

function Field({ id, label, error, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} className="input" aria-invalid={Boolean(error)} {...props} />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

Field.propTypes = { id: PropTypes.string.isRequired, label: PropTypes.string.isRequired, error: PropTypes.string };

const EMPTY_CARD = { number: '', nameOnCard: '', expiry: '', cvv: '' };

/**
 * Mock payment: initiate a session for the PENDING order, then confirm it.
 * Card details live only in component state and the CVV is cleared after every attempt.
 */
export default function PaymentModal({ order, onClose, onPaid, onExpired }) {
  const isRegistered = useAuthStore(selectIsRegistered);
  const tabs = isRegistered ? TABS : TABS.filter((tab) => tab.method !== 'WALLET');
  const [method, setMethod] = useState('CREDIT_CARD');
  const [card, setCard] = useState(EMPTY_CARD);
  const [upiId, setUpiId] = useState('');
  const [errors, setErrors] = useState({});
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [failure, setFailure] = useState(null);
  const [expired, setExpired] = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);

  useEffect(() => {
    if (method !== 'WALLET' || walletBalance !== null) return;
    ordersApi
      .wallet()
      .then((wallet) => setWalletBalance(wallet.walletBalancePaise))
      .catch(() => setWalletBalance(0));
  }, [method, walletBalance]);

  const payable = order.totals.totalPaise;
  const walletShort = method === 'WALLET' && walletBalance !== null && walletBalance < payable;

  const validate = () => {
    if (method === 'CREDIT_CARD' || method === 'DEBIT_CARD') return validateCard(card);
    if (method === 'UPI' && !/^[\w.-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim())) return { upiId: 'Enter a UPI ID like name@okaxis' };
    return {};
  };

  const pay = async (event) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length || walletShort) return;

    setProcessing(true);
    setFailure(null);
    try {
      const session = await ordersApi.initiatePayment(order.id, method);
      const details =
        method === 'UPI'
          ? { upiId: upiId.trim() }
          : method === 'WALLET'
            ? {}
            : { card: { number: card.number, nameOnCard: card.nameOnCard.trim(), expiry: card.expiry, cvv: card.cvv } };
      const result = await ordersApi.confirmPayment({
        sessionId: session.sessionId,
        ...details,
        ...(simulateFailure && { forceFailure: true }),
      });
      if (result.success) onPaid(result);
      else setFailure(result.reason ?? 'Payment declined');
    } catch (error) {
      if (errorCode(error) === 'RESERVATION_EXPIRED') setExpired(true);
      else setFailure(errorMessage(error));
    } finally {
      setCard((current) => ({ ...current, cvv: '' }));
      setProcessing(false);
    }
  };

  const updateCard = (field, value) => setCard((current) => ({ ...current, [field]: value }));

  return (
    <Dialog open onClose={processing ? () => {} : onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/80" aria-hidden />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <DialogPanel className="relative w-full max-w-lg overflow-hidden border border-bw-border bg-bw-surface p-6">
          <BookIcon className="pointer-events-none absolute -right-8 -top-8 h-48 w-48 text-white/5" />
          <div className="flex items-start justify-between">
            <DialogTitle className="text-xl font-semibold">Complete Payment</DialogTitle>
            <button type="button" onClick={onClose} disabled={processing} aria-label="Close" className="p-1 text-bw-muted hover:text-white">
              <CloseIcon />
            </button>
          </div>
          <p className="mt-1 text-bw-muted">
            Payable Amount: <span className="text-lg font-semibold text-white">{order.totals.totalInr}</span>
          </p>
          <p className="text-xs text-bw-subtle">Order {order.orderNumber}</p>

          {expired ? (
            <div role="alert" className="mt-6 space-y-4">
              <p className="text-bw-warning">Your reservation has expired and the books were released. Please check out again.</p>
              <button type="button" className="btn-primary" onClick={onExpired}>
                Back to checkout
              </button>
            </div>
          ) : (
            <form noValidate onSubmit={pay} className="mt-5 space-y-4">
              <div role="tablist" aria-label="Payment method" className="flex border-b border-bw-border">
                {tabs.map((tab) => (
                  <button
                    key={tab.method}
                    type="button"
                    role="tab"
                    aria-selected={method === tab.method}
                    onClick={() => {
                      setMethod(tab.method);
                      setErrors({});
                      setFailure(null);
                    }}
                    className={`px-3 py-2 text-sm ${method === tab.method ? 'border-b-2 border-bw-accent text-white' : 'text-bw-muted hover:text-white'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div role="tabpanel" aria-label={tabs.find((tab) => tab.method === method)?.label}>
                {(method === 'CREDIT_CARD' || method === 'DEBIT_CARD') && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Field
                        id="card-number"
                        label="Card Number"
                        inputMode="numeric"
                        autoComplete="cc-number"
                        placeholder="XXXX-XXXX-XXXX-XXXX"
                        value={card.number}
                        onChange={(event) => updateCard('number', formatCardNumber(event.target.value))}
                        error={errors.number}
                      />
                    </div>
                    <div className="col-span-2">
                      <Field
                        id="card-name"
                        label="Name on Card"
                        autoComplete="cc-name"
                        value={card.nameOnCard}
                        onChange={(event) => updateCard('nameOnCard', event.target.value)}
                        error={errors.nameOnCard}
                      />
                    </div>
                    <Field
                      id="card-cvv"
                      label="CVV"
                      type="password"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      maxLength={4}
                      value={card.cvv}
                      onChange={(event) => updateCard('cvv', event.target.value.replace(/\D/g, '').slice(0, 4))}
                      error={errors.cvv}
                    />
                    <Field
                      id="card-expiry"
                      label="Date of Expiry"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/YYYY"
                      value={card.expiry}
                      onChange={(event) => updateCard('expiry', formatExpiry(event.target.value))}
                      error={errors.expiry}
                    />
                  </div>
                )}
                {method === 'UPI' && (
                  <Field id="upi-id" label="UPI ID" placeholder="name@okaxis" value={upiId} onChange={(event) => setUpiId(event.target.value)} error={errors.upiId} />
                )}
                {method === 'WALLET' && (
                  <div className="space-y-1 text-sm">
                    <p>
                      Wallet balance:{' '}
                      <span className="font-semibold">{walletBalance === null ? 'Loading…' : formatINR(walletBalance)}</span>
                    </p>
                    {walletShort && (
                      <p role="alert" className="text-red-400">
                        Insufficient wallet balance for this order.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {import.meta.env.DEV && (
                <label className="flex items-center gap-2 text-xs text-bw-subtle">
                  <input type="checkbox" checked={simulateFailure} onChange={(event) => setSimulateFailure(event.target.checked)} />
                  Simulate failure (dev only)
                </label>
              )}

              {failure && (
                <p role="alert" className="text-sm text-red-400">
                  {failure}. You can try again.
                </p>
              )}

              <button type="submit" className="btn-primary w-full" disabled={processing || walletShort}>
                {processing ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
                    Processing…
                  </>
                ) : failure ? (
                  'Try again'
                ) : (
                  'Pay Now'
                )}
              </button>
            </form>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}

PaymentModal.propTypes = {
  order: PropTypes.shape({
    id: PropTypes.string.isRequired,
    orderNumber: PropTypes.string.isRequired,
    totals: PropTypes.shape({ totalPaise: PropTypes.number.isRequired, totalInr: PropTypes.string.isRequired }).isRequired,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onPaid: PropTypes.func.isRequired,
  onExpired: PropTypes.func.isRequired,
};
