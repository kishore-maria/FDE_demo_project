import { isServiceablePin } from 'bookworm-shared';
import PropTypes from 'prop-types';
import { useState } from 'react';

export const EMPTY_ADDRESS = {
  firstName: '',
  lastName: '',
  line1: '',
  line2: '',
  email: '',
  city: '',
  pin: '',
  phone: '',
  state: '',
  country: 'India',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns { field: message } for invalid fields (empty object when valid). Mirrors the API's AddressInput;
 * unless disabled (eBook-only orders) the PIN must also be one we deliver to.
 */
export function validateAddress(values, { requireServiceablePin = true } = {}) {
  const errors = {};
  const required = { firstName: 'First name', lastName: 'Last name', line1: 'Address', city: 'City', state: 'State' };
  for (const [field, label] of Object.entries(required)) {
    if (!values[field]?.trim()) errors[field] = `${label} is required`;
  }
  if (!EMAIL.test(values.email?.trim() ?? '')) errors.email = 'Enter a valid e-mail';
  if (!/^\d{6}$/.test(values.pin ?? '')) errors.pin = 'Pin must be 6 digits';
  else if (requireServiceablePin && !isServiceablePin(values.pin)) errors.pin = "Sorry, we don't deliver to this PIN yet";
  if (!/^\d{10}$/.test(values.phone ?? '')) errors.phone = 'Phone must be 10 digits';
  return errors;
}

/** Strips empty optional fields so the payload matches AddressInput. */
export function toAddressPayload(values) {
  const payload = {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email.trim(),
    phone: values.phone,
    line1: values.line1.trim(),
    city: values.city.trim(),
    pin: values.pin,
    state: values.state.trim(),
    country: values.country?.trim() || 'India',
  };
  if (values.line2?.trim()) payload.line2 = values.line2.trim();
  return payload;
}

function Field({ name, label, value, error, onChange, type = 'text', inputMode, maxLength, prefix, autoComplete }) {
  const id = `address-${name}`;
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="flex">
        {prefix && <span className="flex items-center bg-bw-surface px-2 text-sm text-bw-muted">{prefix}</span>}
        <input
          id={id}
          name={name}
          type={type}
          inputMode={inputMode}
          maxLength={maxLength}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(name, event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="input"
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

Field.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  error: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  type: PropTypes.string,
  inputMode: PropTypes.string,
  maxLength: PropTypes.number,
  prefix: PropTypes.string,
  autoComplete: PropTypes.string,
};

/**
 * Address form with client-side validation. Submits via its own form element, so a button elsewhere on the
 * page can trigger it with `form={formId}`. `onSubmit` receives the AddressInput payload; `onPinChange`
 * reports the PIN as it is typed (for delivery previews).
 */
export default function AddressForm({
  initialValue = EMPTY_ADDRESS,
  onSubmit,
  onPinChange,
  requireServiceablePin = true,
  formId = 'address-form',
  children = null,
}) {
  const [values, setValues] = useState({ ...EMPTY_ADDRESS, ...initialValue });
  const [errors, setErrors] = useState({});

  const handleChange = (name, value) => {
    const cleaned = name === 'pin' || name === 'phone' ? value.replace(/\D/g, '') : value;
    setValues((current) => ({ ...current, [name]: cleaned }));
    if (name === 'pin') onPinChange?.(cleaned);
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const found = validateAddress(values, { requireServiceablePin });
    setErrors(found);
    if (Object.keys(found).length === 0) onSubmit(toAddressPayload(values));
  };

  const field = (name, label, extra = {}) => (
    <Field name={name} label={label} value={values[name] ?? ''} error={errors[name]} onChange={handleChange} {...extra} />
  );

  return (
    <form id={formId} noValidate onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      {field('firstName', 'First Name', { autoComplete: 'given-name' })}
      {field('lastName', 'Last Name', { autoComplete: 'family-name' })}
      <div className="sm:col-span-2">{field('line1', 'Address', { autoComplete: 'address-line1' })}</div>
      <div className="sm:col-span-2">{field('line2', 'Address Line 2', { autoComplete: 'address-line2' })}</div>
      {field('email', 'e-mail', { type: 'email', autoComplete: 'email' })}
      {field('city', 'City', { autoComplete: 'address-level2' })}
      {field('pin', 'Pin', { inputMode: 'numeric', maxLength: 6, autoComplete: 'postal-code' })}
      {field('phone', 'Phone', { inputMode: 'numeric', maxLength: 10, prefix: '+91', autoComplete: 'tel-national' })}
      {field('state', 'State', { autoComplete: 'address-level1' })}
      {field('country', 'Country', { autoComplete: 'country-name' })}
      {children && <div className="sm:col-span-2">{children}</div>}
    </form>
  );
}

AddressForm.propTypes = {
  initialValue: PropTypes.object,
  onSubmit: PropTypes.func.isRequired,
  onPinChange: PropTypes.func,
  requireServiceablePin: PropTypes.bool,
  formId: PropTypes.string,
  children: PropTypes.node,
};
