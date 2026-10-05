import PropTypes from 'prop-types';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { catalogApi } from '../api/catalog.js';
import { errorMessage } from '../api/client.js';
import AuthorCard from '../components/AuthorCard.jsx';
import { BookGrid } from '../components/BookCard.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { SkeletonGrid } from '../components/SkeletonCard.jsx';
import { useAsync } from '../hooks/useAsync.js';

function Section({ title, state, empty, children }) {
  return (
    <section aria-label={title} className="mb-10">
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      {state.loading && <SkeletonGrid count={3} />}
      {state.error && <p className="text-sm text-red-400">{errorMessage(state.error)}</p>}
      {state.data && (state.data.length === 0 ? empty : children)}
    </section>
  );
}

Section.propTypes = {
  title: PropTypes.string.isRequired,
  state: PropTypes.shape({ data: PropTypes.array, loading: PropTypes.bool, error: PropTypes.object }).isRequired,
  empty: PropTypes.node.isRequired,
  children: PropTypes.node,
};

const without = (list, authorId) => list?.filter((author) => author.id !== authorId) ?? list;

export default function MyWritersPage() {
  const following = useAsync(() => catalogApi.following(), []);
  const newBooks = useAsync(() => catalogApi.newFromFollowing(), []);
  const suggestions = useAsync(() => catalogApi.suggestions(), []);
  const [busy, setBusy] = useState(null);
  const [unfollowing, setUnfollowing] = useState(null);

  const follow = async (author) => {
    setBusy(author.id);
    suggestions.setData((list) => without(list, author.id));
    following.setData((list) => [...(list ?? []), { ...author, isFollowing: true }]);
    try {
      await catalogApi.follow(author.id);
      toast.success(`You're following ${author.name}`);
      newBooks.reload();
    } catch (err) {
      following.setData((list) => without(list, author.id));
      suggestions.setData((list) => [author, ...(list ?? [])]);
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const unfollow = async () => {
    const author = unfollowing;
    setUnfollowing(null);
    setBusy(author.id);
    following.setData((list) => without(list, author.id));
    try {
      await catalogApi.unfollow(author.id);
      toast(`Unfollowed ${author.name}`);
      newBooks.reload();
    } catch (err) {
      following.setData((list) => [...(list ?? []), author]);
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <h1 className="mb-6 text-2xl font-semibold">My Writers</h1>

      <Section
        title="Your Writers"
        state={following}
        empty={<EmptyState title="You aren't following anyone yet" message="Follow writers to hear about their new books." />}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {following.data?.map((author) => (
            <AuthorCard key={author.id} author={author} isFollowing busy={busy === author.id} onUnfollow={() => setUnfollowing(author)} />
          ))}
        </div>
      </Section>

      <Section
        title="New from Your Writers"
        state={newBooks}
        empty={<EmptyState title="No new books yet" message="New releases from writers you follow will appear here." />}
      >
        <BookGrid books={newBooks.data ?? []} />
      </Section>

      <Section
        title="Discover Writers"
        state={suggestions}
        empty={<EmptyState title="No suggestions right now" message="Buy a few books and we'll suggest writers in the genres you love." />}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {suggestions.data?.map((author) => (
            <AuthorCard key={author.id} author={author} busy={busy === author.id} onFollow={() => follow(author)} />
          ))}
        </div>
      </Section>

      <ConfirmDialog
        open={Boolean(unfollowing)}
        title={unfollowing ? `Unfollow ${unfollowing.name}?` : ''}
        message="You'll stop seeing their new books here."
        confirmLabel="Unfollow"
        destructive
        onConfirm={unfollow}
        onClose={() => setUnfollowing(null)}
      />
    </div>
  );
}
