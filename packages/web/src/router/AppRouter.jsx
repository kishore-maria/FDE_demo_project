import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout.jsx';
import AdminPage from '../pages/admin/AdminPage.jsx';
import AuthorPage from '../pages/AuthorPage.jsx';
import BookDetailPage from '../pages/BookDetailPage.jsx';
import CheckoutPage from '../pages/CheckoutPage.jsx';
import DevComponentsPage from '../pages/DevComponentsPage.jsx';
import HomePage from '../pages/HomePage.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import MyWritersPage from '../pages/MyWritersPage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import OrderDetailPage from '../pages/OrderDetailPage.jsx';
import OrdersPage from '../pages/OrdersPage.jsx';
import RegisterPage from '../pages/RegisterPage.jsx';
import TrackOrderPage from '../pages/TrackOrderPage.jsx';
import WishlistPage from '../pages/WishlistPage.jsx';
import { RequireAdmin, RequireRegistered } from './guards.jsx';

const registered = (element) => <RequireRegistered>{element}</RequireRegistered>;

/** All routes; wrapped in a router by main.jsx (BrowserRouter) and by tests (MemoryRouter). */
export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="books/:bookId" element={<BookDetailPage />} />
        <Route path="authors/:authorId" element={<AuthorPage />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="cart" element={<Navigate to="/checkout" replace />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="track-order" element={<TrackOrderPage />} />

        <Route path="orders" element={registered(<OrdersPage />)} />
        <Route path="orders/:orderId" element={registered(<OrderDetailPage />)} />
        <Route path="wishlist" element={registered(<WishlistPage />)} />
        <Route path="writers" element={registered(<MyWritersPage />)} />

        <Route
          path="admin/*"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />

        {import.meta.env.DEV && <Route path="dev/components" element={<DevComponentsPage />} />}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
