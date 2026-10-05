import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import toast from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useCartStore } from '../stores/useCartStore.js';
import { cartResponse, joy, path } from '../test/fixtures.js';
import { API, server } from '../test/server.js';
import { renderApp, renderAt, signIn, signOut } from '../test/utils.jsx';
import WishlistPage from './WishlistPage.jsx';

vi.mock('react-hot-toast', () => import('../test/toastMock.js'));

const entry = (book) => ({ book, addedAt: '2026-10-01T10:00:00.000Z' });

beforeEach(() => signIn('customer'));

afterEach(() => {
  signOut();
  vi.clearAllMocks();
});

describe('WishlistPage', () => {
  test('lists wishlisted books as cards', async () => {
    server.use(http.get(`${API}/wishlist`, () => HttpResponse.json({ items: [entry(joy), entry(path)] })));
    renderAt(<WishlistPage />);
    const list = await screen.findByRole('list', { name: 'Wishlisted books' });
    expect(within(list).getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual([
      'Joy of Minimalism',
      'The Path to Success',
    ]);
    expect(within(list).getByRole('link', { name: 'Joy of Minimalism' })).toHaveAttribute('href', `/books/${joy.id}`);
  });

  test('remove takes the book off the list', async () => {
    let removed;
    server.use(
      http.get(`${API}/wishlist`, () => HttpResponse.json({ items: [entry(joy), entry(path)] })),
      http.delete(`${API}/wishlist/:bookId`, ({ params }) => {
        removed = params.bookId;
        return HttpResponse.json({ items: [entry(path)] });
      }),
    );
    const user = userEvent.setup();
    renderAt(<WishlistPage />);
    await user.click(await screen.findByRole('button', { name: 'Remove Joy of Minimalism from wishlist' }));

    await waitFor(() => expect(screen.queryByRole('article', { name: 'Joy of Minimalism' })).not.toBeInTheDocument());
    expect(removed).toBe(joy.id);
    expect(screen.getByRole('article', { name: 'The Path to Success' })).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith('Removed "Joy of Minimalism" from your wishlist');
  });

  test('removing the last book shows the empty state', async () => {
    server.use(
      http.get(`${API}/wishlist`, () => HttpResponse.json({ items: [entry(joy)] })),
      http.delete(`${API}/wishlist/:bookId`, () => HttpResponse.json({ items: [] })),
    );
    const user = userEvent.setup();
    renderAt(<WishlistPage />);
    await user.click(await screen.findByRole('button', { name: 'Remove Joy of Minimalism from wishlist' }));
    expect(await screen.findByText('Your wishlist is empty')).toBeInTheDocument();
  });

  test('empty wishlist shows an empty state with a browse link', async () => {
    server.use(http.get(`${API}/wishlist`, () => HttpResponse.json({ items: [] })));
    renderAt(<WishlistPage />);
    expect(await screen.findByText('Your wishlist is empty')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse books' })).toHaveAttribute('href', '/');
  });

  test('add to cart from the wishlist', async () => {
    useCartStore.setState({ mode: 'server', items: [] });
    server.use(
      http.get(`${API}/wishlist`, () => HttpResponse.json({ items: [entry(joy)] })),
      http.post(`${API}/cart/items`, () => HttpResponse.json(cartResponse([[joy, 1]]))),
    );
    const user = userEvent.setup();
    renderAt(<WishlistPage />);
    const card = await screen.findByRole('article', { name: 'Joy of Minimalism' });
    await user.click(within(card).getByRole('button', { name: 'Add to Cart' }));
    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(1));
  });

  test('anonymous visitors are sent to login', async () => {
    signOut();
    renderApp('/wishlist');
    expect(await screen.findByTestId('location')).toHaveTextContent('/login?redirect=%2Fwishlist');
  });
});
