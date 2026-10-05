import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import toast from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { joy, joyDetail, path } from '../test/fixtures.js';
import { API, server } from '../test/server.js';
import { renderApp, renderAt, signIn, signOut } from '../test/utils.jsx';
import AuthorPage from './AuthorPage.jsx';
import MyWritersPage from './MyWritersPage.jsx';

vi.mock('react-hot-toast', () => import('../test/toastMock.js'));

const writer = (name, slug, extra = {}) => ({
  id: `author-${slug}`,
  name,
  slug,
  photoUrl: null,
  bio: `${name} bio`,
  bookCount: 3,
  topCategory: null,
  ...extra,
});
const daniel = writer('Daniel Reed', 'daniel-reed', { isFollowing: true });
const james = writer('James Wright', 'james-wright', { isFollowing: true });
const clara = writer('Clara Nelson', 'clara-nelson', { isFollowing: false });

function writersHandlers({ following = [daniel, james], newBooks = [joy], suggestions = [clara] } = {}) {
  const calls = { follow: [], unfollow: [], newBooks: 0 };
  server.use(
    http.get(`${API}/authors/following`, () => HttpResponse.json({ items: following })),
    http.get(`${API}/authors/following/new-releases`, () => {
      calls.newBooks += 1;
      return HttpResponse.json({ items: newBooks });
    }),
    http.get(`${API}/authors/suggestions`, () => HttpResponse.json({ items: suggestions })),
    http.post(`${API}/authors/:id/follow`, ({ params }) => {
      calls.follow.push(params.id);
      return HttpResponse.json({ authorId: params.id, isFollowing: true }, { status: 201 });
    }),
    http.delete(`${API}/authors/:id/follow`, ({ params }) => {
      calls.unfollow.push(params.id);
      return HttpResponse.json({ authorId: params.id, isFollowing: false });
    }),
  );
  return calls;
}

const section = (name) => screen.getByRole('region', { name });

beforeEach(() => signIn('customer'));

afterEach(() => {
  signOut();
  vi.clearAllMocks();
});

describe('MyWritersPage', () => {
  test('shows Your Writers, New from Your Writers and Discover Writers', async () => {
    writersHandlers();
    renderAt(<MyWritersPage />);
    await within(section('Your Writers')).findByRole('article', { name: 'Daniel Reed' });
    expect(within(section('Your Writers')).getAllByRole('article')).toHaveLength(2);
    expect(await within(section('New from Your Writers')).findByRole('article', { name: 'Joy of Minimalism' })).toBeInTheDocument();
    expect(await within(section('Discover Writers')).findByRole('article', { name: 'Clara Nelson' })).toBeInTheDocument();
  });

  test('following a suggestion moves it to Your Writers immediately', async () => {
    const calls = writersHandlers();
    server.use(
      http.post(`${API}/authors/:id/follow`, async ({ params }) => {
        await delay(50);
        calls.follow.push(params.id);
        return HttpResponse.json({ authorId: params.id, isFollowing: true }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderAt(<MyWritersPage />);
    const card = await within(section('Discover Writers')).findByRole('article', { name: 'Clara Nelson' });
    await user.click(within(card).getByRole('button', { name: 'Follow' }));

    // Optimistic: moved before the API answers.
    expect(within(section('Your Writers')).getByRole('article', { name: 'Clara Nelson' })).toBeInTheDocument();
    expect(within(section('Discover Writers')).queryByRole('article', { name: 'Clara Nelson' })).not.toBeInTheDocument();
    expect(calls.follow).toEqual([]);

    await waitFor(() => expect(calls.follow).toEqual(['author-clara-nelson']));
    await waitFor(() => expect(calls.newBooks).toBe(2));
    expect(toast.success).toHaveBeenCalledWith("You're following Clara Nelson");
    expect(within(section('Discover Writers')).getByText('No suggestions right now')).toBeInTheDocument();
  });

  test('a failed follow is rolled back', async () => {
    writersHandlers();
    server.use(
      http.post(`${API}/authors/:id/follow`, () =>
        HttpResponse.json({ error: { code: 'ALREADY_FOLLOWING', message: 'Already following' } }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderAt(<MyWritersPage />);
    const card = await within(section('Discover Writers')).findByRole('article', { name: 'Clara Nelson' });
    await user.click(within(card).getByRole('button', { name: 'Follow' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Already following'));
    expect(within(section('Discover Writers')).getByRole('article', { name: 'Clara Nelson' })).toBeInTheDocument();
    expect(within(section('Your Writers')).queryByRole('article', { name: 'Clara Nelson' })).not.toBeInTheDocument();
  });

  test('unfollow asks for confirmation, then removes the writer', async () => {
    const calls = writersHandlers();
    const user = userEvent.setup();
    renderAt(<MyWritersPage />);
    const card = await within(section('Your Writers')).findByRole('article', { name: 'Daniel Reed' });

    await user.click(within(card).getByRole('button', { name: 'Following' }));
    const dialog = screen.getByRole('dialog', { name: 'Unfollow Daniel Reed?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(calls.unfollow).toEqual([]);
    expect(within(section('Your Writers')).getByRole('article', { name: 'Daniel Reed' })).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Following' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Unfollow' }));
    await waitFor(() => expect(within(section('Your Writers')).queryByRole('article', { name: 'Daniel Reed' })).not.toBeInTheDocument());
    await waitFor(() => expect(calls.unfollow).toEqual(['author-daniel-reed']));
    expect(within(section('Your Writers')).getByRole('article', { name: 'James Wright' })).toBeInTheDocument();
  });

  test('each section loads independently and has its own empty state', async () => {
    writersHandlers({ following: [], newBooks: [], suggestions: [] });
    server.use(
      http.get(`${API}/authors/suggestions`, () => HttpResponse.json({ error: { code: 'INTERNAL', message: 'Suggestions are unavailable' } }, { status: 500 })),
    );
    renderAt(<MyWritersPage />);
    expect(await within(section('Your Writers')).findByText("You aren't following anyone yet")).toBeInTheDocument();
    expect(await within(section('New from Your Writers')).findByText('No new books yet')).toBeInTheDocument();
    expect(await within(section('Discover Writers')).findByText('Suggestions are unavailable')).toBeInTheDocument();
  });
});

describe('AuthorPage', () => {
  const detail = { ...writer('Daniel Reed', 'daniel-reed'), bookCount: 2, isFollowing: false, books: [joy, { ...path, author: joy.author }] };

  test('shows the profile and books; Follow toggles', async () => {
    let followed = false;
    server.use(
      http.get(`${API}/authors/author-daniel-reed`, () => HttpResponse.json(detail)),
      http.post(`${API}/authors/author-daniel-reed/follow`, () => {
        followed = true;
        return HttpResponse.json({ authorId: detail.id, isFollowing: true }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderAt(<AuthorPage />, { path: '/authors/author-daniel-reed', route: '/authors/:authorId' });

    expect(await screen.findByRole('heading', { name: 'Daniel Reed' })).toBeInTheDocument();
    expect(screen.getByText('2 books')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Follow' }));
    expect(await screen.findByRole('button', { name: 'Following' })).toBeInTheDocument();
    expect(followed).toBe(true);
  });

  test('anonymous visitors are sent to login when following', async () => {
    signOut();
    server.use(http.get(`${API}/authors/author-daniel-reed`, () => HttpResponse.json({ ...detail, isFollowing: null })));
    const user = userEvent.setup();
    renderAt(<AuthorPage />, { path: '/authors/author-daniel-reed', route: '/authors/:authorId' });
    await user.click(await screen.findByRole('button', { name: 'Follow' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/login?redirect=%2Fauthors%2Fauthor-daniel-reed');
  });

  test('book detail author link opens the author page', async () => {
    server.use(
      http.get(`${API}/books/${joy.id}`, () => HttpResponse.json(joyDetail)),
      http.get(`${API}/authors/author-daniel-reed`, () => HttpResponse.json(detail)),
    );
    const user = userEvent.setup();
    renderApp(`/books/${joy.id}`);
    await screen.findByRole('heading', { name: 'Joy of Minimalism' });
    await user.click(screen.getAllByRole('link', { name: 'Daniel Reed' })[0]);
    expect(await screen.findByRole('heading', { name: 'Books by Daniel Reed' })).toBeInTheDocument();
  });
});
