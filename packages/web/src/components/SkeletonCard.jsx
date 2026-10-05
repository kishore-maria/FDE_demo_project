import PropTypes from 'prop-types';

export default function SkeletonCard({ compact = false }) {
  return (
    <div data-testid="skeleton-card" className="card flex animate-pulse gap-4 p-4" aria-hidden>
      <div className={`shrink-0 bg-bw-surface ${compact ? 'h-24 w-16' : 'h-40 w-28'}`} />
      <div className="flex flex-1 flex-col gap-2">
        <div className="h-4 w-3/4 bg-bw-surface" />
        <div className="h-3 w-1/2 bg-bw-surface" />
        {!compact && <div className="h-3 w-full bg-bw-surface" />}
        <div className="mt-auto h-4 w-1/4 bg-bw-surface" />
      </div>
    </div>
  );
}

SkeletonCard.propTypes = { compact: PropTypes.bool };

export function SkeletonGrid({ count = 6, compact = false }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} compact={compact} />
      ))}
    </div>
  );
}

SkeletonGrid.propTypes = { count: PropTypes.number, compact: PropTypes.bool };
