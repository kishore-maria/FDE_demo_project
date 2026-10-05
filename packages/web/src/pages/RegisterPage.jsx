import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { passwordProblem, register } from '../api/auth.js';
import { errorCode, errorMessage } from '../api/client.js';
import TextField from '../components/TextField.jsx';
import { safeRedirect } from '../utils/redirect.js';

const EMPTY = { firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '' };

function validate(form) {
  const errors = {};
  if (!form.firstName.trim()) errors.firstName = 'Enter your first name';
  if (!form.lastName.trim()) errors.lastName = 'Enter your last name';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid e-mail';
  if (form.phone && !/^\d{10}$/.test(form.phone)) errors.phone = 'Phone must be 10 digits';
  const problem = passwordProblem(form.password);
  if (problem) errors.password = problem;
  if (form.confirmPassword !== form.password) errors.confirmPassword = 'Passwords do not match';
  return errors;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get('redirect'));
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [guestEmail, setGuestEmail] = useState(false);

  const update = (field) => (event) => {
    const value = field === 'phone' ? event.target.value.replace(/\D/g, '') : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    setGuestEmail(false);
    try {
      const user = await register({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
        ...(form.phone && { phone: form.phone }),
      });
      toast.success(`Welcome to BookWorm, ${user.firstName}!`);
      navigate(redirect, { replace: true });
    } catch (error) {
      if (errorCode(error) === 'EMAIL_IN_USE') {
        setErrors({ email: 'This e-mail is already registered. Please log in instead.' });
      } else if (errorCode(error) === 'GUEST_ACCOUNT') {
        setGuestEmail(true);
      } else {
        toast.error(errorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const keepRedirect = params.get('redirect') ? `?redirect=${encodeURIComponent(redirect)}` : '';

  return (
    <section className="page flex justify-center">
      <div className="card w-full max-w-lg p-8">
        <h1 className="page-title">Register</h1>
        {guestEmail && (
          <p role="alert" className="mb-4 border border-bw-border bg-bw-bg-alt p-3 text-sm">
            You&apos;ve ordered as a guest with this e-mail. Open{' '}
            <Link to={`/track-order?email=${encodeURIComponent(form.email.trim())}`}>Track Order</Link>, find your order and
            choose <strong>Manage this order</strong> to create your account — your orders and gift points come with it.
          </p>
        )}
        <form noValidate onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <TextField id="reg-first" label="First Name" autoComplete="given-name" value={form.firstName} onChange={update('firstName')} error={errors.firstName} />
          <TextField id="reg-last" label="Last Name" autoComplete="family-name" value={form.lastName} onChange={update('lastName')} error={errors.lastName} />
          <TextField id="reg-email" label="e-mail" type="email" autoComplete="email" value={form.email} onChange={update('email')} error={errors.email} className="sm:col-span-2" />
          <TextField
            id="reg-phone"
            label="Phone (optional)"
            inputMode="numeric"
            maxLength={10}
            autoComplete="tel-national"
            value={form.phone}
            onChange={update('phone')}
            error={errors.phone}
            className="sm:col-span-2"
          />
          <TextField id="reg-password" label="Password" type="password" autoComplete="new-password" value={form.password} onChange={update('password')} error={errors.password} />
          <TextField
            id="reg-confirm"
            label="Confirm Password"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={update('confirmPassword')}
            error={errors.confirmPassword}
          />
          <p className="text-xs text-bw-subtle sm:col-span-2">At least 8 characters with one uppercase letter and one number.</p>
          <button type="submit" className="btn-primary sm:col-span-2" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-6 text-sm text-bw-muted">
          Already have an account? <Link to={`/login${keepRedirect}`}>Login</Link>
        </p>
      </div>
    </section>
  );
}
