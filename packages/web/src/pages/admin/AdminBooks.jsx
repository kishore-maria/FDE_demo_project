import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi } from '../../api/admin.js';
import { errorMessage } from '../../api/client.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import Pagination from '../../components/Pagination.jsx';
import { useAsync, useDebouncedValue } from '../../hooks/useAsync.js';
import { formatLabel } from '../../utils/format.js';

/** Admin book table with search, edit and delete. */
export default function AdminBooks() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const search = params.get('search') ?? '';
  const [term, setTerm] = useState(search);
  const debounced = useDebouncedValue(term, 300);
  const { data, loading, error, reload } = useAsync(
    () => adminApi.books.list({ page, pageSize: 20, ...(search && { search }) }),
    [page, search],
  );
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (debounced.trim() === search) return;
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('page');
      if (debounced.trim()) next.set('search', debounced.trim());
      else next.delete('search');
      return next;
    });
  }, [debounced, search, setParams]);

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await adminApi.books.remove(deleting.id);
      toast.success(`Deleted "${deleting.title}"`);
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Books">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Books</h2>
        <div className="flex gap-2">
          <input
            type="search"
            className="input"
            placeholder="Search title or author"
            aria-label="Search books"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
          <Link to="/admin/books/new" className="btn-primary whitespace-nowrap">
            Add book
          </Link>
        </div>
      </div>

      {loading && <LoadingSpinner label="Loading books…" />}
      {error && <p className="text-red-400">{errorMessage(error)}</p>}
      {data && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-bw-border text-xs uppercase text-bw-subtle">
                <tr>
                  <th className="px-2 py-2 font-medium">Title</th>
                  <th className="px-2 py-2 font-medium">Author</th>
                  <th className="px-2 py-2 font-medium">Format</th>
                  <th className="px-2 py-2 font-medium">Price</th>
                  <th className="px-2 py-2 font-medium">Stock</th>
                  <th className="px-2 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-2 py-6 text-center text-bw-muted">
                      No books found.
                    </td>
                  </tr>
                )}
                {data.items.map((book) => (
                  <tr key={book.id} className="border-b border-bw-border">
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-3">
                        <img src={book.coverImageUrl} alt="" className="h-12 w-8 bg-bw-surface object-cover" />
                        <Link to={`/books/${book.id}`}>{book.title}</Link>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-bw-muted">{book.author.name}</td>
                    <td className="px-2 py-2">{formatLabel(book.format)}</td>
                    <td className="px-2 py-2">{book.priceInr}</td>
                    <td className="px-2 py-2">{book.inStock ? 'In stock' : <span className="text-red-400">Out of stock</span>}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      <Link to={`/admin/books/${book.id}`} className="btn-ghost text-xs" aria-label={`Edit ${book.title}`}>
                        Edit
                      </Link>
                      <button type="button" className="btn-ghost text-xs text-red-400" onClick={() => setDeleting(book)} aria-label={`Delete ${book.title}`}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} />
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={deleting ? `Delete "${deleting.title}"?` : ''}
        message="Books that have been ordered can't be deleted — set their stock to 0 instead."
        confirmLabel="Delete"
        destructive
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </section>
  );
}
