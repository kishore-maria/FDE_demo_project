import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../../api/admin.js';
import { errorMessage } from '../../api/client.js';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import Pagination from '../../components/Pagination.jsx';
import StatusBadge, { STATUS_LABELS } from '../../components/StatusBadge.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDateTime } from '../../utils/format.js';

const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'EXPIRED', 'RETURN_REQUESTED', 'RETURNED'];
const NEXT_STEP = { PROCESSING: 'Shipped', SHIPPED: 'Out for delivery', OUT_FOR_DELIVERY: 'Delivered' };

/** All orders with a shipment simulator: each click moves a shipment one step forward. */
export default function AdminOrders() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const status = params.get('status') ?? '';
  const { data, loading, error, setData } = useAsync(
    () => adminApi.orders({ page, pageSize: 20, ...(status && { status }) }),
    [page, status],
  );
  const [advancing, setAdvancing] = useState(null);

  const filter = (value) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('page');
      if (value) next.set('status', value);
      else next.delete('status');
      return next;
    });

  const advance = async (order, shipment) => {
    setAdvancing(shipment.id);
    try {
      const result = await adminApi.advanceShipment(shipment.id);
      setData((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === order.id
            ? {
                ...item,
                status: result.orderStatus,
                shipments: item.shipments.map((s) => (s.id === shipment.id ? result.shipment : s)),
              }
            : item,
        ),
      }));
      toast.success(`${shipment.trackingNumber} → ${STATUS_LABELS[result.shipment.status] ?? result.shipment.status}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setAdvancing(null);
    }
  };

  return (
    <section aria-label="Orders">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xl font-semibold">Orders</h2>
        <div>
          <label htmlFor="order-status" className="label">
            Status
          </label>
          <select id="order-status" className="input" value={status} onChange={(event) => filter(event.target.value)}>
            <option value="">All</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <LoadingSpinner label="Loading orders…" />}
      {error && <p className="text-red-400">{errorMessage(error)}</p>}
      {data && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-bw-border text-xs uppercase text-bw-subtle">
                <tr>
                  <th className="px-2 py-2 font-medium">Order</th>
                  <th className="px-2 py-2 font-medium">Placed</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Total</th>
                  <th className="px-2 py-2 font-medium">Shipments</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-center text-bw-muted">
                      No orders.
                    </td>
                  </tr>
                )}
                {data.items.map((order) => (
                  <tr key={order.id} className="border-b border-bw-border align-top" aria-label={`Order ${order.orderNumber}`}>
                    <td className="px-2 py-2 font-mono">{order.orderNumber}</td>
                    <td className="px-2 py-2 text-bw-muted">{formatDateTime(order.createdAt)}</td>
                    <td className="px-2 py-2">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-2 py-2">{order.totals.totalInr}</td>
                    <td className="space-y-2 px-2 py-2">
                      {(order.shipments ?? []).length === 0 && <span className="text-bw-subtle">—</span>}
                      {(order.shipments ?? []).map((shipment) => (
                        <div key={shipment.id} className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-bw-muted">
                            {shipment.type === 'RETURN' ? 'Return' : 'Delivery'} <span className="font-mono">{shipment.trackingNumber}</span>
                          </span>
                          <StatusBadge status={shipment.status} />
                          {NEXT_STEP[shipment.status] && (
                            <button
                              type="button"
                              className="btn-secondary px-2 py-1 text-xs"
                              onClick={() => advance(order, shipment)}
                              disabled={advancing === shipment.id}
                              aria-label={`Advance shipment ${shipment.trackingNumber}`}
                              title={`Mark as ${NEXT_STEP[shipment.status]}`}
                            >
                              {advancing === shipment.id ? 'Advancing…' : 'Advance shipment'}
                            </button>
                          )}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} />
        </>
      )}
    </section>
  );
}
