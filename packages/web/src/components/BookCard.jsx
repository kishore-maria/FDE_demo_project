import PropTypes from 'prop-types';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client.js';
import { useCartStore } from '../stores/useCartStore.js';
import { formatLabel } from '../utils/format.js';
import { DeliveryText } from './DeliveryEstimate.jsx';

export const bookShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  shortDescription: PropTypes.string,
  author: PropTypes.shape({ id: PropTypes.string, name: PropTypes.string }).isRequired,
  categories: PropTypes.arrayOf(PropTypes.shape({ name: PropTypes.string, slug: PropTypes.string })),
  priceInr: PropTypes.string.isRequired,
  pricePaise: PropTypes.number.isRequired,
  format: PropTypes.string.isRequired,
  coverImageUrl: PropTypes.string.isRequired,
  deliveryText: PropTypes.string,
  inStock: PropTypes.bool,
});

function useAddToCart(book) {
  const add = useCartStore((state) => state.add);
  const [adding, setAdding] = useState(false);
  const addToCart = async () => {
    setAdding(true);
    try {
      await add(book);
      toast.success(`Added "${book.title}" to your cart`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAdding(false);
    }
  };
  return { addToCart, adding };
}

/** Design card: cover left with a hover/focus "Add to Cart" overlay, details on the right. */
export default function BookCard({ book, compact = false }) {
  const { addToCart, adding } = useAddToCart(book);
  const outOfStock = book.inStock === false;

  return (
    <article className="card group flex gap-4 p-4" aria-label={book.title}>
      <div className={`relative shrink-0 ${compact ? 'w-16' : 'w-28'}`}>
        <Link to={`/books/${book.id}`} tabIndex={-1} aria-hidden>
          <img
            src={book.coverImageUrl}
            alt=""
            loading="lazy"
            className={`w-full bg-bw-surface object-cover ${compact ? 'h-24' : 'h-40'}`}
          />
        </Link>
        {!compact && (
          <button
            type="button"
            onClick={addToCart}
            disabled={adding || outOfStock}
            className="absolute inset-x-0 bottom-0 bg-bw-accent py-1.5 text-xs font-medium text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 disabled:bg-bw-subtle"
          >
            {outOfStock ? 'Out of stock' : adding ? 'Adding…' : 'Add to Cart'}
          </button>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className={`font-semibold leading-snug ${compact ? 'text-sm' : 'text-base'}`}>
          <Link to={`/books/${book.id}`} className="text-white">
            {book.title}
          </Link>
        </h3>
        <p className="text-xs text-bw-muted">
          by <Link to={`/authors/${book.author.id}`}>{book.author.name}</Link>
        </p>
        {!compact && (
          <>
            <p className="line-clamp-2 text-xs text-bw-muted">{book.shortDescription}</p>
            <p className="text-xs text-bw-subtle">
              {formatLabel(book.format)}
              {book.categories?.length > 0 && ' · '}
              {book.categories?.map((category, index) => (
                <span key={category.slug}>
                  {index > 0 && ', '}
                  <Link to={`/?category=${category.slug}`}>{category.name}</Link>
                </span>
              ))}
            </p>
          </>
        )}
        <p className={`mt-auto font-semibold ${compact ? 'text-sm' : 'text-lg'}`}>{book.priceInr}</p>
        {!compact && <DeliveryText format={book.format} fallback={book.deliveryText} />}
        {compact && (
          <button type="button" onClick={addToCart} disabled={adding || outOfStock} className="btn-ghost self-start px-0 py-0 text-xs">
            {outOfStock ? 'Out of stock' : 'Add to Cart'}
          </button>
        )}
      </div>
    </article>
  );
}

BookCard.propTypes = { book: bookShape.isRequired, compact: PropTypes.bool };

export function BookGrid({ books, compact = false }) {
  return (
    <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
      {books.map((book) => (
        <BookCard key={book.id} book={book} compact={compact} />
      ))}
    </div>
  );
}

BookGrid.propTypes = { books: PropTypes.arrayOf(bookShape).isRequired, compact: PropTypes.bool };
