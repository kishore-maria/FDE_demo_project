import PropTypes from 'prop-types';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { catalogApi } from '../api/catalog.js';
import { errorMessage } from '../api/client.js';
import { wishlistApi } from '../api/wishlist.js';
import { BookGrid } from '../components/BookCard.jsx';
import Breadcrumb from '../components/Breadcrumb.jsx';
import { DeliveryCheck } from '../components/DeliveryEstimate.jsx';
import { HeartIcon } from '../components/icons.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import StarRating from '../components/StarRating.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { selectIsRegistered, useAuthStore } from '../stores/useAuthStore.js';
import { useCartStore } from '../stores/useCartStore.js';
import { formatLabel } from '../utils/format.js';
import ReviewsSection from './book/ReviewsSection.jsx';
import NotFoundPage from './NotFoundPage.jsx';

function Covers({ book }) {
  const covers = [book.coverImageUrl, book.backCoverImageUrl].filter(Boolean);
  const [active, setActive] = useState(0);
  return (
    <div className="w-full shrink-0 md:w-64">
      <img src={covers[active]} alt={`${book.title} ${active === 0 ? 'front' : 'back'} cover`} className="w-full bg-bw-surface object-cover" />
      {covers.length > 1 && (
        <div className="mt-2 flex gap-2">
          {covers.map((src, index) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(index)}
              aria-label={index === 0 ? 'Show front cover' : 'Show back cover'}
              aria-pressed={active === index}
              className={`w-16 border-2 ${active === index ? 'border-bw-accent' : 'border-transparent'}`}
            >
              <img src={src} alt="" className="h-20 w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

Covers.propTypes = { book: PropTypes.object.isRequired };

function Shelf({ title, books }) {
  if (!books.length) return null;
  return (
    <section aria-label={title} className="mt-10">
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      <BookGrid books={books} />
    </section>
  );
}

Shelf.propTypes = { title: PropTypes.string.isRequired, books: PropTypes.array.isRequired };

export default function BookDetailPage() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((state) => state.token);
  const isRegistered = useAuthStore(selectIsRegistered);
  const addToCart = useCartStore((state) => state.add);
  const { data: book, loading, error, setData } = useAsync(() => catalogApi.book(bookId), [bookId, token]);
  const [busy, setBusy] = useState(null);

  const loginPath = `/login?redirect=${encodeURIComponent(location.pathname)}`;
  const requireLogin = () => {
    if (isRegistered) return false;
    toast('Please log in to continue');
    navigate(loginPath);
    return true;
  };

  if (loading) return <LoadingSpinner label="Loading book…" />;
  if (error) {
    const status = error.response?.status;
    if (status === 404 || status === 400) return <NotFoundPage />;
    return <p className="page text-red-400">{errorMessage(error)}</p>;
  }

  const run = async (key, action) => {
    setBusy(key);
    try {
      await action();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleAddToCart = () =>
    run('cart', async () => {
      await addToCart(book);
      toast.success(`Added "${book.title}" to your cart`);
    });

  const toggleWishlist = () => {
    if (requireLogin()) return;
    run('wishlist', async () => {
      if (book.isWishlisted) {
        await wishlistApi.remove(book.id);
        toast('Removed from your wishlist');
      } else {
        await wishlistApi.add(book.id);
        toast.success('Added to your wishlist');
      }
      setData((current) => ({ ...current, isWishlisted: !current.isWishlisted }));
    });
  };

  const toggleFollow = () => {
    if (requireLogin()) return;
    run('follow', async () => {
      if (book.isFollowingAuthor) await catalogApi.unfollow(book.author.id);
      else await catalogApi.follow(book.author.id);
      setData((current) => ({ ...current, isFollowingAuthor: !current.isFollowingAuthor }));
    });
  };

  const handleReviewSaved = ({ review, ratingAvg, ratingCount }) =>
    setData((current) => ({
      ...current,
      ratingAvg,
      ratingCount,
      reviews: [review, ...current.reviews.filter((existing) => existing.id !== review.id)],
    }));

  const crumbs = [
    { label: 'Home', to: '/' },
    ...book.breadcrumb.map((category) => ({ label: category.name, to: `/?category=${category.slug}` })),
    { label: book.title },
  ];

  return (
    <div className="page">
      <Breadcrumb items={crumbs} />
      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-6 md:flex-row">
            <Covers book={book} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <h1 className="text-3xl font-semibold">{book.title}</h1>
              <p className="text-bw-muted">
                by <Link to={`/authors/${book.author.id}`}>{book.author.name}</Link>
              </p>
              <p className="text-bw-muted">{book.shortDescription}</p>
              <p className="text-sm text-bw-muted">
                Published by <Link to={`/?publisher=${book.publisher.slug}`}>{book.publisher.name}</Link>
              </p>
              <p className="text-sm text-bw-subtle">
                {formatLabel(book.format)} ·{' '}
                {book.categories.map((category, index) => (
                  <span key={category.slug}>
                    {index > 0 && ', '}
                    <Link to={`/?category=${category.slug}`}>{category.name}</Link>
                  </span>
                ))}
              </p>
              <p className="mt-2 text-3xl font-semibold">{book.priceInr}</p>
              {book.inStock ? <DeliveryCheck format={book.format} /> : <p className="text-sm text-bw-success">Currently out of stock</p>}
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" className="btn-primary" onClick={handleAddToCart} disabled={!book.inStock || busy === 'cart'}>
                  Add to Cart
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={toggleWishlist}
                  disabled={busy === 'wishlist'}
                  aria-pressed={Boolean(book.isWishlisted)}
                >
                  <HeartIcon className={`h-4 w-4 ${book.isWishlisted ? 'fill-current text-red-400' : ''}`} />
                  {book.isWishlisted ? 'In your Wishlist' : 'Add to Wishlist'}
                </button>
              </div>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-bw-muted">
                <span>{book.language}</span>
                <span aria-hidden>·</span>
                <StarRating value={book.ratingAvg ?? 0} />
                <span>
                  {book.ratingAvg ?? 0} ({book.ratingCount ?? 0} ratings)
                </span>
                <span aria-hidden>·</span>
                <span>{book.salesCount ?? 0} copies sold</span>
              </p>
            </div>
          </div>

          <section aria-label="About this book" className="mt-8">
            <h2 className="mb-2 text-xl font-semibold">About this book</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-bw-muted">{book.description}</p>
          </section>

          <section aria-label="About the writer" className="card mt-8 flex gap-4 p-4">
            <img src={book.author.photoUrl || `https://i.pravatar.cc/150?u=${book.author.id}`} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover" />
            <div className="flex-1">
              <h2 className="font-semibold">About the writer</h2>
              <p className="text-sm">
                <Link to={`/authors/${book.author.id}`}>{book.author.name}</Link>
              </p>
              <p className="mt-1 text-sm text-bw-muted">{book.author.bio}</p>
            </div>
            <div className="shrink-0 self-center">
              <button
                type="button"
                className={book.isFollowingAuthor ? 'btn-secondary' : 'btn-primary'}
                onClick={toggleFollow}
                disabled={busy === 'follow'}
              >
                {book.isFollowingAuthor ? 'Following' : 'Follow'}
              </button>
            </div>
          </section>

          <div className="mt-8">
            <ReviewsSection bookId={book.id} reviews={book.reviews} canReview={isRegistered} loginPath={loginPath} onSaved={handleReviewSaved} />
          </div>
        </div>

        {book.relatedBooks.length > 0 && (
          <aside className="w-full lg:w-80" aria-label="Related Reads">
            <h2 className="mb-3 text-xl font-semibold">Related Reads</h2>
            <BookGrid books={book.relatedBooks} compact />
          </aside>
        )}
      </div>

      <Shelf title="Frequently bought together" books={book.crossSell} />
      <Shelf title="Upgrade your edition" books={book.upsell} />
    </div>
  );
}
