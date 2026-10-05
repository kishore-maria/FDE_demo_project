import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useCartStore } from '../stores/useCartStore.js';
import { joyDetail } from '../test/fixtures.js';
import { API, server } from '../test/server.js';
import { renderApp, signIn, signOut } from '../test/utils.jsx';

vi.mock('react-hot-toast', () => import('../test/toastMock.js'));

const bookPath = `/books/${joyDetail.id}`;

function serveBook(overrides = {}) {
  server.use(http.get(`${API}/books/:bookId`, () => HttpResponse.json({ ...joyDetail, ...overrides })));
}

afterEach(signOut);

describe('BookDetailPage', () => {
  test('renders the book, breadcrumb, writer, reviews and shelves', async () => {
    serveBook();
    renderApp(bookPath);

    expect(await screen.findByRole('heading', { level: 1, name: 'Joy of Minimalism' })).toBeInTheDocument();
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumb).getByRole('link', { name: 'Non-Fiction' })).toHaveAttribute('href', '/?category=non-fiction');
    expect(within(breadcrumb).getByRole('link', { name: 'Self-help' })).toBeInTheDocument();

    expect(screen.getByText('₹149')).toBeInTheDocument();
    expect(screen.getByText('145 copies sold')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ABC Publishers' })).toHaveAttribute('href', '/?publisher=abc-publishers');
    expect(screen.getByText('Daniel Reed writes about simple living.')).toBeInTheDocument();
    expect(screen.getByText('A calm, practical guide. Loved it!')).toBeInTheDocument();

    expect(within(screen.getByRole('complementary', { name: 'Related Reads' })).getByText('The Path to Success')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Frequently bought together' })).getByText('The Focus Reset')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Upgrade your edition' })).getByText(/Collector's Hardcover/)).toBeInTheDocument();
  });

  test('switches between front and back covers', async () => {
    serveBook();
    renderApp(bookPath);
    await userEvent.click(await screen.findByRole('button', { name: 'Show back cover' }));
    expect(screen.getByRole('img', { name: 'Joy of Minimalism back cover' })).toBeInTheDocument();
  });

  test('Add to Cart updates the cart badge', async () => {
    serveBook();
    renderApp(bookPath);
    await screen.findByRole('heading', { level: 1, name: 'Joy of Minimalism' });
    const [mainButton] = screen.getAllByRole('button', { name: 'Add to Cart' });
    await userEvent.click(mainButton);
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('1');
    expect(useCartStore.getState().items[0].book.id).toBe(joyDetail.id);
  });

  test('anonymous visitors are sent to login by Wishlist and Follow', async () => {
    serveBook();
    renderApp(bookPath);
    await userEvent.click(await screen.findByRole('button', { name: 'Add to Wishlist' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/login?redirect=${encodeURIComponent(bookPath)}`);
  });

  test('registered users toggle the wishlist', async () => {
    const calls = [];
    serveBook({ isWishlisted: false, isFollowingAuthor: true });
    server.use(
      http.post(`${API}/wishlist`, async ({ request }) => {
        calls.push(['add', (await request.json()).bookId]);
        return HttpResponse.json({ book: joyDetail, addedAt: new Date().toISOString() });
      }),
      http.delete(`${API}/wishlist/:bookId`, ({ params }) => {
        calls.push(['remove', params.bookId]);
        return HttpResponse.json({ items: [] });
      }),
    );
    signIn('customer');
    renderApp(bookPath);

    await userEvent.click(await screen.findByRole('button', { name: 'Add to Wishlist' }));
    const inWishlist = await screen.findByRole('button', { name: 'In your Wishlist' });
    expect(inWishlist).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(inWishlist);
    await screen.findByRole('button', { name: 'Add to Wishlist' });
    expect(calls).toEqual([
      ['add', joyDetail.id],
      ['remove', joyDetail.id],
    ]);
    expect(screen.getByRole('button', { name: 'Following' })).toBeInTheDocument();
  });

  test('review form limits comments to 100 characters and adds the review on submit', async () => {
    let posted;
    serveBook({ isWishlisted: false, isFollowingAuthor: false });
    server.use(
      http.post(`${API}/books/:bookId/reviews`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({
          review: { id: 'r-new', rating: posted.rating, comment: posted.comment, createdAt: new Date().toISOString(), reviewer: { firstName: 'John' } },
          ratingAvg: 4.75,
          ratingCount: 37,
        });
      }),
    );
    signIn('customer');
    const user = userEvent.setup();
    renderApp(bookPath);

    const textarea = await screen.findByLabelText('Your review (optional)');
    await user.type(textarea, 'x'.repeat(105));
    expect(textarea).toHaveValue('x'.repeat(100));
    expect(screen.getByText('100/100')).toBeInTheDocument();

    await user.clear(textarea);
    await user.type(textarea, 'Simple and inspiring');
    expect(screen.getByText('20/100')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '4 stars' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Simple and inspiring')).toBeInTheDocument();
    expect(posted).toEqual({ rating: 4, comment: 'Simple and inspiring' });
    expect(screen.getByText('4.75 (37 ratings)')).toBeInTheDocument();
  });

  test('submitting without a rating shows an error', async () => {
    serveBook({ isWishlisted: false, isFollowingAuthor: false });
    signIn('customer');
    renderApp(bookPath);
    await userEvent.click(await screen.findByRole('button', { name: 'Submit' }));
    expect(screen.getByText('Pick a rating from 1 to 5 stars')).toBeInTheDocument();
  });

  test('anonymous visitors see a login prompt instead of the review form', async () => {
    serveBook();
    renderApp(bookPath);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('form', { name: 'Write a review' })).not.toBeInTheDocument();
    expect(screen.getByText(/to write a review/)).toBeInTheDocument();
  });

  test.each([400, 404])('API %i shows the 404 page', async (status) => {
    server.use(http.get(`${API}/books/:bookId`, () => HttpResponse.json({ error: { code: 'X', message: 'x' } }, { status })));
    renderApp('/books/not-a-real-id');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  test('follow toggles for registered users', async () => {
    serveBook({ isWishlisted: false, isFollowingAuthor: false });
    server.use(http.post(`${API}/authors/:authorId/follow`, ({ params }) => HttpResponse.json({ authorId: params.authorId, isFollowing: true }, { status: 201 })));
    signIn('customer');
    renderApp(bookPath);
    await userEvent.click(await screen.findByRole('button', { name: 'Follow' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Following' })).toBeInTheDocument());
  });
});
