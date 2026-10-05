import PropTypes from 'prop-types';

export default function LoadingSpinner({ label = 'Loading…', className = '' }) {
  return (
    <div role="status" className={`flex items-center justify-center gap-3 py-8 text-bw-muted ${className}`}>
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-bw-border border-t-bw-accent" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

LoadingSpinner.propTypes = { label: PropTypes.string, className: PropTypes.string };
