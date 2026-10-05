import { screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { renderApp, signIn, signOut } from '../test/utils.jsx';

afterEach(signOut);

describe('AppRoutes', () => {
  test.each([
    ['/', 'Catalogue'],
    ['/books/3655c0fb-15c6-56a2-a40d-e0636592fb83', 'Book details'],
    ['/checkout', 'Checkout'],
    ['/track-order', 'Track Order'],
    ['/login', 'Login'],
    ['/register', 'Register'],
  ])('anonymous visitors can open %s', (path, heading) => {
    renderApp(path);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  test('/cart redirects to /checkout', () => {
    renderApp('/cart');
    expect(screen.getByTestId('location')).toHaveTextContent('/checkout');
  });

  test.each(['/orders', '/wishlist', '/writers', '/orders/abc'])('%s redirects anonymous visitors to login', (path) => {
    renderApp(path);
    expect(screen.getByTestId('location')).toHaveTextContent(`/login?redirect=${encodeURIComponent(path)}`);
  });

  test('guests are treated like anonymous visitors on registered pages', () => {
    signIn('guest');
    renderApp('/orders');
    expect(screen.getByTestId('location')).toHaveTextContent('/login?redirect=');
  });

  test('registered customers can open their pages', () => {
    signIn('customer');
    renderApp('/orders');
    expect(screen.getByRole('heading', { level: 1, name: 'My Orders' })).toBeInTheDocument();
  });

  test('admin pages: customers go home, admins get in', () => {
    signIn('customer');
    const { unmount } = renderApp('/admin');
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
    unmount();

    signIn('admin');
    renderApp('/admin/books');
    expect(screen.getByRole('heading', { level: 1, name: 'Admin' })).toBeInTheDocument();
  });

  test('unknown paths show the 404 page', () => {
    renderApp('/does/not/exist');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  test('navbar shows Track Order only when not registered', () => {
    const { unmount } = renderApp('/');
    expect(screen.getByRole('link', { name: 'Track Order' })).toBeInTheDocument();
    unmount();

    signIn('customer');
    renderApp('/');
    expect(screen.queryByRole('link', { name: 'Track Order' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Orders' })).toBeInTheDocument();
  });
});
