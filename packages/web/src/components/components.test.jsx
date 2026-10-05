import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import toast from 'react-hot-toast';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useCartStore } from '../stores/useCartStore.js';
import { cartResponse, joy, vanishing } from '../test/fixtures.js';
import { API, server } from '../test/server.js';
import { signIn, signOut } from '../test/utils.jsx';
import AddressForm, { validateAddress } from './AddressForm.jsx';
import BookCard from './BookCard.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import EmptyState from './EmptyState.jsx';
import ShipmentTimeline from './ShipmentTimeline.jsx';
import StarRating from './StarRating.jsx';
import StatusBadge from './StatusBadge.jsx';

vi.mock('react-hot-toast', () => {
  const toastFn = vi.fn();
  toastFn.error = vi.fn();
  toastFn.success = vi.fn();
  return { default: toastFn, toast: toastFn, Toaster: () => null };
});

const withRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

afterEach(signOut);

describe('BookCard', () => {
  test('shows the design details', () => {
    withRouter(<BookCard book={joy} />);
    const card = screen.getByRole('article', { name: 'Joy of Minimalism' });
    expect(within(card).getByText('₹149')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Daniel Reed' })).toHaveAttribute('href', `/authors/${joy.author.id}`);
    expect(within(card).getByRole('link', { name: 'Self-help' })).toHaveAttribute('href', '/?category=self-help');
    expect(within(card).getByText('Delivery by Thu, 8 Oct')).toBeInTheDocument();
    expect(within(card).getByText(/Paperback/)).toBeInTheDocument();
  });

  test('eBooks say "Instant download"', () => {
    withRouter(<BookCard book={vanishing} />);
    expect(screen.getByText('Instant download')).toBeInTheDocument();
    expect(screen.getByText(/eBook/)).toBeInTheDocument();
  });

  test('Add to Cart is reachable by keyboard and adds to the local cart', async () => {
    const user = userEvent.setup();
    withRouter(<BookCard book={joy} />);
    const button = screen.getByRole('button', { name: 'Add to Cart' });
    await user.click(button);
    expect(useCartStore.getState().items).toEqual([{ book: joy, quantity: 1 }]);
    expect(toast.success).toHaveBeenCalledWith('Added "Joy of Minimalism" to your cart');
  });

  test('signed-in users add through the API', async () => {
    server.use(http.post(`${API}/cart/items`, () => HttpResponse.json(cartResponse([[joy, 1]]))));
    signIn('customer');
    useCartStore.setState({ mode: 'server', items: [] });
    withRouter(<BookCard book={joy} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
    expect(useCartStore.getState().items[0].quantity).toBe(1);
  });

  test('out-of-stock books cannot be added', () => {
    withRouter(<BookCard book={{ ...joy, inStock: false }} />);
    expect(screen.getByRole('button', { name: 'Out of stock' })).toBeDisabled();
  });
});

describe('ConfirmDialog', () => {
  test('confirm and cancel call their handlers', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog open title="Cancel order?" message="This cannot be undone." onConfirm={onConfirm} onClose={onClose} destructive confirmLabel="Yes, cancel" />);
    expect(screen.getByRole('dialog', { name: 'Cancel order?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('renders nothing when closed', () => {
    render(<ConfirmDialog open={false} title="Hidden" onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  test('shows title, message and action', () => {
    render(<EmptyState title="Your cart is empty" message="Find something to read." action={<button type="button">Browse</button>} />);
    expect(screen.getByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument();
    expect(screen.getByText('Find something to read.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument();
  });
});

describe('StarRating', () => {
  test('read-only rounds to the nearest star', () => {
    const { container } = render(<StarRating value={4.6} />);
    expect(screen.getByRole('img', { name: '4.6 out of 5 stars' })).toBeInTheDocument();
    expect(container.querySelectorAll('svg[fill="currentColor"]')).toHaveLength(5);
  });

  test('interactive reports the picked value', async () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});

describe('StatusBadge', () => {
  test.each([
    ['DELIVERED', 'Delivered'],
    ['RETURN_REQUESTED', 'Return requested'],
    ['OUT_FOR_DELIVERY', 'Out for delivery'],
    ['PENDING', 'Pending payment'],
    ['REFUNDED', 'Refunded'],
  ])('%s → %s', (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toHaveAttribute('data-status', status);
  });
});

describe('AddressForm', () => {
  test('validateAddress checks required fields, pin and phone', () => {
    expect(validateAddress({ pin: '123', phone: '98765', email: 'nope' })).toMatchObject({
      firstName: 'First name is required',
      pin: 'Pin must be 6 digits',
      phone: 'Phone must be 10 digits',
      email: 'Enter a valid e-mail',
    });
  });

  test('shows errors and only submits valid data', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <AddressForm onSubmit={onSubmit}>
        <button type="submit">Save</button>
      </AddressForm>,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Pin must be 6 digits')).toBeInTheDocument();

    await user.type(screen.getByLabelText('First Name'), 'Asha');
    await user.type(screen.getByLabelText('Last Name'), 'Rao');
    await user.type(screen.getByLabelText('Address'), '12 Lake Road');
    await user.type(screen.getByLabelText('e-mail'), 'asha@example.com');
    await user.type(screen.getByLabelText('City'), 'Chennai');
    await user.type(screen.getByLabelText('Pin'), '60a0001');
    await user.type(screen.getByLabelText('Phone'), '98765-43210');
    await user.type(screen.getByLabelText('State'), 'Tamil Nadu');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith({
      firstName: 'Asha',
      lastName: 'Rao',
      email: 'asha@example.com',
      phone: '9876543210',
      line1: '12 Lake Road',
      city: 'Chennai',
      pin: '600001',
      state: 'Tamil Nadu',
      country: 'India',
    });
  });
});

describe('ShipmentTimeline', () => {
  test('marks reached steps and lists events', () => {
    render(
      <ShipmentTimeline
        shipment={{
          type: 'FORWARD',
          trackingNumber: 'TRK-ABC',
          status: 'SHIPPED',
          estimatedDeliveryText: 'Delivery by Thu, 8 Oct',
          events: [
            { status: 'PROCESSING', note: 'Order confirmed and being packed', occurredAt: '2026-10-01T10:00:00Z' },
            { status: 'SHIPPED', note: 'Handed over to BookWorm Express', occurredAt: '2026-10-02T10:00:00Z' },
          ],
        }}
      />,
    );
    const steps = screen.getByRole('list', { name: 'Progress' }).querySelectorAll('li');
    expect([...steps].map((li) => li.dataset.done)).toEqual(['true', 'true', 'false', 'false']);
    expect(screen.getByText('Handed over to BookWorm Express')).toBeInTheDocument();
    expect(screen.getByText('TRK-ABC')).toBeInTheDocument();
  });
});
