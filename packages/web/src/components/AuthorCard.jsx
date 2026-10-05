import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

export const authorShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  photoUrl: PropTypes.string,
  bio: PropTypes.string,
  bookCount: PropTypes.number,
  topCategory: PropTypes.shape({ name: PropTypes.string }),
});

/** Writer card with an optional Follow / Unfollow action. */
export default function AuthorCard({ author, isFollowing = false, onFollow, onUnfollow, busy = false }) {
  const canToggle = Boolean(onFollow || onUnfollow);

  return (
    <article className="card flex gap-4 p-4" aria-label={author.name}>
      <img
        src={author.photoUrl || `https://i.pravatar.cc/150?u=${author.id}`}
        alt=""
        className="h-16 w-16 shrink-0 rounded-full bg-bw-surface object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="font-semibold">
          <Link to={`/authors/${author.id}`} className="text-white">
            {author.name}
          </Link>
        </h3>
        <p className="text-xs text-bw-subtle">
          {author.bookCount ?? 0} book{author.bookCount === 1 ? '' : 's'}
          {author.topCategory && ` · ${author.topCategory.name}`}
        </p>
        {author.bio && <p className="line-clamp-2 text-xs text-bw-muted">{author.bio}</p>}
      </div>
      {canToggle && (
        <div className="shrink-0 self-center">
          {isFollowing ? (
            <button type="button" className="btn-secondary" onClick={onUnfollow} disabled={busy}>
              Following
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={onFollow} disabled={busy}>
              Follow
            </button>
          )}
        </div>
      )}
    </article>
  );
}

AuthorCard.propTypes = {
  author: authorShape.isRequired,
  isFollowing: PropTypes.bool,
  onFollow: PropTypes.func,
  onUnfollow: PropTypes.func,
  busy: PropTypes.bool,
};
