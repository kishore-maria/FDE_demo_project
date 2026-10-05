import PropTypes from 'prop-types';
import { useId } from 'react';
import { StarIcon } from './icons.jsx';

/**
 * Read-only: shows `value` (0–5, rounded to the nearest star).
 * Interactive (pass `onChange`): five radio buttons, keyboard accessible.
 */
export default function StarRating({ value = 0, onChange, size = 'h-4 w-4', label = 'Rating' }) {
  const name = useId();

  if (!onChange) {
    const filled = Math.round(value);
    return (
      <span className="inline-flex items-center text-yellow-400" role="img" aria-label={`${value} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <StarIcon key={star} filled={star <= filled} className={size} />
        ))}
      </span>
    );
  }

  return (
    <fieldset className="inline-flex items-center text-yellow-400">
      <legend className="sr-only">{label}</legend>
      {[1, 2, 3, 4, 5].map((star) => (
        <label key={star} className="cursor-pointer p-0.5">
          <input
            type="radio"
            name={name}
            value={star}
            checked={value === star}
            onChange={() => onChange(star)}
            className="peer sr-only"
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
          />
          <span className="block peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-bw-accent">
            <StarIcon filled={star <= value} className="h-6 w-6" />
          </span>
        </label>
      ))}
    </fieldset>
  );
}

StarRating.propTypes = {
  value: PropTypes.number,
  onChange: PropTypes.func,
  size: PropTypes.string,
  label: PropTypes.string,
};
