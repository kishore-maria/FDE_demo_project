import PropTypes from 'prop-types';

export const fieldShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  type: PropTypes.oneOf(['text', 'textarea', 'number', 'money', 'url', 'slug', 'date', 'checkbox', 'select']),
  required: PropTypes.bool,
  options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string.isRequired, label: PropTypes.string.isRequired })),
  hint: PropTypes.string,
});

/** One labelled admin input driven by a field config. */
export default function FormField({ field, value, error, onChange, idPrefix = 'admin' }) {
  const id = `${idPrefix}-${field.name}`;
  const described = error ? `${id}-error` : field.hint ? `${id}-hint` : undefined;
  const common = {
    id,
    name: field.name,
    'aria-invalid': Boolean(error),
    'aria-describedby': described,
  };

  if (field.type === 'checkbox') {
    return (
      <label htmlFor={id} className="flex items-center gap-2 text-sm">
        <input {...common} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(field.name, event.target.checked)} />
        {field.label}
      </label>
    );
  }

  let input;
  if (field.type === 'textarea') {
    input = <textarea {...common} rows={4} className="input" value={value ?? ''} onChange={(event) => onChange(field.name, event.target.value)} />;
  } else if (field.type === 'select') {
    input = (
      <select {...common} className="input" value={value ?? ''} onChange={(event) => onChange(field.name, event.target.value)}>
        {!field.required && <option value="">—</option>}
        {field.required && !value && <option value="">Select…</option>}
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else {
    const type = { date: 'date', url: 'url' }[field.type] ?? 'text';
    const inputMode = { number: 'numeric', money: 'decimal' }[field.type];
    input = (
      <input
        {...common}
        type={type}
        inputMode={inputMode}
        className="input"
        value={value ?? ''}
        onChange={(event) => onChange(field.name, event.target.value)}
      />
    );
  }

  return (
    <div>
      <label htmlFor={id} className="label">
        {field.label}
        {field.required && <span className="text-red-400"> *</span>}
      </label>
      {input}
      {field.hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-bw-subtle">
          {field.hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

FormField.propTypes = {
  field: fieldShape.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
  error: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  idPrefix: PropTypes.string,
};
