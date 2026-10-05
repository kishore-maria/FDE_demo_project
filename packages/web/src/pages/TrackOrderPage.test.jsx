import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, test } from 'vitest';
import { orderFixture, shipment } from '../test/fixtures.js';
import { API, server } from '../test/server.js';
import { renderAt, signIn, signOut } from '../test/utils.jsx';
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
