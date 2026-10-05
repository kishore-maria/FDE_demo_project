import PropTypes from 'prop-types';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../../api/admin.js';
import { errorMessage } from '../../api/client.js';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { FORMAT_LABELS } from '../../utils/format.js';
import FormField from './FormField.jsx';
import { isoToDate, paiseToRupees, rupeesToPaise, slugify, validateFields } from './forms.js';

const PAGE_SIZE = 48;

/** Every book (for the relation pickers); the admin list is paginated at 48. */
async function allBooks() {
  const first = await adminApi.books.list({ page: 1, pageSize: PAGE_SIZE });
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) => adminApi.books.list({ page: index + 2, pageSize: PAGE_SIZE })),
  );
  return [first, ...rest].flatMap((page) => page.items);
}

async function loadReferences(bookId) {
  const [authors, publishers, categories, books, book] = await Promise.all([
    adminApi.authors.list(),
    adminApi.publishers.list(),
    adminApi.categories.list(),
    allBooks(),
    bookId ? adminApi.books.get(bookId) : null,
  ]);
  return { authors, publishers, categories, books, book };
}

export const EMPTY_BOOK = {
  title: '',
  slug: '',
  authorId: '',
  publisherId: '',
  shortDescription: '',
  description: '',
  isbn: '',
  price: '',
  format: 'PAPERBACK',
  language: 'English',
  coverImageUrl: '',
  backCoverImageUrl: '',
  stockQuantity: '0',
  publishedAt: '',
  isEditorsPick: false,
  categoryIds: [],
  primaryCategoryId: '',
  upsellIds: [],
  crossSellIds: [],
};

function bookToForm(book) {
  return {
    title: book.title,
    slug: book.slug,
    authorId: book.author.id,
    publisherId: book.publisher.id,
    shortDescription: book.shortDescription,
    description: book.description ?? '',
    isbn: book.isbn ?? '',
    price: paiseToRupees(book.pricePaise),
    format: book.format,
    language: book.language,
    coverImageUrl: book.coverImageUrl,
    backCoverImageUrl: book.backCoverImageUrl ?? '',
    stockQuantity: String(book.stockQuantity ?? 0),
    publishedAt: isoToDate(book.publishedAt),
    isEditorsPick: Boolean(book.isEditorsPick),
    categoryIds: book.categories.map((c) => c.id),
    primaryCategoryId: book.categories.find((c) => c.isPrimary)?.id ?? book.categories[0]?.id ?? '',
    upsellIds: book.upsell.map((b) => b.id),
    crossSellIds: book.crossSell.map((b) => b.id),
  };
}

const textFields = (authors, publishers) => [
  { name: 'title', label: 'Title', required: true },
  { name: 'slug', label: 'Slug', type: 'slug', required: true, hint: 'Generated from the title' },
  { name: 'authorId', label: 'Author', type: 'select', required: true, options: authors.map((a) => ({ value: a.id, label: a.name })) },
  { name: 'publisherId', label: 'Publisher', type: 'select', required: true, options: publishers.map((p) => ({ value: p.id, label: p.name })) },
  { name: 'shortDescription', label: 'Short description', required: true, hint: 'Shown on book cards (max 200 characters)' },
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'price', label: 'Price (₹)', type: 'money', required: true },
  {
    name: 'format',
    label: 'Format',
    type: 'select',
    required: true,
    options: Object.entries(FORMAT_LABELS).map(([value, label]) => ({ value, label })),
  },
  { name: 'stockQuantity', label: 'Stock', type: 'number', required: true },
  { name: 'language', label: 'Language', required: true },
  { name: 'isbn', label: 'ISBN' },
  { name: 'publishedAt', label: 'Published on', type: 'date', required: true },
  { name: 'coverImageUrl', label: 'Front cover URL', type: 'url', required: true },
  { name: 'backCoverImageUrl', label: 'Back cover URL', type: 'url' },
];

/** Client-side checks that mirror BookInput; returns { field: message }. */
export function validateBook(values, fields = textFields([], [])) {
  const errors = validateFields(fields, values);
  if (values.shortDescription.trim().length > 200) errors.shortDescription = 'Keep it under 200 characters';
  if (values.categoryIds.length === 0) errors.categories = 'Pick at least one category';
  else if (!values.categoryIds.includes(values.primaryCategoryId)) errors.categories = 'Choose the primary category';
  const overlap = values.upsellIds.filter((id) => values.crossSellIds.includes(id));
  if (overlap.length) errors.relations = 'A book can be an up-sell or a cross-sell, not both';
  return errors;
}

/** BookInput payload from form values. */
export function toBookPayload(values) {
  const payload = {
    title: values.title.trim(),
    slug: values.slug.trim(),
    authorId: values.authorId,
    publisherId: values.publisherId,
    shortDescription: values.shortDescription.trim(),
    pricePaise: rupeesToPaise(values.price),
    format: values.format,
    language: values.language.trim(),
    coverImageUrl: values.coverImageUrl.trim(),
    backCoverImageUrl: values.backCoverImageUrl.trim() || null,
    isbn: values.isbn.trim() || null,
    stockQuantity: Number(values.stockQuantity),
    isEditorsPick: values.isEditorsPick,
    publishedAt: new Date(`${values.publishedAt}T00:00:00.000Z`).toISOString(),
    categories: values.categoryIds.map((categoryId) => ({ categoryId, isPrimary: categoryId === values.primaryCategoryId })),
    relations: [
      ...values.upsellIds.map((relatedBookId) => ({ relatedBookId, type: 'UPSELL' })),
      ...values.crossSellIds.map((relatedBookId) => ({ relatedBookId, type: 'CROSS_SELL' })),
    ],
  };
  if (values.description.trim()) payload.description = values.description.trim();
  return payload;
}

function CategoryPicker({ categories, values, error, onChange }) {
  const parents = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const toggle = (id, checked) => {
    const categoryIds = checked ? [...values.categoryIds, id] : values.categoryIds.filter((value) => value !== id);
    const primaryCategoryId = categoryIds.includes(values.primaryCategoryId) ? values.primaryCategoryId : (categoryIds[0] ?? '');
    onChange({ categoryIds, primaryCategoryId });
  };

  return (
    <fieldset aria-describedby={error ? 'book-categories-error' : undefined}>
      <legend className="label">
        Categories <span className="text-red-400">*</span>
      </legend>
      <div className="grid max-h-60 gap-1 overflow-y-auto border border-bw-border p-2 sm:grid-cols-2">
        {categories.map((category) => {
          const checked = values.categoryIds.includes(category.id);
          const label = category.parentId ? `${parents[category.parentId]} › ${category.name}` : category.name;
          return (
            <div key={category.id} className="flex items-center justify-between gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={checked} onChange={(event) => toggle(category.id, event.target.checked)} />
                {label}
              </label>
              {checked && (
                <label className="flex items-center gap-1 text-xs text-bw-muted">
                  <input
                    type="radio"
                    name="primaryCategory"
                    checked={values.primaryCategoryId === category.id}
                    onChange={() => onChange({ primaryCategoryId: category.id })}
                    aria-label={`Primary: ${category.name}`}
                  />
                  Primary
                </label>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p id="book-categories-error" className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </fieldset>
  );
}

CategoryPicker.propTypes = {
  categories: PropTypes.array.isRequired,
  values: PropTypes.object.isRequired,
  error: PropTypes.string,
  onChange: PropTypes.func.isRequired,
};

function RelationPicker({ id, label, books, selected, onChange }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select
        id={id}
        multiple
        size={6}
        className="input"
        value={selected}
        onChange={(event) => onChange([...event.target.selectedOptions].map((option) => option.value))}
      >
        {books.map((book) => (
          <option key={book.id} value={book.id}>
            {book.title} ({FORMAT_LABELS[book.format]})
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-bw-subtle">Ctrl/Cmd-click to pick several.</p>
    </div>
  );
}

RelationPicker.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  books: PropTypes.array.isRequired,
  selected: PropTypes.arrayOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
};

function BookForm({ refs, bookId }) {
  const navigate = useNavigate();
  const [values, setValues] = useState(refs.book ? bookToForm(refs.book) : EMPTY_BOOK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [autoSlug, setAutoSlug] = useState(!refs.book);
  const fields = textFields(refs.authors, refs.publishers);
  const otherBooks = refs.books.filter((book) => book.id !== bookId);

  const update = (patch) => {
    setValues((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key];
      if ('categoryIds' in patch || 'primaryCategoryId' in patch) delete next.categories;
      if ('upsellIds' in patch || 'crossSellIds' in patch) delete next.relations;
      return next;
    });
  };

  const change = (name, value) => {
    if (name === 'slug') setAutoSlug(false);
    update(name === 'title' && autoSlug ? { title: value, slug: slugify(value) } : { [name]: value });
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = validateBook(values, fields);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    setSaving(true);
    try {
      const payload = toBookPayload(values);
      const saved = bookId ? await adminApi.books.update(bookId, payload) : await adminApi.books.create(payload);
      toast.success(bookId ? `Saved "${saved.title}"` : `Created "${saved.title}"`);
      navigate('/admin/books');
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form noValidate onSubmit={submit} aria-label={bookId ? 'Edit book' : 'New book'} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.name} className={['description', 'shortDescription'].includes(field.name) ? 'sm:col-span-2' : ''}>
            <FormField field={field} idPrefix="book" value={values[field.name]} error={errors[field.name]} onChange={change} />
          </div>
        ))}
        <div className="sm:col-span-2">
          <FormField
            field={{ name: 'isEditorsPick', label: "Editor's pick", type: 'checkbox' }}
            idPrefix="book"
            value={values.isEditorsPick}
            onChange={change}
          />
        </div>
      </div>

      <CategoryPicker categories={refs.categories} values={values} error={errors.categories} onChange={update} />

      <fieldset>
        <legend className="label">Related books</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <RelationPicker id="book-upsell" label="Up-sell" books={otherBooks} selected={values.upsellIds} onChange={(upsellIds) => update({ upsellIds })} />
          <RelationPicker
            id="book-cross-sell"
            label="Cross-sell"
            books={otherBooks}
            selected={values.crossSellIds}
            onChange={(crossSellIds) => update({ crossSellIds })}
          />
        </div>
        {errors.relations && <p className="mt-1 text-xs text-red-400">{errors.relations}</p>}
      </fieldset>

      <div className="flex justify-end gap-2">
        <Link to="/admin/books" className="btn-secondary">
          Cancel
        </Link>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : bookId ? 'Save changes' : 'Create book'}
        </button>
      </div>
    </form>
  );
}

BookForm.propTypes = { refs: PropTypes.object.isRequired, bookId: PropTypes.string };

/** /admin/books/new and /admin/books/:bookId */
export default function AdminBookForm() {
  const { bookId } = useParams();
  const { data: refs, loading, error } = useAsync(() => loadReferences(bookId), [bookId]);

  return (
    <section aria-label={bookId ? 'Edit book' : 'New book'}>
      <h2 className="mb-4 text-xl font-semibold">{bookId ? 'Edit book' : 'New book'}</h2>
      {loading && <LoadingSpinner label="Loading…" />}
      {error && <p className="text-red-400">{errorMessage(error)}</p>}
      {refs && <BookForm key={bookId ?? 'new'} refs={refs} bookId={bookId} />}
    </section>
  );
}
