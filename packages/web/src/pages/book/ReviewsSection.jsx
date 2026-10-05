import PropTypes from 'prop-types';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { catalogApi } from '../../api/catalog.js';
import { errorMessage } from '../../api/client.js';
import StarRating from '../../components/StarRating.jsx';
import { formatDate } from '../../utils/format.js';

export const REVIEW_MAX_CHARS = 100;

function ReviewForm({ bookId, onSaved }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (rating < 1) {
      setError('Pick a rating from 1 to 5 stars');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await catalogApi.review(bookId, { rating, ...(comment.trim() && { comment: comment.trim() }) });
      onSaved(result);
      toast.success('Thanks for your review!');
      setComment('');
      setRating(0);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-3 p-4" aria-label="Write a review">
      <h3 className="font-semibold">Write a review</h3>
      <StarRating value={rating} onChange={setRating} label="Your rating" />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div>
        <label htmlFor="review-comment" className="label">
          Your review (optional)
        </label>
        <textarea
          id="review-comment"
          rows={3}
          maxLength={REVIEW_MAX_CHARS}
          value={comment}
          onChange={(event) => setComment(event.target.value.slice(0, REVIEW_MAX_CHARS))}
          className="input resize-none"
          aria-describedby="review-counter"
        />
        <p id="review-counter" className="mt-1 text-right text-xs text-bw-subtle">
          {comment.length}/{REVIEW_MAX_CHARS}
        </p>
      </div>
      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? 'Submitting…' : 'Submit'}
      </button>
    </form>
  );
}

ReviewForm.propTypes = { bookId: PropTypes.string.isRequired, onSaved: PropTypes.func.isRequired };

export default function ReviewsSection({ bookId, reviews, canReview, loginPath, onSaved }) {
  return (
    <section aria-label="Reviews" className="space-y-4">
      <h2 className="text-xl font-semibold">Reviews</h2>
      {canReview ? (
        <ReviewForm bookId={bookId} onSaved={onSaved} />
      ) : (
        <p className="text-sm text-bw-muted">
          <Link to={loginPath}>Login</Link> to write a review.
        </p>
      )}
      {reviews.length === 0 ? (
        <p className="text-sm text-bw-muted">No reviews yet. Be the first to share your thoughts.</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => (
            <li key={review.id} className="border-b border-bw-border pb-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{review.reviewer.firstName || 'Reader'}</span>
                <StarRating value={review.rating} />
                <span className="text-xs text-bw-subtle">{formatDate(review.createdAt)}</span>
              </div>
              {review.comment && <p className="mt-1 text-sm text-bw-muted">{review.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

ReviewsSection.propTypes = {
  bookId: PropTypes.string.isRequired,
  reviews: PropTypes.arrayOf(PropTypes.object).isRequired,
  canReview: PropTypes.bool.isRequired,
  loginPath: PropTypes.string.isRequired,
  onSaved: PropTypes.func.isRequired,
};
