import PropTypes from 'prop-types';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/client.js';
import { ordersApi } from '../../api/orders.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { useCartStore } from '../../stores/useCartStore.js';

const CONFIRMS = {
  cancel: {
    title: 'Cancel this order?',
    message: (order) => `Order ${order.orderNumber} will be cancelled and ${order.totals.totalInr} refunded to your original payment method.`,
    confirmLabel: 'Cancel order',
    cancelLabel: 'Keep order',
    run: (order, client) => client.cancel(order.id),
    done: 'Order cancelled. Your refund is on its way.',
  },
  return: {
    title: 'Return this order?',
    message: (order) =>
      `We'll schedule a pickup for order ${order.orderNumber}. You'll be refunded once the books reach us.`,
    confirmLabel: 'Request return',
    cancelLabel: 'Not now',
    run: (order, client) => client.requestReturn(order.id),
    done: 'Return requested. A pickup has been scheduled.',
  },
};

/**
 * Buy Again plus the Cancel / Return buttons allowed by `order.flags`. `onUpdated` receives the updated order.
 * `client` overrides the cancel/return calls (guests managing an order from Track Order use an order token).
 */
export default function OrderActions({ order, onUpdated, client = ordersApi, showBuyAgain = true }) {
  const navigate = useNavigate();
  const setCart = useCartStore((state) => state.setFromServer);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(null);

  const buyAgain = async () => {
    setBusy('buyAgain');
    try {
      const cart = await ordersApi.buyAgain(order.id);
      setCart(cart);
      const skipped = cart.skipped?.length ?? 0;
      if (skipped) toast(`${skipped} book${skipped === 1 ? ' is' : 's are'} out of stock and ${skipped === 1 ? 'was' : 'were'} skipped`);
      else toast.success('Added to your cart');
      navigate('/checkout');
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  };

  const confirm = async () => {
    const action = CONFIRMS[confirming];
    setBusy(confirming);
    try {
      const updated = await action.run(order, client);
      toast.success(action.done);
      onUpdated(updated);
      setConfirming(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const dialog = confirming && CONFIRMS[confirming];

  return (
    <div className="flex flex-wrap gap-2">
      {showBuyAgain && (
        <button type="button" className="btn-primary" onClick={buyAgain} disabled={busy !== null}>
          {busy === 'buyAgain' ? 'Adding…' : 'Buy Again'}
        </button>
      )}
      {order.flags.canCancel && (
        <button type="button" className="btn-danger" onClick={() => setConfirming('cancel')} disabled={busy !== null}>
          Cancel Order
        </button>
      )}
      {order.flags.canReturn && (
        <button type="button" className="btn-secondary" onClick={() => setConfirming('return')} disabled={busy !== null}>
          Return Order
        </button>
      )}
      <ConfirmDialog
        open={Boolean(dialog)}
        title={dialog?.title ?? ''}
        message={dialog ? dialog.message(order) : undefined}
        confirmLabel={dialog?.confirmLabel}
        cancelLabel={dialog?.cancelLabel}
        destructive={confirming === 'cancel'}
        busy={busy === confirming}
        onConfirm={confirm}
        onClose={() => setConfirming(null)}
      />
    </div>
  );
}

OrderActions.propTypes = {
  order: PropTypes.shape({
    id: PropTypes.string.isRequired,
    orderNumber: PropTypes.string.isRequired,
    totals: PropTypes.shape({ totalInr: PropTypes.string.isRequired }).isRequired,
    flags: PropTypes.shape({ canCancel: PropTypes.bool, canReturn: PropTypes.bool }).isRequired,
  }).isRequired,
  onUpdated: PropTypes.func.isRequired,
  client: PropTypes.shape({ cancel: PropTypes.func.isRequired, requestReturn: PropTypes.func.isRequired }),
  showBuyAgain: PropTypes.bool,
};
