import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import NotFoundPage from '../NotFoundPage.jsx';
import AdminBookForm from './AdminBookForm.jsx';
import AdminBooks from './AdminBooks.jsx';
import { AdminAuthors, AdminCategories, AdminCoupons, AdminPublishers } from './AdminCatalog.jsx';
import AdminOrders from './AdminOrders.jsx';
import AdminStore from './AdminStore.jsx';

const SECTIONS = [
  ['books', 'Books'],
  ['categories', 'Categories'],
  ['publishers', 'Publishers'],
  ['authors', 'Authors'],
  ['coupons', 'Coupons'],
  ['store', 'Store & policies'],
  ['orders', 'Orders'],
];

const linkClass = ({ isActive }) =>
  `block px-3 py-2 text-sm no-underline ${isActive ? 'bg-bw-accent text-white' : 'text-bw-muted hover:bg-bw-surface hover:text-white'}`;

/** Admin area layout: section nav + nested routes (guarded by RequireAdmin in the router). */
export default function AdminPage() {
  return (
    <div className="page">
      <h1 className="mb-6 text-2xl font-semibold">Admin</h1>
      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav aria-label="Admin sections">
          <ul className="space-y-1">
            {SECTIONS.map(([path, label]) => (
              <li key={path}>
                <NavLink to={`/admin/${path}`} className={linkClass}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <Routes>
            <Route index element={<Navigate to="books" replace />} />
            <Route path="books" element={<AdminBooks />} />
            <Route path="books/new" element={<AdminBookForm />} />
            <Route path="books/:bookId" element={<AdminBookForm />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="publishers" element={<AdminPublishers />} />
            <Route path="authors" element={<AdminAuthors />} />
            <Route path="coupons" element={<AdminCoupons />} />
            <Route path="store" element={<AdminStore />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
