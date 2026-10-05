import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client.js';
import { ordersApi } from '../api/orders.js';
import ShipmentTimeline from '../components/ShipmentTimeline.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import TextField from '../components/TextField.jsx';
import { formatDate } from '../utils/format.js';
import ManageOrder from './track/ManageOrder.jsx';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORDER_NUMBER = /^BW-[0-9A-Z]{8}$/;

const NOT_FOUND = "We couldn't find an order with those details. Check the e-mail and order number and try again.";
const RATE_LIMITED = 'Too many attempts. Please wait a few minutes and try again.';

function validate({ email, orderNumber }) {
  const errors = {};
  if (!EMAIL.test(email.trim())) errors.email = 'Enter the e-mail used for the order';
  if (!ORDER_NUMBER.test(orderNumber.trim().toUpperCase())) errors.orderNumber = 'Order numbers look like BW-7K3F9QXM';
  return errors;
}

function TrackedOrderCard({ order }) {
  return (
    <section className="card mt-8 p-5" aria-label={`Order ${order.orderNumber}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            Order <span className="font-mono">{order.orderNumber}</span>
          </h2>
          <p className="text-xs text-bw-muted">Placed on {formatDate(order.createdAt)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <ul className="mb-4 divide-y divide-bw-border" aria-label="Items">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2 text-sm">
            <img src={item.coverImageUrl} alt="" className="h-14 w-10 bg-bw-surface object-cover" />
            <span className="flex-1">
              {item.title} <span className="text-bw-muted">× {item.quantity}</span>
            </span>
            <span>{item.lineTotalInr}</span>
          </li>
        ))}
      </ul>
      <p className="mb-4 flex justify-between font-semibold">
        <span>Total</span>
        <span>{order.totals.totalInr}</span>
      </p>
      <div className="space-y-4">
        {order.shipments.map((shipment) => (
          <ShipmentTimeline key={shipment.id} shipment={shipment} />
        ))}
      </div>
    </section>
  );
}

TrackedOrderCard.propTypes = { order: PropTypes.object.isRequired };

/** Public order tracking by e-mail + order number (no login needed). */
export default function TrackOrderPage() {
  const [params] = useSearchParams();
  const [values, setValues] = useState({ email: params.get('email') ?? '', orderNumber: params.get('orderNumber') ?? '' });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ loading: false, message: null, order: null, query: null });
  const autoSubmitted = useRef(false);

  const lookup = async (current) => {
    const found = validate(current);
    setErrors(found);
    if (Object.keys(found).length) return;
    const query = { email: current.email.trim(), orderNumber: current.orderNumber.trim().toUpperCase() };
    setStatus({ loading: true, message: null, order: null, query: null });
    try {
      const order = await ordersApi.lookup(query.email, query.orderNumber);
      setStatus({ loading: false, message: null, order, query });
    } catch (err) {
      const code = err.response?.status;
      const message = code === 404 ? NOT_FOUND : code === 429 ? RATE_LIMITED : errorMessage(err);
      setStatus({ loading: false, message, order: null, query: null });
    }
  };

  useEffect(() => {
    if (autoSubmitted.current || !values.email || !values.orderNumber) return;
    autoSubmitted.current = true;
    lookup(values);
    // Only on first render, when both fields arrive prefilled from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const submit = (event) => {
    event.preventDefault();
    lookup(values);
  };

  return (
    <div className="page max-w-3xl">
      <h1 className="text-2xl font-semibold">Track Order</h1>
      <p className="mt-1 text-sm text-bw-muted">Enter the e-mail you used at checkout and your order number.</p>

      <form noValidate onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start" aria-label="Track order">
        <TextField id="track-email" name="email" type="email" label="e-mail" autoComplete="email" value={values.email} onChange={change} error={errors.email} />
        <TextField
          id="track-order-number"
          name="orderNumber"
          label="Order number"
          placeholder="BW-XXXXXXXX"
          value={values.orderNumber}
          onChange={change}
          error={errors.orderNumber}
        />
        <button type="submit" className="btn-primary sm:mt-6" disabled={status.loading}>
          {status.loading ? 'Searching…' : 'Track'}
        </button>
      </form>

      {status.message && (
        <p role="alert" className="mt-6 border border-bw-danger/40 bg-bw-danger/10 p-3 text-sm text-red-300">
          {status.message}
        </p>
      )}

      {status.order && <TrackedOrderCard order={status.order} />}
      {status.order && (
        <ManageOrder
          email={status.query.email}
          orderNumber={status.query.orderNumber}
          onOrderChange={(order) => setStatus((current) => ({ ...current, order }))}
        />
      )}

      <p className="mt-8 text-sm text-bw-muted">
        Have an account?{' '}
        <Link to="/login?redirect=%2Forders" className="text-bw-link hover:underline">
          Log in
        </Link>{' '}
        to see all your orders.
      </p>
    </div>
  );
}
