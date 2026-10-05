import PropTypes from 'prop-types';
import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client.js';
import { ordersApi } from '../api/orders.js';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import Pagination from '../components/Pagination.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { formatDate } from '../utils/format.js';
import OrderActions from './orders/OrderActions.jsx';

const PAGE_SIZE = 10;
const MAX_THUMBNAILS = 4;

function OrderCard({ order, onUpdated }) {
  const extra = order.items.length - MAX_THUMBNAILS;
  return (
    <li className="card p-4" aria-label={`Order ${order.orderNumber}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={`/orders/${order.id}`} className="font-mono font-semibold text-bw-link hover:underline">
            {order.orderNumber}
          </Link>
          <p className="text-xs text-bw-muted">Placed on {formatDate(order.createdAt)}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold">{order.totals.totalInr}</span>
          <StatusBadge status={order.status} />
        </div>
      </div>

      <ul className="my-4 flex gap-2" aria-label="Books">
        {order.items.slice(0, MAX_THUMBNAILS).map((item) => (
          <li key={item.id}>
            <img src={item.coverImageUrl} alt={item.title} title={item.title} className="h-20 w-14 bg-bw-surface object-cover" />
          </li>
        ))}
        {extra > 0 && <li className="flex h-20 w-14 items-center justify-center bg-bw-surface text-sm text-bw-muted">+{extra}</li>}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <OrderActions order={order} onUpdated={onUpdated} />
        <Link to={`/orders/${order.id}`} className="text-sm text-bw-link hover:underline">
          View details →
        </Link>
      </div>
    </li>
  );
}

OrderCard.propTypes = { order: PropTypes.object.isRequired, onUpdated: PropTypes.func.isRequired };

export default function OrdersPage() {
  const [params] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { data, loading, error, setData } = useAsync(() => ordersApi.list({ page, pageSize: PAGE_SIZE }), [page]);

  const replaceOrder = (updated) =>
    setData((current) => ({
      ...current,
      items: current.items.map((order) => (order.id === updated.id ? { ...order, ...updated } : order)),
    }));

  return (
    <div className="page">
      <h1 className="mb-6 text-2xl font-semibold">My Orders</h1>
      {loading && <LoadingSpinner label="Loading orders…" />}
      {error && <p className="text-red-400">{errorMessage(error)}</p>}
      {data && data.items.length === 0 && (
        <EmptyState
          title="No orders yet"
          message="Books you buy will show up here."
          action={
            <Link to="/" className="btn-primary">
              Start shopping
            </Link>
          }
        />
      )}
      {data && data.items.length > 0 && (
        <>
          <ul className="space-y-4">
            {data.items.map((order) => (
              <OrderCard key={order.id} order={order} onUpdated={replaceOrder} />
            ))}
          </ul>
          <Pagination page={data.page} totalPages={data.totalPages} />
        </>
      )}
    </div>
  );
}
