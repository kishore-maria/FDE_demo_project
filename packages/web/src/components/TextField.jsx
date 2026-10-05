import PropTypes from 'prop-types';

/** Labelled input with an inline error, used by the auth and admin forms. */
export default function TextField({ id, label, error, className = '', ...inputProps }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        className="input"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...inputProps}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

TextField.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  error: PropTypes.string,
  className: PropTypes.string,
};
