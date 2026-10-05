import PropTypes from 'prop-types';
import { formatDateTime } from '../utils/format.js';
import StatusBadge from './StatusBadge.jsx';

const STEPS = ['PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const STEP_LABELS = {
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
};

export const shipmentShape = PropTypes.shape({
  id: PropTypes.string,
  type: PropTypes.oneOf(['FORWARD', 'RETURN']).isRequired,
  trackingNumber: PropTypes.string.isRequired,
  carrier: PropTypes.string,
  status: PropTypes.string.isRequired,
  estimatedDeliveryText: PropTypes.string,
  actualDelivery: PropTypes.string,
  events: PropTypes.arrayOf(
    PropTypes.shape({ status: PropTypes.string.isRequired, note: PropTypes.string, occurredAt: PropTypes.string }),
  ).isRequired,
});

/** Progress steps plus the event log for one shipment. */
export default function ShipmentTimeline({ shipment }) {
  const reached = STEPS.indexOf(shipment.status);
  const eventFor = (status) => shipment.events.find((event) => event.status === status);

  return (
    <section className="card p-4" aria-label={`${shipment.type === 'RETURN' ? 'Return' : 'Delivery'} tracking`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{shipment.type === 'RETURN' ? 'Return shipment' : 'Shipment'}</h3>
          <p className="text-xs text-bw-muted">
            {shipment.carrier ?? 'BookWorm Express'} · Tracking <span className="font-mono">{shipment.trackingNumber}</span>
          </p>
        </div>
        <StatusBadge status={shipment.status} />
      </div>

      <ol className="grid grid-cols-4 gap-2" aria-label="Progress">
        {STEPS.map((step, index) => {
          const done = index <= reached;
          const event = eventFor(step);
          return (
            <li key={step} data-done={done} className="flex flex-col gap-1">
              <span className={`h-1.5 ${done ? 'bg-bw-accent' : 'bg-bw-surface'}`} />
              <span className={`text-xs ${done ? 'text-white' : 'text-bw-subtle'}`}>{STEP_LABELS[step]}</span>
              {event?.occurredAt && <span className="text-[11px] text-bw-subtle">{formatDateTime(event.occurredAt)}</span>}
            </li>
          );
        })}
      </ol>

      {shipment.status !== 'DELIVERED' && shipment.estimatedDeliveryText && (
        <p className="mt-3 text-sm text-bw-success">{shipment.estimatedDeliveryText}</p>
      )}

      {shipment.events.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-bw-border pt-3 text-xs text-bw-muted">
          {[...shipment.events].reverse().map((event) => (
            <li key={`${event.status}-${event.occurredAt}`}>
              <span className="text-white">{event.note}</span>
              {event.occurredAt && ` — ${formatDateTime(event.occurredAt)}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

ShipmentTimeline.propTypes = { shipment: shipmentShape.isRequired };
