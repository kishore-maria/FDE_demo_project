import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { errorCode, errorMessage } from '../api/client.js';
import { ordersApi } from '../api/orders.js';
import AddressForm, { EMPTY_ADDRESS } from '../components/AddressForm.jsx';
import Breadcrumb from '../components/Breadcrumb.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import OrderSummaryPanel from '../components/OrderSummaryPanel.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { selectIsGuest, selectIsRegistered, useAuthStore } from '../stores/useAuthStore.js';
import { cartTotals, useCartStore } from '../stores/useCartStore.js';
import CartItems from './checkout/CartItems.jsx';
import CouponField from './checkout/CouponField.jsx';
import GuestGate from './checkout/GuestGate.jsx';
import PaymentModal from './checkout/PaymentModal.jsx';
import PaymentSuccessOverlay from './checkout/PaymentSuccessOverlay.jsx';

const ADDRESS_FIELDS = Object.keys(EMPTY_ADDRESS);
const pickAddress = (address) => Object.fromEntries(ADDRESS_FIELDS.map((key) => [key, address?.[key] ?? '']));

function SavedAddressPicker({ addresses, selectedId, onSelect }) {
  if (addresses.length === 0) return null;
  return (
    <div className="mb-4">
      <label htmlFor="saved-address" className="label">
        Use Saved Address
      </label>
      <select id="saved-address" className="input" value={selectedId} onChange={(event) => onSelect(event.target.value)}>
        <option value="">Enter a new address</option>
        {addresses.map((address) => (
          <option key={address.id} value={address.id}>
            {`${address.firstName} ${address.lastName}, ${address.line1}, ${address.city} ${address.pin}${address.isDefault ? ' (default)' : ''}`}
          </option>
        ))}
      </select>
    </div>
  );
}

SavedAddressPicker.propTypes = {
  addresses: PropTypes.arrayOf(PropTypes.object).isRequired,
  selectedId: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
};

export default function CheckoutPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const isRegistered = useAuthStore(selectIsRegistered);
  const items = useCartStore((state) => state.items);
  const cartLoading = useCartStore((state) => state.loading);
  const fetchCart = useCartStore((state) => state.fetch);

  const [coupon, setCoupon] = useState(null);
  const [usePoints, setUsePoints] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState(null);
  const [paid, setPaid] = useState(null);
  const isGuest = useAuthStore(selectIsGuest);

  const saved = useAsync(() => (isRegistered ? ordersApi.addresses() : Promise.resolve([])), [isRegistered]);
  const wallet = useAsync(() => (isRegistered ? ordersApi.wallet() : Promise.resolve(null)), [isRegistered]);
  const addresses = useMemo(() => saved.data ?? [], [saved.data]);
  const giftPoints = wallet.data?.giftPoints ?? 0;

  useEffect(() => {
    const list = saved.data ?? [];
    const preferred = list.find((address) => address.isDefault) ?? list[0];
    if (preferred) setSelectedAddressId(preferred.id);
  }, [saved.data]);

  const subtotalPaise = cartTotals(items).subtotalPaise;

  // The discount depends on the subtotal, so re-check the coupon whenever the cart changes.
  useEffect(() => {
    if (!coupon || coupon.subtotalPaise === subtotalPaise) return;
    ordersApi
      .validateCoupon(coupon.code, subtotalPaise)
      .then((result) => {
        if (result.valid) setCoupon({ ...result, subtotalPaise });
        else {
          setCoupon(null);
          toast.error(result.message ?? `Coupon ${coupon.code} no longer applies`);
        }
      })
      .catch(() => setCoupon(null));
  }, [coupon, subtotalPaise]);

  const totals = useMemo(
    () =>
      cartTotals(items, {
        coupon: coupon ? { discountType: 'FLAT', discountValue: coupon.discountPaise, minOrderValuePaise: 0 } : null,
        giftPointsToRedeem: usePoints ? giftPoints : 0,
      }),
    [items, coupon, usePoints, giftPoints],
  );

  const initialAddress = useMemo(() => {
    const savedAddress = addresses.find((address) => address.id === selectedAddressId);
    if (savedAddress) return pickAddress(savedAddress);
    return { ...EMPTY_ADDRESS, firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', email: user?.email ?? '' };
  }, [addresses, selectedAddressId, user]);

  const handleCheckout = async (address) => {
    setSubmitting(true);
    try {
      const created = await ordersApi.checkout({
        address,
        saveAddress: isRegistered && saveAddress,
        ...(coupon && { couponCode: coupon.code }),
        giftPointsToRedeem: usePoints ? giftPoints : 0,
        paymentMethod: 'CREDIT_CARD',
      });
      setOrder(created);
    } catch (error) {
      const code = errorCode(error);
      toast.error(errorMessage(error));
      if (code === 'INSUFFICIENT_STOCK') fetchCart().catch(() => {});
      if (code?.startsWith('COUPON_')) setCoupon(null);
    } finally {
      setSubmitting(false);
    }
  };

  const crumbs = [{ label: 'Home', to: '/' }, { label: 'Checkout' }];
  const showForm = Boolean(token);

  const handlePaid = (result) => {
    setOrder(null);
    setPaid({ order: result.order, isGuest });
    setCoupon(null);
    setUsePoints(false);
    // Paid books were removed from the server cart.
    fetchCart().catch(() => {});
    wallet.reload();
  };

  const handleExpired = () => {
    setOrder(null);
    fetchCart().catch(() => {});
  };

  let body;
  if (cartLoading && items.length === 0) {
    body = <LoadingSpinner label="Loading your cart…" />;
  } else if (items.length === 0) {
    body = (
      <EmptyState
        title="Your cart is empty"
        message="Browse the catalogue and add a few good reads."
        action={
          <Link to="/" className="btn-primary no-underline hover:no-underline">
            Continue shopping
          </Link>
        }
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-6">
          <CartItems items={items} />
          {showForm ? (
            <section className="card p-5" aria-label="Delivery address">
              <h2 className="mb-4 text-lg font-semibold">Address</h2>
              {isRegistered && <SavedAddressPicker addresses={addresses} selectedId={selectedAddressId} onSelect={setSelectedAddressId} />}
              <AddressForm key={`${selectedAddressId}-${user?.email ?? ''}`} initialValue={initialAddress} onSubmit={handleCheckout} formId="checkout-address">
                {isRegistered && (
                  <label className="flex items-center gap-2 text-sm text-bw-muted">
                    <input type="checkbox" checked={saveAddress} onChange={(event) => setSaveAddress(event.target.checked)} />
                    Save this address
                  </label>
                )}
              </AddressForm>
            </section>
          ) : (
            <GuestGate />
          )}
        </div>

        <div className="w-full lg:w-96">
          <OrderSummaryPanel
            totals={totals}
            footer={
              <button
                type="submit"
                form="checkout-address"
                className="btn-primary mt-4 w-full"
                disabled={!showForm || submitting}
                title={showForm ? undefined : 'Enter your e-mail or log in first'}
              >
                {submitting ? 'Reserving your books…' : 'Pay Now'}
              </button>
            }
          >
            <CouponField
              subtotalPaise={subtotalPaise}
              applied={coupon}
              onApply={(result) => setCoupon({ ...result, subtotalPaise })}
              onRemove={() => setCoupon(null)}
            />
            {isRegistered && giftPoints > 0 && (
              <label className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="text-bw-muted">
                  Use {giftPoints} gift points (₹{giftPoints})
                </span>
                <input type="checkbox" role="switch" checked={usePoints} onChange={(event) => setUsePoints(event.target.checked)} aria-label="Use gift points" />
              </label>
            )}
          </OrderSummaryPanel>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <Breadcrumb items={crumbs} />
      <h1 className="page-title">Checkout</h1>
      {body}
      {order && <PaymentModal order={order} onClose={() => setOrder(null)} onPaid={handlePaid} onExpired={handleExpired} />}
      {paid && <PaymentSuccessOverlay order={paid.order} isGuest={paid.isGuest} onClose={() => setPaid(null)} />}
    </div>
  );
}
