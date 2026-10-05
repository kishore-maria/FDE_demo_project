import PropTypes from 'prop-types';
import { Link, useSearchParams } from 'react-router-dom';

const linkClass = (active) =>
  `block px-4 py-1.5 text-sm no-underline hover:bg-bw-surface hover:no-underline ${
    active ? 'border-l-2 border-bw-accent bg-bw-surface text-white' : 'border-l-2 border-transparent text-bw-muted'
  }`;

/** Sidebar genres are the sub-categories flagged showInSidebar, in their display order. */
export function sidebarGenres(tree) {
  return tree
    .flatMap((root) => root.children)
    .filter((category) => category.showInSidebar)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export default function GenreSidebar({ categories, publishers }) {
  const [params] = useSearchParams();
  const activeCategory = params.get('category');
  const activePublisher = params.get('publisher');
  const nothingSelected = !activeCategory && !activePublisher;

  return (
    <aside className="w-full shrink-0 bg-bw-sidebar py-4 md:w-56" aria-label="Browse">
      <h2 className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-bw-subtle">Genres</h2>
      <nav aria-label="Genres">
        <Link to="/" className={linkClass(nothingSelected)}>
          All
        </Link>
        {sidebarGenres(categories).map((genre) => (
          <Link key={genre.slug} to={`/?category=${genre.slug}`} className={linkClass(activeCategory === genre.slug)}>
            {genre.name}
          </Link>
        ))}
      </nav>

      <h2 className="mt-6 px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-bw-subtle">Publishers</h2>
      <nav aria-label="Publishers">
        {publishers.map((publisher) => (
          <Link key={publisher.slug} to={`/?publisher=${publisher.slug}`} className={linkClass(activePublisher === publisher.slug)}>
            {publisher.name}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

GenreSidebar.propTypes = {
  categories: PropTypes.arrayOf(PropTypes.object).isRequired,
  publishers: PropTypes.arrayOf(PropTypes.object).isRequired,
};
