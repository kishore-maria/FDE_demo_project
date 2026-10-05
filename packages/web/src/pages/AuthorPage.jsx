import { useState } from 'react';
import toast from 'react-hot-toast';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { catalogApi } from '../api/catalog.js';
import { errorMessage } from '../api/client.js';
import { BookGrid } from '../components/BookCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { selectIsRegistered, useAuthStore } from '../stores/useAuthStore.js';
import NotFoundPage from './NotFoundPage.jsx';

export default function AuthorPage() {
  const { authorId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((state) => state.token);
  const isRegistered = useAuthStore(selectIsRegistered);
  const { data: author, loading, error, setData } = useAsync(() => catalogApi.author(authorId), [authorId, token]);
  const [busy, setBusy] = useState(false);

  if (loading) return <LoadingSpinner label="Loading writer…" />;
  if (error) {
    const status = error.response?.status;
    if (status === 404 || status === 400) return <NotFoundPage />;
    return <p className="page text-red-400">{errorMessage(error)}</p>;
  }

  const toggleFollow = async () => {
    if (!isRegistered) {
      toast('Please log in to follow writers');
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setBusy(true);
    try {
      const result = author.isFollowing ? await catalogApi.unfollow(author.id) : await catalogApi.follow(author.id);
      setData((current) => ({ ...current, isFollowing: result.isFollowing }));
      toast.success(result.isFollowing ? `You're following ${author.name}` : `Unfollowed ${author.name}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <img
          src={author.photoUrl || `https://i.pravatar.cc/150?u=${author.id}`}
          alt={author.name}
          className="h-24 w-24 rounded-full bg-bw-surface object-cover"
        />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{author.name}</h1>
          <p className="text-sm text-bw-subtle">
            {author.bookCount ?? author.books.length} book{(author.bookCount ?? author.books.length) === 1 ? '' : 's'}
            {author.topCategory && ` · ${author.topCategory.name}`}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-bw-muted">{author.bio}</p>
        </div>
        <button type="button" className={author.isFollowing ? 'btn-secondary' : 'btn-primary'} onClick={toggleFollow} disabled={busy}>
          {author.isFollowing ? 'Following' : 'Follow'}
        </button>
      </header>

      <h2 className="mb-3 text-xl font-semibold">Books by {author.name}</h2>
      {author.books.length ? <BookGrid books={author.books} /> : <EmptyState title="No books yet" />}
    </div>
  );
}
