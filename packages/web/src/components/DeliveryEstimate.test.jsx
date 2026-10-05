import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GENERIC_DELIVERY_TEXT, estimateDelivery } from 'bookworm-shared';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, test } from 'vitest';
import { useDeliveryStore } from '../stores/useDeliveryStore.js';
import { joy, joyDetail, vanishing } from '../test/fixtures.js';
import { API, server } from '../test/server.js';
import { renderApp, renderAt, signIn, signOut } from '../test/utils.jsx';
import { DeliveryCheck, DeliveryText, formatCountdown } from './DeliveryEstimate.jsx';

afterEach(signOut);

describe('formatCountdown', () => {
  test.each([
    [2 * 60 * 60 * 1000 + 15 * 60 * 1000, '2 h 15 m'],
    [45 * 60 * 1000, '45 m'],
    [10 * 1000, '1 m'],
  ])('%i ms → %s', (ms, text) => expect(formatCountdown(ms)).toBe(text));
});

describe('DeliveryText', () => {
  test('without a PIN shows the server text; with a PIN shows the dated estimate', () => {
    const { rerender } = renderAt(<DeliveryText format="PAPERBACK" fallback={GENERIC_DELIVERY_TEXT} />);
    expect(screen.getByText(GENERIC_DELIVERY_TEXT)).toBeInTheDocument();

    useDeliveryStore.setState({ pin: '600001', source: 'manual' });
    rerender(<DeliveryText format="PAPERBACK" fallback={GENERIC_DELIVERY_TEXT} />);
    expect(screen.getByText(estimateDelivery({ pin: '600001' }).text)).toBeInTheDocument();
  });

  test('eBooks are always instant', () => {
    useDeliveryStore.setState({ pin: '781001', source: 'manual' });
    renderAt(<DeliveryText format="EBOOK" />);
    expect(screen.getByText('Instant download')).toBeInTheDocument();
  });
});

describe('DeliveryCheck (book detail)', () => {
  test('asks for a PIN, validates it, then shows the date and lets the shopper change it', async () => {
    const user = userEvent.setup();
    renderAt(<DeliveryCheck format="PAPERBACK" />);
    const input = screen.getByLabelText('Delivery PIN');

    await user.type(input, '1234');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByText('Enter a 6-digit PIN')).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, '999001');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByText("Sorry, we don't deliver to 999001 yet")).toBeInTheDocument();
    expect(useDeliveryStore.getState().pin).toBeNull();

    await user.clear(input);
    await user.type(input, '560001');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    const estimate = screen.getByLabelText('Delivery estimate');
    expect(estimate).toHaveTextContent(`${estimateDelivery({ pin: '560001' }).text} to 560001`);
    expect(useDeliveryStore.getState()).toMatchObject({ pin: '560001', source: 'manual' });

    await user.click(within(estimate).getByRole('button', { name: 'Change' }));
    expect(screen.getByLabelText('Delivery PIN')).toHaveValue('560001');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Delivery estimate')).toBeInTheDocument();
  });

  test('eBooks skip the PIN check', () => {
    renderAt(<DeliveryCheck format="EBOOK" />);
    expect(screen.getByText('Instant download')).toBeInTheDocument();
    expect(screen.queryByLabelText('Delivery PIN')).not.toBeInTheDocument();
  });

  test('book detail page uses the PIN check', async () => {
    server.use(http.get(`${API}/books/:bookId`, () => HttpResponse.json(joyDetail)));
    useDeliveryStore.setState({ pin: '110001', source: 'manual' });
    renderApp(`/books/${joyDetail.id}`);
    expect(await screen.findByLabelText('Delivery estimate')).toHaveTextContent(`${estimateDelivery({ pin: '110001' }).text} to 110001`);
  });
});

describe('Navbar "Deliver to"', () => {
  test('visitors set a PIN once and book cards show dated estimates', async () => {
    server.use(http.get(`${API}/books/bestsellers`, () => HttpResponse.json({ items: [joy, vanishing] })));
    const user = userEvent.setup();
    renderApp('/');
    const card = await screen.findByRole('article', { name: joy.title });
    expect(card).toHaveTextContent(joy.deliveryText);

    await user.click(screen.getByRole('button', { name: 'Enter delivery PIN' }));
    await user.type(screen.getByLabelText('Delivery PIN'), '400001');
    await user.click(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByRole('button', { name: 'Deliver to 400001, change PIN' })).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: joy.title })).getByText(estimateDelivery({ pin: '400001' }).text)).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: vanishing.title })).getByText('Instant download')).toBeInTheDocument();
  });

  test("registered customers default to their default address PIN, cleared again on logout", async () => {
    server.use(
      http.get(`${API}/users/me/addresses`, () =>
        HttpResponse.json({ items: [{ id: 'a-1', pin: '600001', isDefault: true }, { id: 'a-2', pin: '781001', isDefault: false }] }),
      ),
    );
    signIn('customer');
    const user = userEvent.setup();
    renderApp('/');
    expect(await screen.findByRole('button', { name: 'Deliver to 600001, change PIN' })).toBeInTheDocument();
    expect(useDeliveryStore.getState().source).toBe('address');

    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Logout' }));
    await waitFor(() => expect(useDeliveryStore.getState().pin).toBeNull());
  });

  test('a PIN the shopper typed is not replaced by the address PIN', async () => {
    useDeliveryStore.setState({ pin: '110001', source: 'manual' });
    server.use(http.get(`${API}/users/me/addresses`, () => HttpResponse.json({ items: [{ id: 'a-1', pin: '600001', isDefault: true }] })));
    signIn('customer');
    renderApp('/');
    expect(await screen.findByRole('button', { name: 'Deliver to 110001, change PIN' })).toBeInTheDocument();
  });
});
