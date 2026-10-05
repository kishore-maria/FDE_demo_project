import PropTypes from 'prop-types';
import { Link, useSearchParams } from 'react-router-dom';
import { catalogApi } from '../api/catalog.js';
import { BookGrid } from '../components/BookCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import { SkeletonGrid } from '../components/SkeletonCard.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useAuthStore } from '../stores/useAuthStore.js';
import FilterBar from './home/FilterBar.jsx';
import FilterChips from './home/FilterChips.jsx';
import GenreSidebar from './home/GenreSidebar.jsx';
import { bookQuery, hasFilters } from './home/filters.js';

const SECTION_SIZE = 3;

function Section({ title, load, deps = [], subtitle, action }) {
  const { data, loading, error } = useAsync(load, deps);
  return (
    <section className="mb-10" aria-label={title}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {subtitle && data && <p className="text-xs text-bw-subtle">{subtitle(data)}</p>}
        </div>
        {action}
      </div>
      {loading && <SkeletonGrid count={SECTION_SIZE} />}
      {error && <p className="text-sm text-red-400">Could not load this section.</p>}
      {data && <BookGrid books={(Array.isArray(data) ? data : data.items).slice(0, SECTION_SIZE)} />}
    </section>
  );
}

Section.propTypes = {
  title: PropTypes.string.isRequired,
  load: PropTypes.func.isRequired,
  deps: PropTypes.array,
  subtitle: PropTypes.func,
  action: PropTypes.node,
};

function Sections() {
  const token = useAuthStore((state) => state.token);
  return (
    <>
      <Section
        title="Recommended for You"
        load={catalogApi.recommended}
        deps={[token]}
        subtitle={(data) => (data.source === 'personalised' ? 'Based on your reading' : "Editor's picks")}
      />
      <Section title="Bestsellers this Month" load={catalogApi.bestsellers} />
      <Section
        title="New Launches"
        load={catalogApi.newLaunches}
        action={
          <Link to="/?sort=newest" className="text-sm">
            View all
          </Link>
        }
      />
    </>
  );
}

function Results({ params }) {
  const query = bookQuery(params);
  const { data, loading, error } = useAsync(() => catalogApi.books(query), [params.toString()]);

  if (loading) return <SkeletonGrid count={6} />;
  if (error) return <EmptyState title="Something went wrong" message="We could not load books. Please try again." />;
  if (data.total === 0) {
    return (
      <EmptyState
        title="No books found"
        message="Try a different search or remove some filters."
        action={
          <Link to="/" className="btn-primary no-underline hover:no-underline">
            Clear filters
          </Link>
        }
      />
    );
  }
  return (
    <>
      <p className="mb-3 text-sm text-bw-muted">
        {data.total} book{data.total === 1 ? '' : 's'}
      </p>
      <BookGrid books={data.items} />
      <Pagination page={data.page} totalPages={data.totalPages} />
    </>
  );
}

Results.propTypes = { params: PropTypes.instanceOf(URLSearchParams).isRequired };

/** Catalogue: genre sidebar + filter bar; curated sections when unfiltered, a results grid otherwise. */
export default function HomePage() {
  const [params] = useSearchParams();
  const navigation = useAsync(() => Promise.all([catalogApi.categories(), catalogApi.publishers()]), []);
  const [categories, publishers] = navigation.data ?? [[], []];
  const filtered = hasFilters(params);

  return (
    <div className="mx-auto flex max-w-content flex-col md:flex-row">
      <GenreSidebar categories={categories} publishers={publishers} />
      <div className="min-w-0 flex-1 space-y-4 px-4 py-6">
        <h1 className="sr-only">Catalogue</h1>
        <FilterBar />
        <FilterChips categories={categories} publishers={publishers} />
        {filtered ? <Results params={params} /> : <Sections />}
      </div>
    </div>
  );
}
