import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { API, server } from '../../test/server.js';
import { renderAt, signIn, signOut } from '../../test/utils.jsx';
import PaymentModal, { formatCardNumber, formatExpiry } from './PaymentModal.jsx';

vi.mock('react-hot-toast', () => import('../../test/toastMock.js'));

const order = {
  id: 'order-1',
  orderNumber: 'BW-TEST0001',
  totals: { totalPaise: 46896, totalInr: '₹468.96' },
};

function paymentHandlers({ outcomes = [{ success: true }] } = {}) {
  const confirms = [];
  let sessions = 0;
  server.use(
    http.post(`${API}/payments/initiate`, async ({ request }) => {
      const { method } = await request.json();
      sessions += 1;
      return HttpResponse.json({ sessionId: `s-${sessions}`, orderId: order.id, method, payableAmountPaise: 46896, payableAmountInr: '₹468.96' });
    }),
    http.post(`${API}/payments/confirm`, async ({ request }) => {
      const body = await request.json();
      confirms.push(body);
      const outcome = outcomes[Math.min(confirms.length - 1, outcomes.length - 1)];
      return HttpResponse.json({
        success: outcome.success,
        reason: outcome.success ? null : 'Payment declined',
        order: { ...order, status: outcome.success ? 'CONFIRMED' : 'PENDING', items: [], contactEmail: 'a@b.com' },
      });
    }),
    http.get(`${API}/payments/wallet`, () =>
      HttpResponse.json({ giftPoints: 0, giftPointsValuePaise: 0, giftPointsValueInr: '₹0', walletBalancePaise: 1000, walletBalanceInr: '₹10' }),
    ),
  );
  return confirms;
}

function renderModal(props = {}) {
  const handlers = { onClose: vi.fn(), onPaid: vi.fn(), onExpired: vi.fn() };
  renderAt(<PaymentModal order={order} {...handlers} {...props} />);
  return handlers;
}

async function fillCard(user) {
  await user.type(screen.getByLabelText('Card Number'), '4242424242424242');
  await user.type(screen.getByLabelText('Name on Card'), 'Asha Rao');
  await user.type(screen.getByLabelText('CVV'), '123');
  await user.type(screen.getByLabelText('Date of Expiry'), '122030');
}

afterEach(() => {
  signOut();
  vi.clearAllMocks();
});

describe('formatters', () => {
  test('card number groups digits with dashes and drops letters', () => {
    expect(formatCardNumber('4242 4242a4242424299999')).toBe('4242-4242-4242-4242');
  });

  test('expiry becomes MM/YYYY', () => {
    expect(formatExpiry('122030')).toBe('12/2030');
    expect(formatExpiry('1')).toBe('1');
  });
});

describe('PaymentModal', () => {
  test('shows the server payable amount and all four tabs for registered users', () => {
    signIn('customer');
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Complete Payment' })).toHaveTextContent('₹468.96');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Credit Card', 'Debit card', 'UPI', 'Wallet']);
  });

  test('guests do not see the Wallet tab', () => {
    signIn('guest');
    renderModal();
    expect(screen.queryByRole('tab', { name: 'Wallet' })).not.toBeInTheDocument();
  });

  test('card payment sends the card once and clears the CVV afterwards', async () => {
    signIn('customer');
    const confirms = paymentHandlers();
    const user = userEvent.setup();
    const { onPaid } = renderModal();

    await fillCard(user);
    expect(screen.getByLabelText('Card Number')).toHaveValue('4242-4242-4242-4242');
    await user.click(screen.getByRole('button', { name: 'Pay Now' }));

    await waitFor(() => expect(onPaid).toHaveBeenCalled());
    expect(confirms).toEqual([
      { sessionId: 's-1', card: { number: '4242-4242-4242-4242', nameOnCard: 'Asha Rao', expiry: '12/2030', cvv: '123' } },
    ]);
    expect(screen.getByLabelText('CVV')).toHaveValue('');
    expect(JSON.stringify(localStorage)).not.toContain('4242');
    expect(JSON.stringify(localStorage)).not.toContain('"123"');
  });

  test('invalid card details are caught before calling the API', async () => {
    signIn('customer');
    const confirms = paymentHandlers();
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText('Card Number'), '4242');
    await user.type(screen.getByLabelText('Date of Expiry'), '012020');
    await user.click(screen.getByRole('button', { name: 'Pay Now' }));
    expect(screen.getByText('Enter the 16-digit card number')).toBeInTheDocument();
    expect(screen.getByText('This card has expired')).toBeInTheDocument();
    expect(screen.getByText('CVV is 3 or 4 digits')).toBeInTheDocument();
    expect(confirms).toEqual([]);
  });

  test('a declined payment can be retried', async () => {
    signIn('customer');
    const confirms = paymentHandlers({ outcomes: [{ success: false }, { success: true }] });
    const user = userEvent.setup();
    const { onPaid } = renderModal();

    await user.click(screen.getByRole('tab', { name: 'UPI' }));
    await user.type(screen.getByLabelText('UPI ID'), 'asha.rao@okaxis');
    await user.click(screen.getByRole('button', { name: 'Pay Now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Payment declined. You can try again.');
    expect(onPaid).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(onPaid).toHaveBeenCalledTimes(1));
    expect(confirms.map((c) => c.sessionId)).toEqual(['s-1', 's-2']);
    expect(confirms[0]).toEqual({ sessionId: 's-1', upiId: 'asha.rao@okaxis' });
  });

  test('DEV "Simulate failure" sends forceFailure', async () => {
    signIn('customer');
    const confirms = paymentHandlers({ outcomes: [{ success: false }] });
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('tab', { name: 'UPI' }));
    await user.type(screen.getByLabelText('UPI ID'), 'a.b@okaxis');
    await user.click(screen.getByLabelText('Simulate failure (dev only)'));
    await user.click(screen.getByRole('button', { name: 'Pay Now' }));
    await screen.findByRole('alert');
    expect(confirms[0].forceFailure).toBe(true);
  });

  test('wallet with too little balance cannot pay', async () => {
    signIn('customer');
    paymentHandlers();
    renderModal();
    await userEvent.click(screen.getByRole('tab', { name: 'Wallet' }));
    expect(await screen.findByText('Insufficient wallet balance for this order.')).toBeInTheDocument();
    expect(screen.getByText('₹10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay Now' })).toBeDisabled();
  });

  test('expired reservation offers a way back to checkout', async () => {
    signIn('customer');
    server.use(
      http.post(`${API}/payments/initiate`, () =>
        HttpResponse.json({ error: { code: 'RESERVATION_EXPIRED', message: 'Your reservation has expired.' } }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    const { onExpired } = renderModal();
    await user.click(screen.getByRole('tab', { name: 'UPI' }));
    await user.type(screen.getByLabelText('UPI ID'), 'a.b@okaxis');
    await user.click(screen.getByRole('button', { name: 'Pay Now' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your reservation has expired');
    await user.click(within(alert).getByRole('button', { name: 'Back to checkout' }));
    expect(onExpired).toHaveBeenCalled();
  });
});
