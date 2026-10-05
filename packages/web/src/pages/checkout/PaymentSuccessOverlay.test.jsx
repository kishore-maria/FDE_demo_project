import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import toast from 'react-hot-toast';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useAuthStore } from '../../stores/useAuthStore.js';
import { API, server } from '../../test/server.js';
import { renderAt, signIn, signOut, users } from '../../test/utils.jsx';
import PaymentSuccessOverlay from './PaymentSuccessOverlay.jsx';

vi.mock('react-hot-toast', () => import('../../test/toastMock.js'));

const order = {
  id: 'order-1',
  orderNumber: 'BW-7K3F9QXM',
  contactEmail: 'guest@example.com',
  items: [
    { id: 'i-1', bookId: 'b-1', title: 'Joy of Minimalism', authorName: 'Daniel Reed', coverImageUrl: 'https://picsum.photos/seed/x/400/600', quantity: 1 },
  ],
};

afterEach(() => {
  signOut();
  vi.clearAllMocks();
});

describe('PaymentSuccessOverlay', () => {
  test('registered customers see the purchased books and Continue', () => {
    signIn('customer');
    renderAt(<PaymentSuccessOverlay order={order} isGuest={false} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Your purchase of the following reads is successful' })).toBeInTheDocument();
    expect(screen.getByText('Joy of Minimalism')).toBeInTheDocument();
    expect(screen.queryByTestId('order-number')).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Create a password' })).not.toBeInTheDocument();
  });

  test('Continue your Shopping goes home', async () => {
    const onClose = vi.fn();
    renderAt(<PaymentSuccessOverlay order={order} isGuest={false} onClose={onClose} />, { path: '/checkout' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue your Shopping' }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });

  test('guests get the order number, a tracking link and can create a password', async () => {
    let body;
    server.use(
      http.put(`${API}/auth/set-password`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ token: 'jwt-converted', user: { ...users.guest, role: 'CUSTOMER', firstName: 'Asha' } });
      }),
    );
    signIn('guest');
    const user = userEvent.setup();
    renderAt(<PaymentSuccessOverlay order={order} isGuest onClose={() => {}} />);

    expect(screen.getByTestId('order-number')).toHaveTextContent('BW-7K3F9QXM');
    expect(screen.getByRole('link', { name: 'Track your order →' })).toHaveAttribute(
      'href',
      '/track-order?orderNumber=BW-7K3F9QXM&email=guest%40example.com',
    );

    await user.type(screen.getByLabelText('Password'), 'Reader@123');
    await user.type(screen.getByLabelText('Confirm Password'), 'Reader@123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(useAuthStore.getState().token).toBe('jwt-converted'));
    expect(body).toEqual({ password: 'Reader@123', confirmPassword: 'Reader@123' });
    expect(useAuthStore.getState().user.role).toBe('CUSTOMER');
    expect(toast.success).toHaveBeenCalledWith('Your account is ready. Your orders are saved in My Orders.');
    expect(screen.queryByRole('form', { name: 'Create a password' })).not.toBeInTheDocument();
  });

  test('guests can skip account creation; mismatched passwords are caught', async () => {
    signIn('guest');
    const user = userEvent.setup();
    renderAt(<PaymentSuccessOverlay order={order} isGuest onClose={() => {}} />);
    await user.type(screen.getByLabelText('Password'), 'Reader@123');
    await user.type(screen.getByLabelText('Confirm Password'), 'Reader@999');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(screen.queryByRole('form', { name: 'Create a password' })).not.toBeInTheDocument();
    expect(useAuthStore.getState().user.role).toBe('GUEST');
  });

  test('shows the gift points earned; guests are told to create an account to redeem them', () => {
    const withPoints = { ...order, totals: { giftPointsEarned: 28 } };
    signIn('guest');
    renderAt(<PaymentSuccessOverlay order={withPoints} isGuest onClose={() => {}} />);
    expect(screen.getByTestId('points-earned')).toHaveTextContent(
      'You earned 28 gift points (worth ₹28) on this order. Create an account to redeem them on your next order.',
    );
    signOut();

    signIn('customer');
    renderAt(<PaymentSuccessOverlay order={withPoints} isGuest={false} onClose={() => {}} />);
    expect(screen.getByTestId('points-earned')).not.toHaveTextContent('Create an account');
  });
});
