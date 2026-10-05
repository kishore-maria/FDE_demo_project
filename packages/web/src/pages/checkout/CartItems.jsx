import PropTypes from 'prop-types';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { DeliveryText } from '../../components/DeliveryEstimate.jsx';
import { TrashIcon } from '../../components/icons.jsx';
import { useCartStore } from '../../stores/useCartStore.js';
import { formatLabel } from '../../utils/format.js';

function CartLine({ item, onRemove }) {
  const update = useCartStore((state) => state.update);
  const [busy, setBusy] = useState(false);
  const { book, quantity } = item;

  const change = async (next) => {
    setBusy(true);
    try {
      await update(book.id, next);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex gap-4 border-b border-bw-border py-4 last:border-0" aria-label={book.title}>
      <img src={book.coverImageUrl} alt="" className="h-24 w-16 shrink-0 bg-bw-surface object-cover" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link to={`/books/${book.id}`} className="font-medium text-white">
          {book.title}
        </Link>
        <p className="text-xs text-bw-muted">
          by {book.author.name} · {formatLabel(book.format)}
        </p>
        <DeliveryText format={book.format} fallback={book.deliveryText} />
        <div className="mt-auto flex items-center gap-2">
          <button type="button" className="btn-secondary h-8 w-8 p-0" onClick={() => (quantity > 1 ? change(quantity - 1) : onRemove(book))} disabled={busy} aria-label={`Decrease quantity of ${book.title}`}>
            −
          </button>
          <span className="w-6 text-center text-sm" aria-label="Quantity">
            {quantity}
          </span>
          <button type="button" className="btn-secondary h-8 w-8 p-0" onClick={() => change(quantity + 1)} disabled={busy || quantity >= 99} aria-label={`Increase quantity of ${book.title}`}>
            +
          </button>
          <button type="button" className="btn-ghost ml-2 px-2" onClick={() => onRemove(book)} aria-label={`Remove ${book.title}`}>
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="font-semibold">{book.priceInr}</p>
    </li>
  );
}

CartLine.propTypes = { item: PropTypes.object.isRequired, onRemove: PropTypes.func.isRequired };

export default function CartItems({ items }) {
  const remove = useCartStore((state) => state.remove);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);

  const confirmRemove = async () => {
    setBusy(true);
    try {
      await remove(pending.id);
      toast(`Removed "${pending.title}"`);
      setPending(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5" aria-label="Shopping Cart">
      <h2 className="text-lg font-semibold">Shopping Cart</h2>
      <ul>
        {items.map((item) => (
          <CartLine key={item.book.id} item={item} onRemove={setPending} />
        ))}
      </ul>
      <ConfirmDialog
        open={Boolean(pending)}
        title="Remove from cart?"
        message={pending ? `"${pending.title}" will be removed from your cart.` : ''}
        confirmLabel="Remove"
        destructive
        busy={busy}
        onConfirm={confirmRemove}
        onClose={() => setPending(null)}
      />
    </section>
  );
}

CartItems.propTypes = { items: PropTypes.arrayOf(PropTypes.object).isRequired };
