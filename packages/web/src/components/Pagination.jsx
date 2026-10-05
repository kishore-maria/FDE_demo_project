import PropTypes from 'prop-types';
import { useSearchParams } from 'react-router-dom';

export default function Pagination({ page, totalPages }) {
  const [, setParams] = useSearchParams();
  if (totalPages <= 1) return null;

  const go = (target) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (target <= 1) next.delete('page');
      else next.set('page', String(target));
      return next;
    });
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
      <button type="button" className="btn-secondary" onClick={() => go(page - 1)} disabled={page <= 1}>
        Previous
      </button>
      <span className="px-2 text-sm text-bw-muted">
        Page {page} of {totalPages}
      </span>
      <button type="button" className="btn-secondary" onClick={() => go(page + 1)} disabled={page >= totalPages}>
        Next
      </button>
    </nav>
  );
}

Pagination.propTypes = { page: PropTypes.number.isRequired, totalPages: PropTypes.number.isRequired };
