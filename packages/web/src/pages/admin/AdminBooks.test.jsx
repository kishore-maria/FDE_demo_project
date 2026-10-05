import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import toast from 'react-hot-toast';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { joy, joyDetail, path, shipment, orderFixture } from '../../test/fixtures.js';
import { API, server } from '../../test/server.js';
import { renderApp, signIn, signOut } from '../../test/utils.jsx';
import { toBookPayload, validateBook, EMPTY_BOOK } from './AdminBookForm.jsx';

vi.mock('react-hot-toast', () => import('../../test/toastMock.js'));

const authors = [
  { id: 'author-daniel-reed', name: 'Daniel Reed', slug: 'daniel-reed', bio: 'Bio', bookCount: 4 },
  { id: 'author-james-wright', name: 'James Wright', slug: 'james-wright', bio: 'Bio', bookCount: 2 },
];
const publishers = [{ id: 'pub-abc', name: 'ABC Publishers', slug: 'abc-publishers', bookCount: 10 }];
const categories = [
  { id: 'cat-non-fiction', name: 'Non-Fiction', slug: 'non-fiction', parentId: null, displayOrder: 1, showInSidebar: true, bookCount: 0 },
  { id: 'cat-self-help', name: 'Self-help', slug: 'self-help', parentId: 'cat-non-fiction', displayOrder: 1, showInSidebar: true, bookCount: 5 },
  { id: 'cat-business', name: 'Business', slug: 'business', parentId: 'cat-non-fiction', displayOrder: 2, showInSidebar: true, bookCount: 3 },
];
const booksPage = { items: [joy, path], page: 1, pageSize: 20, total: 2, totalPages: 1 };

function adminHandlers() {
  const requests = [];
  server.use(
    http.get(`${API}/admin/authors`, () => HttpResponse.json({ items: authors })),
    http.get(`${API}/admin/publishers`, () => HttpResponse.json({ items: publishers })),
    http.get(`${API}/admin/categories`, () => HttpResponse.json({ items: categories })),
    http.get(`${API}/admin/books`, ({ request }) => {
      requests.push({ method: 'GET', url: request.url });
      return HttpResponse.json(booksPage);
    }),
    http.post(`${API}/admin/books`, async ({ request }) => {
      const body = await request.json();
      requests.push({ method: 'POST', body });
      return HttpResponse.json({ ...joyDetail, id: 'new-book', title: body.title }, { status: 201 });
    }),
    http.put(`${API}/admin/books/:bookId`, async ({ request, params }) => {
      const body = await request.json();
      requests.push({ method: 'PUT', id: params.bookId, body });
      return HttpResponse.json({ ...joyDetail, title: body.title });
    }),
  );
  return requests;
}

const field = (label) => screen.getByLabelText(label, { exact: false });

async function fillValidBook(user) {
  await user.type(field('Title'), 'The Quiet Garden');
  await user.selectOptions(field('Author'), 'author-james-wright');
  await user.selectOptions(field('Publisher'), 'pub-abc');
  await user.type(field('Short description'), 'Stories from a small garden.');
  await user.type(field('Price (₹)'), '249.50');
  await user.clear(field('Stock'));
  await user.type(field('Stock'), '25');
  await user.type(field('Published on'), '2026-10-01');
  await user.type(field('Front cover URL'), 'https://picsum.photos/seed/quiet/400/600');
  await user.click(screen.getByRole('checkbox', { name: 'Non-Fiction › Self-help' }));
  await user.click(screen.getByRole('checkbox', { name: 'Non-Fiction › Business' }));
  await user.click(screen.getByRole('radio', { name: 'Primary: Business' }));
  await user.selectOptions(screen.getByLabelText('Cross-sell'), [joy.id]);
}

afterEach(() => {
  signOut();
  vi.clearAllMocks();
});

describe('admin guard', () => {
  test('customers are sent home and anonymous visitors to login', async () => {
    signIn('customer');
    const { unmount } = renderApp('/admin/books/new');
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
    unmount();

    signOut();
    renderApp('/admin/books/new');
    expect(screen.getByTestId('location')).toHaveTextContent('/login?redirect=%2Fadmin%2Fbooks%2Fnew');
  });

  test('/admin opens the books section', async () => {
    signIn('admin');
    adminHandlers();
    renderApp('/admin');
    expect(await screen.findByRole('link', { name: 'Joy of Minimalism' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/books');
    expect(screen.getByRole('link', { name: 'Books' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('AdminBooks list', () => {
  test('search updates the query and the request', async () => {
    signIn('admin');
    const requests = adminHandlers();
    const user = userEvent.setup();
    renderApp('/admin/books');
    await screen.findByRole('link', { name: 'Joy of Minimalism' });
    await user.type(screen.getByRole('searchbox', { name: 'Search books' }), 'joy');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/admin/books?search=joy'));
    await waitFor(() => expect(requests.at(-1).url).toContain('search=joy'));
  });

  test('deleting a book with orders shows the API message', async () => {
    signIn('admin');
    adminHandlers();
    server.use(
      http.delete(`${API}/admin/books/:bookId`, () =>
        HttpResponse.json({ error: { code: 'BOOK_HAS_ORDERS', message: 'This book has orders and cannot be deleted.' } }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/admin/books');
    await user.click(await screen.findByRole('button', { name: 'Delete Joy of Minimalism' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This book has orders and cannot be deleted.'));
  });
});

describe('book form', () => {
  test('validateBook flags missing and invalid values', () => {
    const errors = validateBook({ ...EMPTY_BOOK, price: 'abc', coverImageUrl: 'not a url', slug: 'Bad Slug' });
    expect(errors).toMatchObject({
      title: 'Title is required',
      slug: 'Use lowercase letters, numbers and dashes',
      price: 'Enter an amount like 149 or 149.50',
      coverImageUrl: 'Enter a full URL starting with https://',
      publishedAt: 'Published on is required',
      categories: 'Pick at least one category',
    });
  });

  test('empty submit shows field errors and sends nothing', async () => {
    signIn('admin');
    const requests = adminHandlers();
    const user = userEvent.setup();
    renderApp('/admin/books/new');
    await user.click(await screen.findByRole('button', { name: 'Create book' }));

    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(screen.getByText('Author is required')).toBeInTheDocument();
    expect(screen.getByText('Publisher is required')).toBeInTheDocument();
    expect(screen.getByText('Short description is required')).toBeInTheDocument();
    expect(screen.getByText('Price (₹) is required')).toBeInTheDocument();
    expect(screen.getByText('Front cover URL is required')).toBeInTheDocument();
    expect(screen.getByText('Pick at least one category')).toBeInTheDocument();
    expect(field('Title')).toHaveAttribute('aria-invalid', 'true');
    expect(toast.error).toHaveBeenCalledWith('Please fix the highlighted fields');
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  });

  test('invalid price and URL are caught; fixing a field clears its error', async () => {
    signIn('admin');
    adminHandlers();
    const user = userEvent.setup();
    renderApp('/admin/books/new');
    await user.type(await screen.findByLabelText('Price (₹)', { exact: false }), '12.345');
    await user.type(field('Front cover URL'), 'cover.jpg');
    await user.click(screen.getByRole('button', { name: 'Create book' }));
    expect(screen.getByText('Enter an amount like 149 or 149.50')).toBeInTheDocument();
    expect(screen.getByText('Enter a full URL starting with https://')).toBeInTheDocument();

    await user.clear(field('Price (₹)'));
    await user.type(field('Price (₹)'), '120');
    expect(screen.queryByText('Enter an amount like 149 or 149.50')).not.toBeInTheDocument();
  });

  test('a valid book is created with categories, primary and relations', async () => {
    signIn('admin');
    const requests = adminHandlers();
    const user = userEvent.setup();
    renderApp('/admin/books/new');
    await screen.findByRole('button', { name: 'Create book' });
    await fillValidBook(user);
    expect(field('Slug')).toHaveValue('the-quiet-garden');
    await user.click(screen.getByRole('button', { name: 'Create book' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/admin\/books$/));
    const { body } = requests.find((r) => r.method === 'POST');
    expect(body).toEqual({
      title: 'The Quiet Garden',
      slug: 'the-quiet-garden',
      authorId: 'author-james-wright',
      publisherId: 'pub-abc',
      shortDescription: 'Stories from a small garden.',
      pricePaise: 24950,
      format: 'PAPERBACK',
      language: 'English',
      coverImageUrl: 'https://picsum.photos/seed/quiet/400/600',
      backCoverImageUrl: null,
      isbn: null,
      stockQuantity: 25,
      isEditorsPick: false,
      publishedAt: '2026-10-01T00:00:00.000Z',
      categories: [
        { categoryId: 'cat-self-help', isPrimary: false },
        { categoryId: 'cat-business', isPrimary: true },
      ],
      relations: [{ relatedBookId: joy.id, type: 'CROSS_SELL' }],
    });
    expect(toast.success).toHaveBeenCalledWith('Created "The Quiet Garden"');
  });

  test('editing prefills the form and saves with PUT', async () => {
    signIn('admin');
    const requests = adminHandlers();
    const detail = {
      ...joyDetail,
      author: { ...joyDetail.author, id: 'author-daniel-reed' },
      categories: [{ id: 'cat-self-help', name: 'Self-help', slug: 'self-help', isPrimary: true }],
      upsell: [path],
      crossSell: [],
    };
    server.use(http.get(`${API}/books/${joy.id}`, () => HttpResponse.json(detail)));
    const user = userEvent.setup();
    renderApp(`/admin/books/${joy.id}`);

    const title = await screen.findByDisplayValue('Joy of Minimalism');
    expect(field('Slug')).toHaveValue('joy-of-minimalism');
    expect(field('Price (₹)')).toHaveValue('149');
    expect(field('Author')).toHaveValue('author-daniel-reed');
    expect(screen.getByRole('checkbox', { name: 'Non-Fiction › Self-help' })).toBeChecked();
    expect(screen.getByRole('option', { name: 'The Path to Success (Paperback)', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Joy of Minimalism (Paperback)' })).not.toBeInTheDocument();

    await user.clear(title);
    await user.type(title, 'Joy of Minimalism (2nd ed.)');
    expect(field('Slug')).toHaveValue('joy-of-minimalism');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(requests.some((r) => r.method === 'PUT')).toBe(true));
    const { id, body } = requests.find((r) => r.method === 'PUT');
    expect(id).toBe(joy.id);
    expect(body).toMatchObject({
      title: 'Joy of Minimalism (2nd ed.)',
      pricePaise: 14900,
      stockQuantity: 100,
      categories: [{ categoryId: 'cat-self-help', isPrimary: true }],
      relations: [{ relatedBookId: path.id, type: 'UPSELL' }],
      description: joyDetail.description,
    });
  });

  test('toBookPayload omits an empty description and the same book cannot be up-sell and cross-sell', () => {
    const values = { ...EMPTY_BOOK, title: 'T', slug: 't', price: '10', publishedAt: '2026-01-01', categoryIds: ['c'], primaryCategoryId: 'c' };
    expect(toBookPayload(values)).not.toHaveProperty('description');
    expect(validateBook({ ...values, upsellIds: ['b'], crossSellIds: ['b'] }).relations).toBe(
      'A book can be an up-sell or a cross-sell, not both',
    );
  });
});

describe('other admin sections', () => {
  test('authors: add with an auto slug', async () => {
    signIn('admin');
    let body;
    server.use(
      http.get(`${API}/admin/authors`, () => HttpResponse.json({ items: authors })),
      http.post(`${API}/admin/authors`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 'author-new', ...body, bookCount: 0 }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/admin/authors');
    await screen.findByRole('cell', { name: 'Daniel Reed' });
    await user.click(screen.getByRole('button', { name: 'Add author' }));
    const dialog = screen.getByRole('dialog', { name: 'New author' });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Name is required')).toBeInTheDocument();
    expect(within(dialog).getByText('Bio is required')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Name', { exact: false }), 'Mira Kapoor');
    await user.type(within(dialog).getByLabelText('Bio', { exact: false }), 'Writes about cities.');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(body).toEqual({ name: 'Mira Kapoor', slug: 'mira-kapoor', bio: 'Writes about cities.' }));
  });

  test('coupons: flat values are sent in paise', async () => {
    signIn('admin');
    let body;
    server.use(
      http.get(`${API}/admin/coupons`, () => HttpResponse.json({ items: [] })),
      http.post(`${API}/admin/coupons`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 'c-1', usedCount: 0, ...body }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/admin/coupons');
    await user.click(await screen.findByRole('button', { name: 'Add coupon' }));
    const dialog = screen.getByRole('dialog', { name: 'New coupon' });
    await user.type(within(dialog).getByLabelText('Code', { exact: false }), 'SAVE50');
    await user.type(within(dialog).getByLabelText('Discount value', { exact: false }), '50');
    await user.type(within(dialog).getByLabelText('Minimum order (₹)'), '300');
    await user.type(within(dialog).getByLabelText('Valid until', { exact: false }), '2026-12-31');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(body).toEqual({
        code: 'SAVE50',
        discountType: 'FLAT',
        discountValue: 5000,
        maxDiscountPaise: null,
        minOrderValuePaise: 30000,
        validUntil: '2026-12-31T23:59:59.000Z',
        usageLimit: null,
        isActive: true,
      }),
    );
  });

  test('orders: Advance shipment moves the shipment and order forward', async () => {
    signIn('admin');
    const { contactEmail, shippingAddress, payments, couponCode, paymentMethod, ...summary } = orderFixture();
    server.use(
      http.get(`${API}/admin/orders`, () => HttpResponse.json({ items: [summary], page: 1, pageSize: 20, total: 1, totalPages: 1 })),
      http.post(`${API}/admin/shipments/ship-1/advance`, () =>
        HttpResponse.json({ shipment: shipment({ status: 'SHIPPED' }), orderStatus: 'SHIPPED' }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/admin/orders');
    const row = await screen.findByRole('row', { name: 'Order BW-TEST0001' });
    expect(within(row).getByText('Confirmed')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Advance shipment TRK-TEST00001' }));
    await waitFor(() => expect(within(row).getAllByText('Shipped')).toHaveLength(2));
    expect(toast.success).toHaveBeenCalledWith('TRK-TEST00001 → Shipped');
  });
});
