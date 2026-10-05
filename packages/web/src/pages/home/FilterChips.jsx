import PropTypes from 'prop-types';
import { Link, useSearchParams } from 'react-router-dom';
import { CloseIcon } from '../../components/icons.jsx';
import { FORMATS, PRICE_RANGES, SORTS, priceRangeValue } from './filters.js';

function findName(list, slug) {
  return list.find((item) => item.slug === slug)?.name ?? slug;
}

/** Removable chips for every active filter, plus "Clear all". */
export default function FilterChips({ categories, publishers }) {
  const [params, setParams] = useSearchParams();
  const allCategories = categories.flatMap((root) => [root, ...root.children]);
  const price = PRICE_RANGES.find((range) => range.value === priceRangeValue(params));

  const chips = [
    params.get('category') && { keys: ['category'], label: `Genre: ${findName(allCategories, params.get('category'))}` },
    params.get('publisher') && { keys: ['publisher'], label: `Publisher: ${findName(publishers, params.get('publisher'))}` },
    params.get('author') && { keys: ['author'], label: `Author: ${params.get('author')}` },
    params.get('search') && { keys: ['search'], label: `“${params.get('search')}”` },
    params.get('language') && { keys: ['language'], label: params.get('language') },
    params.get('format') && { keys: ['format'], label: FORMATS.find((f) => f.value === params.get('format'))?.label ?? params.get('format') },
    priceRangeValue(params) && { keys: ['minPrice', 'maxPrice'], label: price?.label ?? 'Custom price' },
    params.get('sort') && { keys: ['sort'], label: `Sort: ${SORTS.find((s) => s.value === params.get('sort'))?.label ?? params.get('sort')}` },
  ].filter(Boolean);

  if (chips.length === 0) return null;

  const remove = (keys) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      keys.forEach((key) => next.delete(key));
      next.delete('page');
      return next;
    });

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      {chips.map((chip) => (
        <button
          key={chip.keys.join()}
          type="button"
          onClick={() => remove(chip.keys)}
          className="inline-flex items-center gap-1 border border-bw-border bg-bw-surface px-2 py-1 text-xs hover:bg-bw-surface-hover"
          aria-label={`Remove filter ${chip.label}`}
        >
          {chip.label}
          <CloseIcon className="h-3 w-3" />
        </button>
      ))}
      <Link to="/" className="text-xs">
        Clear all
      </Link>
    </div>
  );
}

FilterChips.propTypes = {
  categories: PropTypes.arrayOf(PropTypes.object).isRequired,
  publishers: PropTypes.arrayOf(PropTypes.object).isRequired,
};
