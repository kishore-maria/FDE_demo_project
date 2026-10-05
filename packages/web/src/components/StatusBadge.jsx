import PropTypes from 'prop-types';

const STYLES = {
  PENDING: ['Pending payment', 'bg-bw-warning/15 text-bw-warning border-bw-warning/40'],
  CONFIRMED: ['Confirmed', 'bg-bw-accent/15 text-bw-link border-bw-accent/40'],
  PROCESSING: ['Processing', 'bg-bw-accent/15 text-bw-link border-bw-accent/40'],
  SHIPPED: ['Shipped', 'bg-purple-500/15 text-purple-300 border-purple-400/40'],
  OUT_FOR_DELIVERY: ['Out for delivery', 'bg-purple-500/15 text-purple-300 border-purple-400/40'],
  DELIVERED: ['Delivered', 'bg-bw-success/15 text-green-300 border-bw-success/40'],
  CANCELLED: ['Cancelled', 'bg-bw-danger/15 text-red-300 border-bw-danger/40'],
  EXPIRED: ['Expired', 'bg-bw-subtle/15 text-bw-muted border-bw-subtle/40'],
  RETURN_REQUESTED: ['Return requested', 'bg-orange-500/15 text-orange-300 border-orange-400/40'],
  RETURNED: ['Returned', 'bg-bw-subtle/15 text-bw-muted border-bw-subtle/40'],
  PAID: ['Paid', 'bg-bw-success/15 text-green-300 border-bw-success/40'],
  UNPAID: ['Unpaid', 'bg-bw-warning/15 text-bw-warning border-bw-warning/40'],
  FAILED: ['Payment failed', 'bg-bw-danger/15 text-red-300 border-bw-danger/40'],
  REFUNDED: ['Refunded', 'bg-bw-subtle/15 text-bw-muted border-bw-subtle/40'],
};

export const STATUS_LABELS = Object.fromEntries(Object.entries(STYLES).map(([key, [label]]) => [key, label]));

/** Coloured pill for order, payment and shipment statuses. */
export default function StatusBadge({ status }) {
  const [label, classes] = STYLES[status] ?? [status, 'bg-bw-surface text-bw-muted border-bw-border'];
  return (
    <span data-status={status} className={`inline-block border px-2 py-0.5 text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}

StatusBadge.propTypes = { status: PropTypes.string.isRequired };
