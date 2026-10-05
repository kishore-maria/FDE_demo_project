import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import toast from 'react-hot-toast';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useAuthStore } from '../stores/useAuthStore.js';
import { useCartStore } from '../stores/useCartStore.js';
import { cartResponse, joy, path } from '../test/fixtures.js';
import { API, server } from '../test/server.js';
import { renderApp, signIn, signOut, users } from '../test/utils.jsx';

vi.mock('react-hot-toast', () => import('../test/toastMock.js'));

const savedAddress = {
  id: 'addr-1',
  firstName: 'John',
  lastName: 'Smith',
  email: 'customer@test.com',
  phone: '9876543210',
  line1: '221 MG Road',
  line2: 'Near Trinity Metro Station',
  city: 'Bengaluru',
  pin: '560001',
  state: 'Karnataka',
  country: 'India',
  isDefault: true,
};

const designCart = cartResponse([[joy, 1], [path, 1]]);

function pendingOrder(totals = {}) {
  return {
    id: 'order-1',
    orderNumber: 'BW-TEST0001',
    status: 'PENDING',
    paymentStatus: 'UNPAID',
    createdAt: new Date().toISOString(),
    totals: { itemCount: 2, subtotalPaise: 50800, taxPaise: 6096, deliveryChargePaise: 0, couponDiscountPaise: 10000, giftDiscountPaise: 0, totalPaise: 46896, totalInr: '₹468.96', ...totals },
    items: [],
    flags: { canCancel: true, canReturn: false, canModifyAddress: false },
  };
}

function signedInCustomer({ giftPoints = 200 } = {}) {
  server.use(
    http.get(`${API}/cart`, () => HttpResponse.json(designCart)),
    http.get(`${API}/users/me/addresses`, () => HttpResponse.json({ items: [savedAddress] })),
    http.get(`${API}/payments/wallet`, () =>
      HttpResponse.json({ giftPoints, giftPointsValuePaise: giftPoints * 100, giftPointsValueInr: `₹${giftPoints}`, walletBalancePaise: 100000, walletBalanceInr: '₹1,000' }),
    ),
  );
  signIn('customer');
  useCartStore.setState({ mode: 'server', items: designCart.items.map(({ book, quantity }) => ({ book, quantity })) });
}

const panel = () => screen.getByRole('region', { name: 'Grand Total' });
const row = (label) => within(panel()).getByText(label).parentElement;

afterEach(() => {
  signOut();
  vi.clearAllMocks();
});

describe('CheckoutPage', () => {
  test('empty cart shows an empty state', () => {
    renderApp('/checkout');
    expect(screen.getByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument();
  });

  test('design cart totals: ₹508.00, free delivery; BOOK10 takes ₹100 off', async () => {
    signedInCustomer();
    server.use(
      http.post(`${API}/coupons/validate`, async ({ request }) => {
        const { code, subtotalPaise } = await request.json();
        expect(subtotalPaise).toBe(50800);
        return HttpResponse.json({ valid: true, code, discountPaise: 10000, discountInr: '₹100', reason: null, message: null });
      }),
    );
    renderApp('/checkout');

    expect(await screen.findByText('Price (2 items)')).toBeInTheDocument();
    expect(row('Price (2 items)')).toHaveTextContent('₹508.00');
    expect(row('Tax')).toHaveTextContent('₹60.96');
    expect(row('Delivery Charges')).toHaveTextContent('Free');

    await userEvent.type(screen.getByLabelText('Apply Coupon'), 'book10');
    await userEvent.click(within(panel()).getByRole('button', { name: 'Apply' }));
    expect(await within(panel()).findByText('BOOK10')).toBeInTheDocument();
    expect(row('Discount')).toHaveTextContent('₹100.00');
    expect(row('Total Amount')).toHaveTextContent('₹468.96');
  });

  test('invalid coupon shows its reason', async () => {
    signedInCustomer();
    server.use(
      http.post(`${API}/coupons/validate`, () =>
        HttpResponse.json({ valid: false, code: 'EXPIRED10', discountPaise: 0, discountInr: '₹0', reason: 'EXPIRED', message: 'Coupon EXPIRED10 has expired' }),
      ),
    );
    renderApp('/checkout');
    await userEvent.type(await screen.findByLabelText('Apply Coupon'), 'EXPIRED10');
    await userEvent.click(within(panel()).getByRole('button', { name: 'Apply' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Coupon EXPIRED10 has expired');
  });

  test('gift points toggle lowers the total', async () => {
    signedInCustomer({ giftPoints: 200 });
    renderApp('/checkout');
    await userEvent.click(await screen.findByRole('switch', { name: 'Use gift points' }));
    expect(row('Gift points')).toHaveTextContent('₹200.00');
    expect(row('Total Amount')).toHaveTextContent('₹368.96');
  });

  test('registered users get their saved address prefilled and can pay', async () => {
    let body;
    signedInCustomer();
    server.use(
      http.post(`${API}/orders/checkout`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ order: pendingOrder() }, { status: 201 });
      }),
    );
    renderApp('/checkout');

    await waitFor(() => expect(screen.getByLabelText('Address')).toHaveValue('221 MG Road'));
    expect(screen.getByLabelText('Pin')).toHaveValue('560001');
    expect(screen.getByLabelText('Use Saved Address')).toHaveValue('addr-1');
    await userEvent.click(screen.getByLabelText('Save this address'));
    await userEvent.click(screen.getByRole('button', { name: 'Pay Now' }));

    expect(await screen.findByRole('dialog', { name: 'Complete Payment' })).toHaveTextContent('₹468.96');
    expect(body).toMatchObject({
      address: { line1: '221 MG Road', city: 'Bengaluru', pin: '560001', line2: 'Near Trinity Metro Station' },
      saveAddress: true,
      giftPointsToRedeem: 0,
      paymentMethod: 'CREDIT_CARD',
    });
  });

  test('validation errors block Pay Now', async () => {
    let called = false;
    signedInCustomer();
    server.use(
      http.get(`${API}/users/me/addresses`, () => HttpResponse.json({ items: [] })),
      http.post(`${API}/orders/checkout`, () => {
        called = true;
        return HttpResponse.json({ order: pendingOrder() }, { status: 201 });
      }),
    );
    renderApp('/checkout');
    await screen.findByLabelText('Address');
    await userEvent.click(screen.getByRole('button', { name: 'Pay Now' }));
    expect(screen.getByText('Pin must be 6 digits')).toBeInTheDocument();
    expect(screen.getByText('Address is required')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  test('insufficient stock shows the server message and refreshes the cart', async () => {
    let cartFetches = 0;
    signedInCustomer();
    server.use(
      http.get(`${API}/cart`, () => {
        cartFetches += 1;
        return HttpResponse.json(designCart);
      }),
      http.post(`${API}/orders/checkout`, () =>
        HttpResponse.json({ error: { code: 'INSUFFICIENT_STOCK', message: 'Only 1 copies of "The Path to Success" are available' } }, { status: 409 }),
      ),
    );
    renderApp('/checkout');
    await screen.findByLabelText('Address');
    const before = cartFetches;
    await userEvent.click(screen.getByRole('button', { name: 'Pay Now' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Only 1 copies of "The Path to Success" are available'));
    await waitFor(() => expect(cartFetches).toBeGreaterThan(before));
  });

  test('removing an item asks for confirmation', async () => {
    signedInCustomer();
    server.use(http.delete(`${API}/cart/items/:bookId`, () => HttpResponse.json(cartResponse([[path, 1]]))));
    renderApp('/checkout');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Joy of Minimalism' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove from cart?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Joy of Minimalism' })).not.toBeInTheDocument());
  });
  test('paying shows the success overlay and empties the cart badge', async () => {
    signedInCustomer();
    let paid = false;
    server.use(
      http.get(`${API}/cart`, () => HttpResponse.json(paid ? cartResponse([]) : designCart)),
      http.post(`${API}/orders/checkout`, () => HttpResponse.json({ order: pendingOrder() }, { status: 201 })),
      http.post(`${API}/payments/initiate`, () =>
        HttpResponse.json({ sessionId: 's-1', orderId: 'order-1', method: 'UPI', payableAmountPaise: 46896, payableAmountInr: '₹468.96' }),
      ),
      http.post(`${API}/payments/confirm`, () => {
        paid = true;
        return HttpResponse.json({
          success: true,
          reason: null,
          order: {
            ...pendingOrder(),
            status: 'CONFIRMED',
            contactEmail: 'customer@test.com',
            items: [{ id: 'i-1', bookId: joy.id, title: 'Joy of Minimalism', coverImageUrl: joy.coverImageUrl, quantity: 1 }],
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderApp('/checkout');
    await waitFor(() => expect(screen.getByLabelText('Address')).toHaveValue('221 MG Road'));
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('2');

    await user.click(screen.getByRole('button', { name: 'Pay Now' }));
    const modal = await screen.findByRole('dialog', { name: 'Complete Payment' });
    await user.click(within(modal).getByRole('tab', { name: 'UPI' }));
    await user.type(within(modal).getByLabelText('UPI ID'), 'john@okaxis');
    await user.click(within(modal).getByRole('button', { name: 'Pay Now' }));

    expect(await screen.findByRole('dialog', { name: 'Your purchase of the following reads is successful' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument());
  });
});

describe('guest gate', () => {
  test('anonymous visitors continue as a guest and then see the address form', async () => {
    let guestEmail;
    server.use(
      http.post(`${API}/auth/guest-session`, async ({ request }) => {
        guestEmail = (await request.json()).email;
        return HttpResponse.json({ token: 'guest-token', user: { ...users.guest, email: guestEmail } });
      }),
      http.post(`${API}/cart/merge`, () => HttpResponse.json({ ...cartResponse([[joy, 1]]), skipped: [] })),
      http.get(`${API}/cart`, () => HttpResponse.json(cartResponse([[joy, 1]]))),
    );
    useCartStore.setState({ mode: 'local', items: [{ book: joy, quantity: 1 }] });
    renderApp('/checkout');

    expect(screen.getByRole('button', { name: 'Pay Now' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('e-mail'), 'reader@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue as Guest' }));

    expect(await screen.findByLabelText('First Name')).toBeInTheDocument();
    expect(guestEmail).toBe('reader@example.com');
    expect(useAuthStore.getState().user.role).toBe('GUEST');
    expect(screen.getByLabelText('e-mail')).toHaveValue('reader@example.com');
    expect(screen.queryByLabelText('Save this address')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled();
  });

  test('registered e-mails are told to log in', async () => {
    server.use(
      http.post(`${API}/auth/guest-session`, () =>
        HttpResponse.json({ error: { code: 'ACCOUNT_EXISTS', message: 'This email has an account.' } }, { status: 409 }),
      ),
    );
    useCartStore.setState({ mode: 'local', items: [{ book: joy, quantity: 1 }] });
    renderApp('/checkout');
    await userEvent.type(screen.getByLabelText('e-mail'), 'customer@test.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue as Guest' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Account exists, please login');
    expect(within(alert).getByRole('link', { name: 'login' })).toHaveAttribute('href', '/login?redirect=%2Fcheckout');
  });
});
