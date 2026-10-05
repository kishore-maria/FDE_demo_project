import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import toast from 'react-hot-toast';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useAuthStore } from '../stores/useAuthStore.js';
import { API, server } from '../test/server.js';
import { renderApp, signOut } from '../test/utils.jsx';

vi.mock('react-hot-toast', () => import('../test/toastMock.js'));

afterEach(() => {
  signOut();
  vi.clearAllMocks();
});

async function fill(values) {
  const user = userEvent.setup();
  for (const [label, value] of Object.entries(values)) {
    if (value) await user.type(screen.getByLabelText(label), value);
  }
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

const valid = {
  'First Name': 'Asha',
  'Last Name': 'Rao',
  'e-mail': 'asha@example.com',
  Password: 'Reader@123',
  'Confirm Password': 'Reader@123',
};

describe('RegisterPage', () => {
  test('mismatched passwords show an inline error and nothing is sent', async () => {
    renderApp('/register');
    await fill({ ...valid, 'Confirm Password': 'Reader@124' });
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(useAuthStore.getState().token).toBeNull();
  });

  test('weak passwords are rejected before submitting', async () => {
    renderApp('/register');
    await fill({ ...valid, Password: 'reader12', 'Confirm Password': 'reader12' });
    expect(screen.getByText('Include an uppercase letter and a number')).toBeInTheDocument();
  });

  test('creates the account, signs in and goes home', async () => {
    let body;
    server.use(
      http.post(`${API}/auth/register`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { token: 'jwt-new', user: { id: 'u-9', email: body.email, firstName: 'Asha', lastName: 'Rao', role: 'CUSTOMER' } },
          { status: 201 },
        );
      }),
    );
    renderApp('/register');
    await fill(valid);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(body).toEqual({ firstName: 'Asha', lastName: 'Rao', email: 'asha@example.com', password: 'Reader@123' });
    expect(useAuthStore.getState().token).toBe('jwt-new');
    expect(toast.success).toHaveBeenCalledWith('Welcome to BookWorm, Asha!');
  });

  test('409 email in use is shown next to the e-mail field', async () => {
    server.use(
      http.post(`${API}/auth/register`, () =>
        HttpResponse.json({ error: { code: 'EMAIL_IN_USE', message: 'An account with this email already exists.' } }, { status: 409 }),
      ),
    );
    renderApp('/register');
    await fill(valid);
    expect(await screen.findByText('This e-mail is already registered. Please log in instead.')).toBeInTheDocument();
    expect(useAuthStore.getState().token).toBeNull();
  });
});
