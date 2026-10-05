import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { login } from '../api/auth.js';
import { errorMessage } from '../api/client.js';
import TextField from '../components/TextField.jsx';
import { safeRedirect } from '../utils/redirect.js';

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get('redirect'));
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = {};
    if (!form.email.trim()) found.email = 'Enter your e-mail';
    if (!form.password) found.password = 'Enter your password';
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      const user = await login({ email: form.email.trim(), password: form.password });
      toast.success(`Welcome back${user.firstName ? `, ${user.firstName}` : ''}!`);
      navigate(redirect, { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const keepRedirect = params.get('redirect') ? `?redirect=${encodeURIComponent(redirect)}` : '';

  return (
    <section className="page flex justify-center">
      <div className="card w-full max-w-md p-8">
        <h1 className="page-title">Login</h1>
        <p className="mb-6 text-sm text-bw-muted">Sign in to see your orders, wishlist and writers.</p>
        <form noValidate onSubmit={handleSubmit} className="space-y-4">
          <TextField id="login-email" label="e-mail" type="email" autoComplete="email" value={form.email} onChange={update('email')} error={errors.email} />
          <TextField
            id="login-password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={update('password')}
            error={errors.password}
          />
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Login'}
          </button>
        </form>
        <p className="mt-6 text-sm text-bw-muted">
          New to BookWorm? <Link to={`/register${keepRedirect}`}>Create an account</Link>
        </p>
        <p className="mt-2 text-sm text-bw-muted">
          Bought as a guest? <Link to="/track-order">Track your order</Link>
        </p>
      </div>
    </section>
  );
}
