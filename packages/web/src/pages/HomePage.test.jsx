import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { joy, path, vanishing } from '../test/fixtures.js';
import { API, server } from '../test/server.js';
import { renderApp, signIn, signOut } from '../test/utils.jsx';

vi.mock('react-hot-toast', () => import('../test/toastMock.js'));

const categories = [
  {
    id: 'c-fic', name: 'Fiction', slug: 'fiction', parentId: null, displayOrder: 0, showInSidebar: false, bookCount: 20,
    children: [
      { id: 'c-rom', name: 'Romance', slug: 'romance', parentId: 'c-fic', displayOrder: 0, showInSidebar: true, bookCount: 3 },
      { id: 'c-thr', name: 'Thriller', slug: 'thriller', parentId: 'c-fic', displayOrder: 100, showInSidebar: false, bookCount: 4 },
    ],
  },
  {
    id: 'c-non', name: 'Non-Fiction', slug: 'non-fiction', parentId: null, displayOrder: 1, showInSidebar: false, bookCount: 16,
    children: [{ id: 'c-sh', name: 'Self-help', slug: 'self-help', parentId: 'c-non', displayOrder: 6, showInSidebar: true, bookCount: 9 }],
  },
];
const publishers = [{ id: 'p-abc', name: 'ABC Publishers', slug: 'abc-publishers', bookCount: 7 }];

const book = (title, base = joy) => ({ ...base, id: `id-${title}`, title });

function catalogHandlers() {
  const seen = [];
  server.use(
    http.get(`${API}/categories`, () => HttpResponse.json({ items: categories })),
    http.get(`${API}/publishers`, () => HttpResponse.json({ items: publishers })),
    http.get(`${API}/books/recommended`, ({ request }) =>
      HttpResponse.json(
        request.headers.get('authorization')
          ? { source: 'personalised', items: [book('Less, But Better')] }
          : { source: 'editors_pick', items: [book('The Art of Focus'), book('The Art of Learning'), book('The Path to Success'), book('Extra')] },
      ),
    ),
    http.get(`${API}/books/bestsellers`, () =>
      HttpResponse.json({ items: [book('The Midnight Hour'), book('Beneath the Stars'), book('The Final Frontier')] }),
    ),
    http.get(`${API}/books/new-launches`, () =>
      HttpResponse.json({ items: [joy, vanishing, book('The Lost Kitten')] }),
    ),
    http.get(`${API}/books`, ({ request }) => {
      const params = Object.fromEntries(new URL(request.url).searchParams);
      seen.push(params);
      const items = params.category === 'self-help' ? [joy, path] : [];
      return HttpResponse.json({ items, page: Number(params.page ?? 1), pageSize: 12, total: items.length ? 14 : 0, totalPages: items.length ? 2 : 0 });
    }),
  );
  return seen;
}

afterEach(signOut);

describe('HomePage', () => {
  test('anonymous visitors see the three design sections (3 books each)', async () => {
    catalogHandlers();
    renderApp('/');

    const recommended = await screen.findByRole('region', { name: 'Recommended for You' });
    expect(await within(recommended).findByText('The Art of Focus')).toBeInTheDocument();
    expect(within(recommended).getAllByRole('article')).toHaveLength(3);
    expect(within(recommended).getByText("Editor's picks")).toBeInTheDocument();

    const bestsellers = screen.getByRole('region', { name: 'Bestsellers this Month' });
    expect(await within(bestsellers).findByText('The Midnight Hour')).toBeInTheDocument();

    const launches = screen.getByRole('region', { name: 'New Launches' });
    expect(await within(launches).findByText('Joy of Minimalism')).toBeInTheDocument();
    expect(within(launches).getByText('The Vanishing House')).toBeInTheDocument();
  });

  test('signed-in customers get personalised recommendations', async () => {
    catalogHandlers();
    signIn('customer');
    renderApp('/');
    const recommended = await screen.findByRole('region', { name: 'Recommended for You' });
    expect(await within(recommended).findByText('Less, But Better')).toBeInTheDocument();
    expect(within(recommended).getByText('Based on your reading')).toBeInTheDocument();
  });

  test('sidebar lists sidebar genres in order and publishers', async () => {
    catalogHandlers();
    renderApp('/');
    const genres = await screen.findByRole('navigation', { name: 'Genres' });
    await within(genres).findByRole('link', { name: 'Romance' });
    expect(within(genres).getAllByRole('link').map((a) => a.textContent)).toEqual(['All', 'Romance', 'Self-help']);
    expect(screen.getByRole('link', { name: 'ABC Publishers' })).toHaveAttribute('href', '/?publisher=abc-publishers');
  });

  test('choosing a genre switches to the results grid and updates the URL', async () => {
    const seen = catalogHandlers();
    renderApp('/');
    const genres = await screen.findByRole('navigation', { name: 'Genres' });
    await userEvent.click(await within(genres).findByRole('link', { name: 'Self-help' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/?category=self-help');
    expect(await screen.findByText('14 books')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Joy of Minimalism' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Bestsellers this Month' })).not.toBeInTheDocument();
    expect(seen.at(-1)).toMatchObject({ category: 'self-help', pageSize: '12' });
    expect(screen.getByRole('button', { name: 'Remove filter Genre: Self-help' })).toBeInTheDocument();
  });

  test('URL params are applied on load (refresh keeps filters)', async () => {
    const seen = catalogHandlers();
    renderApp('/?category=self-help&sort=price_asc&format=PAPERBACK&minPrice=20000&maxPrice=40000&page=2');
    expect(await screen.findByText('14 books')).toBeInTheDocument();
    expect(seen.at(-1)).toEqual({
      category: 'self-help',
      sort: 'price_asc',
      format: 'PAPERBACK',
      minPrice: '20000',
      maxPrice: '40000',
      page: '2',
      pageSize: '12',
    });
    expect(screen.getByLabelText('Sort by')).toHaveValue('price_asc');
    expect(screen.getByLabelText('Format')).toHaveValue('PAPERBACK');
    expect(screen.getByLabelText('Price Range')).toHaveValue('20000-40000');
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });

  test('filter selects and debounced search write to the URL; chips remove filters', async () => {
    catalogHandlers();
    const user = userEvent.setup();
    renderApp('/');
    await user.selectOptions(await screen.findByLabelText('Language'), 'Hindi');
    expect(screen.getByTestId('location')).toHaveTextContent('/?language=Hindi');

    await user.type(screen.getByLabelText('Search'), 'minimalism');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('search=minimalism'), { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: 'Remove filter Hindi' }));
    expect(screen.getByTestId('location')).not.toHaveTextContent('language');
  });

  test('no results shows an empty state', async () => {
    catalogHandlers();
    renderApp('/?category=romance');
    expect(await screen.findByRole('heading', { name: 'No books found' })).toBeInTheDocument();
  });
});
