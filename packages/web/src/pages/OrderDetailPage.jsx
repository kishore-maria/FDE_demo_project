import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage } from '../api/client.js';
import { ordersApi } from '../api/orders.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import OrderSummaryPanel from '../components/OrderSummaryPanel.jsx';
import ShipmentTimeline from '../components/ShipmentTimeline.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { formatDate, formatDateTime, formatLabel } from '../utils/format.js';
import NotFoundPage from './NotFoundPage.jsx';
import AddressDialog from './orders/AddressDialog.jsx';
import OrderActions from './orders/OrderActions.jsx';

const METHOD_LABELS = { CREDIT_CARD: 'Credit card', DEBIT_CARD: 'Debit card', UPI: 'UPI', WALLET: 'BookWorm wallet' };
const DELIVERED_STATUSES = ['DELIVERED', 'RETURN_REQUESTED', 'RETURNED'];

function paymentDetails(payment) {
  if (payment.cardLast4) return `•••• ${payment.cardLast4}`;
  return payment.upiHandleMasked ?? '';
}

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const { data: order, loading, error, setData } = useAsync(() => ordersApi.get(orderId), [orderId]);
  const [editingAddress, setEditingAddress] = useState(false);

  if (loading) return <LoadingSpinner label="Loading order…" />;
  if (error) {
    const status = error.response?.status;
    if (status === 404 || status === 400) return <NotFoundPage />;
    return <p className="page text-red-400">{errorMessage(error)}</p>;
  }

  const address = order.shippingAddress;
  const payment = order.payments.find((p) => p.status === 'SUCCEEDED' || p.status === 'REFUNDED');

  return (
    <div className="page">
      <Link to="/orders" className="text-sm text-bw-link hover:underline">
        ← My Orders
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Order <span className="font-mono">{order.orderNumber}</span>
          </h1>
          <p className="text-sm text-bw-muted">Placed on {formatDateTime(order.createdAt)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card p-4" aria-label="Items">
            <h2 className="mb-3 text-lg font-semibold">Items</h2>
            <ul className="divide-y divide-bw-border">
              {order.items.map((item) => (
                <li key={item.id} className="flex gap-4 py-3">
                  <img src={item.coverImageUrl} alt="" className="h-24 w-16 bg-bw-surface object-cover" />
                  <div className="flex-1">
                    <Link to={`/books/${item.bookId}`} className="font-medium hover:underline">
                      {item.title}
                    </Link>
                    {item.authorName && <p className="text-sm text-bw-muted">{item.authorName}</p>}
                    <p className="text-xs text-bw-subtle">
                      {item.format && `${formatLabel(item.format)} · `}
                      {item.quantity} × {item.priceAtPurchaseInr}
                    </p>
                    {item.deliveryDate && (
                      <p className="text-xs text-bw-success">
                        {DELIVERED_STATUSES.includes(order.status) ? 'Delivered on' : 'Arriving by'} {formatDate(item.deliveryDate)}
                      </p>
                    )}
                  </div>
                  <span className="font-semibold">{item.lineTotalInr}</span>
                </li>
              ))}
            </ul>
          </section>

          {order.shipments.map((shipment) => (
            <ShipmentTimeline key={shipment.id} shipment={shipment} />
          ))}

          <OrderActions order={order} onUpdated={setData} />
        </div>

        <aside className="space-y-6">
          <section className="card p-4" aria-label="Delivery address">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Delivery address</h2>
              {order.flags.canModifyAddress && (
                <button type="button" className="text-sm text-bw-link hover:underline" onClick={() => setEditingAddress(true)}>
                  Change address
                </button>
              )}
            </div>
            <address className="text-sm not-italic text-bw-muted">
              <span className="block text-white">
                {address.firstName} {address.lastName}
              </span>
              <span className="block">{address.line1}</span>
              {address.line2 && <span className="block">{address.line2}</span>}
              <span className="block">
                {address.city} {address.pin}, {address.state}, {address.country}
              </span>
              <span className="block">+91 {address.phone}</span>
            </address>
          </section>

          <section className="card p-4" aria-label="Payment">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Payment</h2>
              <StatusBadge status={order.paymentStatus} />
            </div>
            {payment ? (
              <p className="text-sm text-bw-muted">
                {METHOD_LABELS[payment.method]} {paymentDetails(payment)}
                {payment.refundedAt && <span className="block">Refunded on {formatDate(payment.refundedAt)}</span>}
              </p>
            ) : (
              <p className="text-sm text-bw-muted">No payment recorded.</p>
            )}
            {order.couponCode && <p className="mt-1 text-sm text-bw-muted">Coupon {order.couponCode}</p>}
          </section>

          <OrderSummaryPanel totals={order.totals} title="Order total" />
        </aside>
      </div>

      {editingAddress && (
        <AddressDialog
          order={order}
          onClose={() => setEditingAddress(false)}
          onSaved={(updated) => {
            setData(updated);
            setEditingAddress(false);
          }}
        />
      )}
    </div>
  );
}
