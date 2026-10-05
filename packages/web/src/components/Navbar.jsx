import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { selectIsAdmin, selectIsRegistered, useAuthStore } from '../stores/useAuthStore.js';
import { selectItemCount, useCartStore } from '../stores/useCartStore.js';
import { useDeliveryStore } from '../stores/useDeliveryStore.js';
import DeliverTo from './DeliverTo.jsx';
import { CartIcon, GridIcon, UserIcon } from './icons.jsx';

const navClass = ({ isActive }) =>
  `px-3 py-2 text-sm text-white no-underline hover:bg-bw-surface hover:no-underline ${isActive ? 'border-b-2 border-bw-accent' : ''}`;

export default function Navbar() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const isRegistered = useAuthStore(selectIsRegistered);
  const isAdmin = useAuthStore(selectIsAdmin);
  const logout = useAuthStore((state) => state.logout);
  const cartCount = useCartStore(selectItemCount);
  const resetCart = useCartStore((state) => state.reset);

  const handleLogout = () => {
    logout();
    resetCart();
    // A PIN taken from the account's address shouldn't outlive the session; a typed one may.
    if (useDeliveryStore.getState().source === 'address') useDeliveryStore.getState().clear();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-bw-border bg-bw-bg-alt">
      <nav className="mx-auto flex h-14 max-w-content items-center gap-2 px-4" aria-label="Main">
        <Link to="/" className="mr-4 flex items-center gap-2 font-semibold text-white no-underline hover:no-underline">
          <GridIcon />
          <span>
            Book <span className="font-bold">Worm</span>
          </span>
        </Link>

        <div className="hidden items-center sm:flex">
          <NavLink to="/orders" className={navClass}>
            My Orders
          </NavLink>
          <NavLink to="/wishlist" className={navClass}>
            My Wishlist
          </NavLink>
          <NavLink to="/writers" className={navClass}>
            My Writers
          </NavLink>
          {!isRegistered && (
            <NavLink to="/track-order" className={navClass}>
              Track Order
            </NavLink>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <DeliverTo />
          <Link
            to="/checkout"
            className="relative p-2 text-white hover:bg-bw-surface"
            aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
          >
            <CartIcon />
            {cartCount > 0 && (
              <span
                data-testid="cart-badge"
                className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full bg-bw-accent px-1 text-center text-[11px] font-semibold leading-[1.1rem]"
              >
                {cartCount}
              </span>
            )}
          </Link>

          <Menu as="div" className="relative">
            <MenuButton className="flex items-center gap-2 p-2 text-white hover:bg-bw-surface" aria-label="Account menu">
              <UserIcon />
              {isRegistered && <span className="hidden text-sm md:inline">{user.firstName || user.email}</span>}
            </MenuButton>
            <MenuItems
              anchor="bottom end"
              className="z-40 mt-1 w-48 border border-bw-border bg-bw-surface py-1 text-sm shadow-lg focus:outline-none"
            >
              {isRegistered ? (
                <>
                  <MenuItem>
                    <Link to="/orders" className="block px-4 py-2 text-white no-underline data-[focus]:bg-bw-surface-hover">
                      My Orders
                    </Link>
                  </MenuItem>
                  {isAdmin && (
                    <MenuItem>
                      <Link to="/admin" className="block px-4 py-2 text-white no-underline data-[focus]:bg-bw-surface-hover">
                        Admin
                      </Link>
                    </MenuItem>
                  )}
                  <MenuItem>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="block w-full px-4 py-2 text-left data-[focus]:bg-bw-surface-hover"
                    >
                      Logout
                    </button>
                  </MenuItem>
                </>
              ) : (
                <>
                  <MenuItem>
                    <Link to="/login" className="block px-4 py-2 text-white no-underline data-[focus]:bg-bw-surface-hover">
                      Login
                    </Link>
                  </MenuItem>
                  <MenuItem>
                    <Link to="/register" className="block px-4 py-2 text-white no-underline data-[focus]:bg-bw-surface-hover">
                      Register
                    </Link>
                  </MenuItem>
                  <MenuItem>
                    <Link to="/track-order" className="block px-4 py-2 text-white no-underline data-[focus]:bg-bw-surface-hover">
                      Track Order
                    </Link>
                  </MenuItem>
                </>
              )}
            </MenuItems>
          </Menu>
        </div>
      </nav>
    </header>
  );
}
