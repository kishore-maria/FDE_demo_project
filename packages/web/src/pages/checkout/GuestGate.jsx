import { useState } from 'react';
import { Link } from 'react-router-dom';
import { startGuestSession } from '../../api/auth.js';
import { errorCode, errorMessage } from '../../api/client.js';

/** Anonymous checkout: continue as a guest with an e-mail, or log in. */
export default function GuestGate() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [accountExists, setAccountExists] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid e-mail');
      return;
    }
    setBusy(true);
    setError(null);
    setAccountExists(false);
    try {
      await startGuestSession(email.trim());
    } catch (err) {
      if (errorCode(err) === 'ACCOUNT_EXISTS') setAccountExists(true);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5" aria-label="Contact details">
      <h2 className="mb-1 text-lg font-semibold">How would you like to check out?</h2>
      <p className="mb-4 text-sm text-bw-muted">We&apos;ll send your order updates to this e-mail.</p>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="guest-email" className="label">
            e-mail
          </label>
          <input
            id="guest-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="input"
            aria-invalid={Boolean(error)}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Please wait…' : 'Continue as Guest'}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {accountExists && (
        <p className="mt-2 text-sm text-bw-warning" role="alert">
          Account exists, please <Link to="/login?redirect=%2Fcheckout">login</Link>.
        </p>
      )}
      <p className="mt-4 text-sm text-bw-muted">
        Already have an account? <Link to="/login?redirect=%2Fcheckout">Login</Link>
      </p>
    </section>
  );
}
