import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SearchIcon } from '../../components/icons.jsx';
import { useDebouncedValue } from '../../hooks/useAsync.js';
import { FORMATS, LANGUAGES, PRICE_RANGES, SORTS, priceRangeValue } from './filters.js';

function Select({ id, label, value, onChange, options, placeholder }) {
  return (
    <div className="min-w-[9rem]">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="input pr-8">
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

Select.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string, label: PropTypes.string })).isRequired,
  placeholder: PropTypes.string.isRequired,
};

/** Search, Language, Format, Price Range and Sort — all stored in the URL. Any change resets to page 1. */
export default function FilterBar() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(search.trim(), 400);

  const update = (changes) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      next.delete('page');
      return next;
    });
  };

  useEffect(() => {
    if ((params.get('search') ?? '') !== debouncedSearch) update({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Keep the input in sync when the URL changes elsewhere (chips, sidebar, back button).
  useEffect(() => {
    setSearch(params.get('search') ?? '');
  }, [params]);

  const handlePrice = (value) => {
    const range = PRICE_RANGES.find((option) => option.value === value);
    update({ minPrice: range?.minPrice ?? '', maxPrice: range?.maxPrice ?? '' });
  };

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-bw-border pb-4">
      <div className="min-w-[14rem] flex-1">
        <label htmlFor="filter-search" className="label">
          Search
        </label>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-bw-subtle" />
          <input
            id="filter-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Title, author or publisher"
            className="input pl-8"
            maxLength={100}
          />
        </div>
      </div>
      <Select
        id="filter-language"
        label="Language"
        value={params.get('language') ?? ''}
        onChange={(value) => update({ language: value })}
        options={LANGUAGES.map((language) => ({ value: language, label: language }))}
        placeholder="All languages"
      />
      <Select
        id="filter-format"
        label="Format"
        value={params.get('format') ?? ''}
        onChange={(value) => update({ format: value })}
        options={FORMATS}
        placeholder="All formats"
      />
      <Select id="filter-price" label="Price Range" value={priceRangeValue(params)} onChange={handlePrice} options={PRICE_RANGES} placeholder="Any price" />
      <Select
        id="filter-sort"
        label="Sort by"
        value={params.get('sort') ?? ''}
        onChange={(value) => update({ sort: value })}
        options={SORTS}
        placeholder="Featured"
      />
    </div>
  );
}
