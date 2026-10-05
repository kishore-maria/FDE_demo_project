import { formatINRFixed } from 'bookworm-shared';
import PropTypes from 'prop-types';

function Row({ label, value, emphasis = false, positive = false }) {
  return (
    <div className={`flex justify-between py-1.5 ${emphasis ? 'border-t border-bw-border pt-3 text-base font-semibold' : 'text-sm'}`}>
      <dt className={emphasis ? '' : 'text-bw-muted'}>{label}</dt>
      <dd className={positive ? 'text-bw-success' : ''}>{value}</dd>
    </div>
  );
}

Row.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  emphasis: PropTypes.bool,
  positive: PropTypes.bool,
};

/**
 * Grand Total panel. Accepts totals in paise (from computeOrderTotals or the server's OrderTotals);
 * `children` render between the charges and the total (coupon input, gift points toggle…).
 */
export default function OrderSummaryPanel({ totals, title = 'Grand Total', children = null, footer = null }) {
  const itemCount = totals.itemCount ?? 0;
  return (
    <section className="card p-5" aria-label={title}>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <dl>
        <Row label={`Price (${itemCount} item${itemCount === 1 ? '' : 's'})`} value={formatINRFixed(totals.subtotalPaise)} />
        <Row label="Tax" value={formatINRFixed(totals.taxPaise)} />
        <Row label="Delivery Charges" value={totals.deliveryChargePaise ? formatINRFixed(totals.deliveryChargePaise) : 'Free'} positive={!totals.deliveryChargePaise} />
        {children}
        {totals.couponDiscountPaise > 0 && <Row label="Discount" value={`− ${formatINRFixed(totals.couponDiscountPaise)}`} positive />}
        {totals.giftDiscountPaise > 0 && <Row label="Gift points" value={`− ${formatINRFixed(totals.giftDiscountPaise)}`} positive />}
        <Row label="Total Amount" value={formatINRFixed(totals.totalPaise)} emphasis />
      </dl>
      {footer}
    </section>
  );
}

OrderSummaryPanel.propTypes = {
  totals: PropTypes.shape({
    itemCount: PropTypes.number,
    subtotalPaise: PropTypes.number.isRequired,
    taxPaise: PropTypes.number.isRequired,
    deliveryChargePaise: PropTypes.number.isRequired,
    couponDiscountPaise: PropTypes.number,
    giftDiscountPaise: PropTypes.number,
    totalPaise: PropTypes.number.isRequired,
  }).isRequired,
  title: PropTypes.string,
  children: PropTypes.node,
  footer: PropTypes.node,
};
