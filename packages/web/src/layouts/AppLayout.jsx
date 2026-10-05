import { Toaster } from 'react-hot-toast';
import { Outlet } from 'react-router-dom';
import CartSync from '../components/CartSync.jsx';
import Navbar from '../components/Navbar.jsx';

export default function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <CartSync />
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-bw-border py-4 text-center text-xs text-bw-subtle">
        © BookWorm — demo e-bookstore
      </footer>
      <Toaster
        position="bottom-right"
        toastOptions={{ style: { background: '#262626', color: '#fff', borderRadius: 0, border: '1px solid #393939' } }}
      />
    </div>
  );
}
