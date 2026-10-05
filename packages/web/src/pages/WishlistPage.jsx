import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client.js';
import { wishlistApi } from '../api/wishlist.js';
import BookCard from '../components/BookCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { HeartIcon } from '../components/icons.jsx';
import { SkeletonGrid } from '../components/SkeletonCard.jsx';
import { useAsync } from '../hooks/useAsync.js';

export default function WishlistPage() {
  const { data: items, loading, error, setData } = useAsync(() => wishlistApi.list(), []);
  const [removing, setRemoving] = useState(null);

  const remove = async (book) => {
    setRemoving(book.id);
    try {
      setData(await wishlistApi.remove(book.id));
      toast(`Removed "${book.title}" from your wishlist`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="page">
      <h1 className="mb-6 text-2xl font-semibold">My Wishlist</h1>
      {loading && <SkeletonGrid count={3} />}
      {error && <p className="text-red-400">{errorMessage(error)}</p>}
      {items && items.length === 0 && (
        <EmptyState
          icon={<HeartIcon className="h-10 w-10" />}
          title="Your wishlist is empty"
          message="Tap the heart on any book to save it for later."
          action={
            <Link to="/" className="btn-primary">
              Browse books
            </Link>
          }
        />
      )}
      {items && items.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Wishlisted books">
          {items.map(({ book }) => (
            <li key={book.id} className="flex flex-col">
              <BookCard book={book} />
              <button
                type="button"
                className="btn-ghost self-end text-sm"
                onClick={() => remove(book)}
                disabled={removing === book.id}
                aria-label={`Remove ${book.title} from wishlist`}
              >
                {removing === book.id ? 'Removing…' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
