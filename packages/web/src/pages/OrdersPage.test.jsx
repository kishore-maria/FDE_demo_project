import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import toast from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useCartStore } from '../stores/useCartStore.js';
import { cartResponse, joy, orderFixture, path, shipment } from '../test/fixtures.js';
import { API, server } from '../test/server.js';
import { renderAt, signIn, signOut } from '../test/utils.jsx';
import OrderDetailPage from './OrderDetailPage.jsx';
import OrdersPage from './OrdersPage.jsx';

vi.mock('react-hot-toast', () => import('../test/toastMock.js'));

const { contactEmail, shippingAddress, payments, shipments, couponCode, paymentMethod, ...summary } = orderFixture();
const fresh = { ...summary, id: 'order-fresh', orderNumber: 'BW-FRESH001', flags: { canCancel: true, canReturn: false, canModifyAddress: true } };
const delivered = {
  ...summary,
  id: 'order-b',
  orderNumber: 'BW-SEED000B',
  status: 'DELIVERED',
  flags: { canCancel: false, canReturn: true, canModifyAddress: false },
};
const old = { ...summary, id: 'order-old', orderNumber: 'BW-OLD00001', status: 'RETURNED', paymentStatus: 'REFUNDED' };

const page = (items) => ({ items, page: 1, pageSize: 10, total: items.length, totalPages: 1 });

const card = (orderNumber) => screen.getByRole('listitem', { name: `Order ${orderNumber}` });

function renderOrders() {
  renderAt(<OrdersPage />, { path: '/orders' });
}

function renderDetail(id = 'order-1') {
  renderAt(<OrderDetailPage />, { path: `/orders/${id}`, route: '/orders/:orderId' });
}

beforeEach(() => signIn('customer'));

afterEach(() => {
  signOut();
  vi.clearAllMocks();
});

describe('OrdersPage', () => {
  test('lists orders with number, date, total, status and thumbnails', async () => {
    server.use(http.get(`${API}/orders`, () => HttpResponse.json(page([fresh, delivered, old]))));
    renderOrders();

    const freshCard = await screen.findByRole('listitem', { name: 'Order BW-FRESH001' });
    expect(within(freshCard).getByRole('link', { name: 'BW-FRESH001' })).toHaveAttribute('href', '/orders/order-fresh');
    expect(freshCard).toHaveTextContent('Placed on 4 Oct 2026');
    expect(freshCard).toHaveTextContent('₹568.96');
    expect(within(freshCard).getByText('Confirmed')).toBeInTheDocument();
    expect(within(freshCard).getByRole('img', { name: 'Joy of Minimalism' })).toBeInTheDocument();
    expect(within(freshCard).getByRole('img', { name: 'The Path to Success' })).toBeInTheDocument();
  });

  test('flags drive the Cancel and Return buttons; Buy Again is always offered', async () => {
    server.use(http.get(`${API}/orders`, () => HttpResponse.json(page([fresh, delivered, old]))));
    renderOrders();
    await screen.findByRole('listitem', { name: 'Order BW-FRESH001' });

    const buttons = (orderNumber) => within(card(orderNumber)).getAllByRole('button').map((button) => button.textContent);
    expect(buttons('BW-FRESH001')).toEqual(['Buy Again', 'Cancel Order']);
    expect(buttons('BW-SEED000B')).toEqual(['Buy Again', 'Return Order']);
    expect(buttons('BW-OLD00001')).toEqual(['Buy Again']);
  });

  test('cancelling asks for confirmation and updates the order', async () => {
    let cancelled = 0;
    server.use(
      http.get(`${API}/orders`, () => HttpResponse.json(page([fresh]))),
      http.post(`${API}/orders/order-fresh/cancel`, () => {
        cancelled += 1;
        return HttpResponse.json(
          orderFixture({ ...fresh, status: 'CANCELLED', paymentStatus: 'REFUNDED', flags: { canCancel: false, canReturn: false, canModifyAddress: false } }),
        );
      }),
    );
    const user = userEvent.setup();
    renderOrders();
    await user.click(await screen.findByRole('button', { name: 'Cancel Order' }));

    const dialog = screen.getByRole('dialog', { name: 'Cancel this order?' });
    expect(dialog).toHaveTextContent('BW-FRESH001 will be cancelled and ₹568.96 refunded');
    await user.click(within(dialog).getByRole('button', { name: 'Keep order' }));
    expect(cancelled).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Cancel Order' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel order' }));

    await waitFor(() => expect(within(card('BW-FRESH001')).getByText('Cancelled')).toBeInTheDocument());
    expect(cancelled).toBe(1);
    expect(within(card('BW-FRESH001')).queryByRole('button', { name: 'Cancel Order' })).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Order cancelled. Your refund is on its way.');
  });

  test('a failed cancel shows the API error and keeps the order', async () => {
    server.use(
      http.get(`${API}/orders`, () => HttpResponse.json(page([fresh]))),
      http.post(`${API}/orders/order-fresh/cancel`, () =>
        HttpResponse.json({ error: { code: 'CANNOT_CANCEL', message: 'This order can no longer be cancelled.' } }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderOrders();
    await user.click(await screen.findByRole('button', { name: 'Cancel Order' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel order' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This order can no longer be cancelled.'));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep order' }));
    expect(within(card('BW-FRESH001')).getByText('Confirmed')).toBeInTheDocument();
  });

  test('Buy Again fills the cart and opens checkout', async () => {
    useCartStore.setState({ mode: 'server', items: [] });
    server.use(
      http.get(`${API}/orders`, () => HttpResponse.json(page([old]))),
      http.post(`${API}/cart/buy-again/order-old`, () =>
        HttpResponse.json({ ...cartResponse([[joy, 1]]), skipped: [{ bookId: path.id, title: path.title, reason: 'OUT_OF_STOCK' }] }),
      ),
    );
    const user = userEvent.setup();
    renderOrders();
    await user.click(await screen.findByRole('button', { name: 'Buy Again' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/checkout'));
    expect(useCartStore.getState().items).toEqual([{ book: joy, quantity: 1 }]);
    expect(toast).toHaveBeenCalledWith('1 book is out of stock and was skipped');
  });

  test('shows an empty state without orders', async () => {
    server.use(http.get(`${API}/orders`, () => HttpResponse.json(page([]))));
    renderOrders();
    expect(await screen.findByText('No orders yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start shopping' })).toHaveAttribute('href', '/');
  });
});

describe('OrderDetailPage', () => {
  test('shows items, address, payment, totals and shipment tracking', async () => {
    server.use(http.get(`${API}/orders/order-1`, () => HttpResponse.json(orderFixture())));
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Order BW-TEST0001' })).toBeInTheDocument();
    const items = screen.getByRole('region', { name: 'Items' });
    expect(within(items).getByRole('link', { name: 'Joy of Minimalism' })).toHaveAttribute('href', `/books/${joy.id}`);
    expect(items).toHaveTextContent('1 × ₹149');
    expect(screen.getByRole('region', { name: 'Delivery address' })).toHaveTextContent('221 MG Road');
    expect(screen.getByRole('region', { name: 'Payment' })).toHaveTextContent('UPI jo***@okaxis');
    expect(screen.getByRole('region', { name: 'Order total' })).toHaveTextContent('₹568.96');
    expect(screen.getByRole('region', { name: 'Delivery tracking' })).toHaveTextContent('TRK-TEST00001');
    expect(screen.queryByRole('button', { name: 'Change address' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Return Order' })).not.toBeInTheDocument();
  });

  test('Change address appears per canModifyAddress and saves the new address', async () => {
    let body;
    const order = orderFixture({ flags: { canCancel: true, canReturn: false, canModifyAddress: true } });
    server.use(
      http.get(`${API}/orders/order-1`, () => HttpResponse.json(order)),
      http.patch(`${API}/orders/order-1/address`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...order, shippingAddress: { ...order.shippingAddress, ...body } });
      }),
    );
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Change address' }));

    const dialog = screen.getByRole('dialog', { name: 'Change delivery address' });
    const line1 = within(dialog).getByLabelText('Address');
    expect(line1).toHaveValue('221 MG Road');
    await user.clear(line1);
    await user.type(line1, '12 Park Street');
    await user.click(within(dialog).getByRole('button', { name: 'Save address' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(body).toMatchObject({ line1: '12 Park Street', city: 'Bengaluru', pin: '560001' });
    expect(body).not.toHaveProperty('line2');
    expect(screen.getByRole('region', { name: 'Delivery address' })).toHaveTextContent('12 Park Street');
  });

  test('Return per canReturn creates a return shipment', async () => {
    const order = orderFixture({ status: 'DELIVERED', flags: { canCancel: false, canReturn: true, canModifyAddress: false } });
    server.use(
      http.get(`${API}/orders/order-1`, () => HttpResponse.json(order)),
      http.post(`${API}/orders/order-1/return`, () =>
        HttpResponse.json({
          ...order,
          status: 'RETURN_REQUESTED',
          flags: { canCancel: false, canReturn: false, canModifyAddress: false },
          shipments: [...order.shipments, shipment({ id: 'ship-r', type: 'RETURN', trackingNumber: 'TRK-RETURN001' })],
        }),
      ),
    );
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Return Order' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Return this order?' })).getByRole('button', { name: 'Request return' }));

    expect(await screen.findByRole('region', { name: 'Return tracking' })).toHaveTextContent('TRK-RETURN001');
    expect(screen.getAllByText('Return requested').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Return Order' })).not.toBeInTheDocument();
  });

  test('unknown orders show the not-found page', async () => {
    server.use(
      http.get(`${API}/orders/missing`, () => HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Order not found' } }, { status: 404 })),
    );
    renderDetail('missing');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
