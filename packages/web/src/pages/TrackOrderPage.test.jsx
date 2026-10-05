import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, test } from 'vitest';
import { useAuthStore } from '../stores/useAuthStore.js';
import { orderFixture, shipment } from '../test/fixtures.js';
import { API, server } from '../test/server.js';
import { renderAt, signIn, signOut, users } from '../test/utils.jsx';
import TrackOrderPage from './TrackOrderPage.jsx';

const { orderNumber, status, paymentStatus, createdAt, items, totals } = orderFixture({ status: 'SHIPPED' });
const tracked = {
  orderNumber,
  status,
  paymentStatus,
  createdAt,
  items,
  totals,
  shipments: [
    shipment({
      status: 'SHIPPED',
      events: [
        { status: 'PROCESSING', note: 'Order is being packed', occurredAt: '2026-10-04T09:00:00.000Z' },
        { status: 'SHIPPED', note: 'Handed to courier', occurredAt: '2026-10-05T09:00:00.000Z' },
      ],
    }),
  ],
};

function lookupHandler(respond = () => HttpResponse.json(tracked)) {
  const requests = [];
  server.use(
    http.post(`${API}/orders/lookup`, async ({ request }) => {
      requests.push({ body: await request.json(), authorization: request.headers.get('authorization') });
      return respond();
    }),
  );
  return requests;
}

function renderTrack(path = '/track-order') {
  renderAt(<TrackOrderPage />, { path });
}

afterEach(signOut);

describe('TrackOrderPage', () => {
  test('finds an order and shows status, items, total and the timeline with ETA', async () => {
    const requests = lookupHandler();
    const user = userEvent.setup();
    renderTrack();
    await user.type(screen.getByLabelText('e-mail'), 'customer@test.com');
    await user.type(screen.getByLabelText('Order number'), 'bw-test0001');
    await user.click(screen.getByRole('button', { name: 'Track' }));

    const result = await screen.findByRole('region', { name: 'Order BW-TEST0001' });
    expect(within(result).getAllByText('Shipped').length).toBeGreaterThan(0);
    expect(within(result).getByRole('list', { name: 'Items' })).toHaveTextContent('Joy of Minimalism × 1');
    expect(result).toHaveTextContent('₹568.96');
    expect(within(result).getByRole('region', { name: 'Delivery tracking' })).toHaveTextContent('Delivery by Thu, 8 Oct');
    expect(requests[0].body).toEqual({ email: 'customer@test.com', orderNumber: 'BW-TEST0001' });
  });

  test('never sends the Authorization header, even when signed in', async () => {
    signIn('customer');
    const requests = lookupHandler();
    const user = userEvent.setup();
    renderTrack();
    await user.type(screen.getByLabelText('e-mail'), 'customer@test.com');
    await user.type(screen.getByLabelText('Order number'), 'BW-TEST0001');
    await user.click(screen.getByRole('button', { name: 'Track' }));
    await screen.findByRole('region', { name: 'Order BW-TEST0001' });
    expect(requests[0].authorization).toBeNull();
  });

  test('prefills from the query string and looks the order up straight away', async () => {
    const requests = lookupHandler();
    renderTrack('/track-order?orderNumber=BW-TEST0001&email=guest%40example.com');
    expect(screen.getByLabelText('e-mail')).toHaveValue('guest@example.com');
    expect(screen.getByLabelText('Order number')).toHaveValue('BW-TEST0001');
    await screen.findByRole('region', { name: 'Order BW-TEST0001' });
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({ email: 'guest@example.com', orderNumber: 'BW-TEST0001' });
  });

  test('validates the form before calling the API', async () => {
    const requests = lookupHandler();
    const user = userEvent.setup();
    renderTrack();
    await user.type(screen.getByLabelText('e-mail'), 'nope');
    await user.type(screen.getByLabelText('Order number'), '12345');
    await user.click(screen.getByRole('button', { name: 'Track' }));
    expect(screen.getByText('Enter the e-mail used for the order')).toBeInTheDocument();
    expect(screen.getByText('Order numbers look like BW-7K3F9QXM')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  test('wrong details show a not-found message', async () => {
    lookupHandler(() => HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Order not found' } }, { status: 404 }));
    const user = userEvent.setup();
    renderTrack();
    await user.type(screen.getByLabelText('e-mail'), 'someone@else.com');
    await user.type(screen.getByLabelText('Order number'), 'BW-TEST0001');
    await user.click(screen.getByRole('button', { name: 'Track' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't find an order with those details");
    expect(screen.queryByRole('region', { name: /^Order / })).not.toBeInTheDocument();
  });

  test('rate limiting shows a wait message', async () => {
    lookupHandler(() => HttpResponse.json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, { status: 429 }));
    const user = userEvent.setup();
    renderTrack();
    await user.type(screen.getByLabelText('e-mail'), 'customer@test.com');
    await user.type(screen.getByLabelText('Order number'), 'BW-TEST0001');
    await user.click(screen.getByRole('button', { name: 'Track' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts. Please wait a few minutes'));
  });

  test('links to login for registered customers', () => {
    renderTrack();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login?redirect=%2Forders');
  });
});

describe('TrackOrderPage → Manage this order (guests)', () => {
  const guestOrder = orderFixture({
    contactEmail: 'guest@example.com',
    confirmedAt: '2026-10-04T09:01:00.000Z',
    flags: { canCancel: true, canReturn: false, canModifyAddress: true },
  });
  const access = { token: 'order-token', expiresAt: '2026-10-04T09:31:00.000Z', order: guestOrder, giftPoints: 28 };

  function manageHandlers({ verify = () => HttpResponse.json(access) } = {}) {
    const calls = [];
    lookupHandler(() => HttpResponse.json({ ...tracked, orderNumber: guestOrder.orderNumber }));
    server.use(
      http.post(`${API}/orders/lookup/verify`, async ({ request }) => {
        calls.push({ path: 'verify', body: await request.json(), authorization: request.headers.get('authorization') });
        return verify();
      }),
      http.post(`${API}/orders/:orderId/cancel`, ({ request }) => {
        calls.push({ path: 'cancel', authorization: request.headers.get('authorization') });
        return HttpResponse.json({ ...guestOrder, status: 'CANCELLED', flags: { canCancel: false, canReturn: false, canModifyAddress: false } });
      }),
      http.put(`${API}/auth/set-password`, async ({ request }) => {
        calls.push({ path: 'claim', body: await request.json(), authorization: request.headers.get('authorization') });
        return HttpResponse.json({ token: 'jwt-claimed', user: { ...users.guest, role: 'CUSTOMER', giftPoints: 28 } });
      }),
    );
    return calls;
  }

  async function verifyGuest(user, digits = '3210') {
    renderTrack('/track-order?orderNumber=BW-TEST0001&email=guest%40example.com');
    const manage = await screen.findByRole('region', { name: 'Manage this order' });
    await user.type(within(manage).getByLabelText('Last 4 digits of the phone number on the order'), digits);
    await user.click(within(manage).getByRole('button', { name: 'Verify' }));
    return manage;
  }

  test('verifies with the phone digits, then shows actions and the waiting gift points', async () => {
    const calls = manageHandlers();
    const user = userEvent.setup();
    const manage = await verifyGuest(user);

    const points = await within(manage).findByRole('region', { name: 'Gift points' });
    expect(points).toHaveTextContent('This order earned 28 gift points');
    expect(points).toHaveTextContent('You have 28 gift points (worth ₹28) waiting');
    expect(within(manage).getByRole('button', { name: 'Change address' })).toBeInTheDocument();
    expect(within(manage).queryByRole('button', { name: 'Buy Again' })).not.toBeInTheDocument();
    expect(calls[0]).toEqual({
      path: 'verify',
      body: { email: 'guest@example.com', orderNumber: 'BW-TEST0001', phoneLast4: '3210' },
      authorization: null,
    });
  });

  test('cancelling uses the order token and takes back the points this order earned', async () => {
    signIn('customer');
    const calls = manageHandlers();
    const user = userEvent.setup();
    const manage = await verifyGuest(user);

    await user.click(await within(manage).findByRole('button', { name: 'Cancel Order' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel order' }));

    await waitFor(() => expect(within(manage).getByRole('region', { name: 'Gift points' })).not.toHaveTextContent('waiting'));
    expect(calls.find((c) => c.path === 'cancel').authorization).toBe('Bearer order-token');
    expect(within(manage).getByText('This order can no longer be changed online.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Order BW-TEST0001' })).toHaveTextContent('Cancelled');
  });

  test('creating the account claims it with the order token, signs in and opens the order', async () => {
    const calls = manageHandlers();
    const user = userEvent.setup();
    const manage = await verifyGuest(user);

    const claim = await within(manage).findByRole('form', { name: 'Create your account' });
    await user.type(within(claim).getByLabelText('Password'), 'Reader@123');
    await user.type(within(claim).getByLabelText('Confirm Password'), 'Reader@123');
    await user.click(within(claim).getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/orders/order-1'));
    expect(useAuthStore.getState()).toMatchObject({ token: 'jwt-claimed', user: { role: 'CUSTOMER' } });
    expect(calls.find((c) => c.path === 'claim')).toEqual({
      path: 'claim',
      body: { password: 'Reader@123', confirmPassword: 'Reader@123' },
      authorization: 'Bearer order-token',
    });
  });

  test('wrong digits and account orders get clear messages', async () => {
    manageHandlers({ verify: () => HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'nope' } }, { status: 404 }) });
    const user = userEvent.setup();
    const manage = await verifyGuest(user, '0000');
    expect(await within(manage).findByText("Those digits don't match the phone number on this order.")).toBeInTheDocument();

    server.use(
      http.post(`${API}/orders/lookup/verify`, () =>
        HttpResponse.json({ error: { code: 'ACCOUNT_ORDER', message: 'Log in' } }, { status: 409 }),
      ),
    );
    await user.click(within(manage).getByRole('button', { name: 'Verify' }));
    expect(await within(manage).findByRole('alert')).toHaveTextContent('This order belongs to a BookWorm account.');
  });
});
