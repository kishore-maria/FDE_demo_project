import { formatINR } from 'bookworm-shared';

export const FORMAT_LABELS = { PAPERBACK: 'Paperback', HARDCOVER: 'Hardcover', EBOOK: 'eBook' };

export const formatLabel = (format) => FORMAT_LABELS[format] ?? format;

/** "4 Oct 2026" */
export function formatDate(value) {
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "4 Oct 2026, 2:30 pm" */
export function formatDateTime(value) {
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export { formatINR };
