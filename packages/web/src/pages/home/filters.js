/** URL query keys that switch the home page from sections to a filtered results grid. */
export const FILTER_KEYS = ['category', 'publisher', 'author', 'search', 'language', 'format', 'minPrice', 'maxPrice', 'sort', 'page'];

export const LANGUAGES = ['English', 'Hindi', 'Tamil'];

export const FORMATS = [
  { value: 'PAPERBACK', label: 'Paperback' },
  { value: 'HARDCOVER', label: 'Hardcover' },
  { value: 'EBOOK', label: 'eBook' },
];

export const SORTS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Customer Rating' },
  { value: 'newest', label: 'Newest First' },
];

/** Price buckets in paise (₹0–200, ₹200–400, ₹400–600, ₹600+). */
export const PRICE_RANGES = [
  { value: '0-20000', label: '₹0 – ₹200', minPrice: '0', maxPrice: '20000' },
  { value: '20000-40000', label: '₹200 – ₹400', minPrice: '20000', maxPrice: '40000' },
  { value: '40000-60000', label: '₹400 – ₹600', minPrice: '40000', maxPrice: '60000' },
  { value: '60000-', label: '₹600+', minPrice: '60000', maxPrice: '' },
];

export const priceRangeValue = (params) => {
  const min = params.get('minPrice') ?? '';
  const max = params.get('maxPrice') ?? '';
  return min || max ? `${min}-${max}` : '';
};

export const hasFilters = (params) => FILTER_KEYS.some((key) => params.get(key));

/** Query params for GET /books from the URL. */
export function bookQuery(params) {
  const query = { pageSize: 12 };
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) query[key] = value;
  }
  return query;
}
