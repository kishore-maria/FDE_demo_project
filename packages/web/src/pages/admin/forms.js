export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MONEY = /^\d+(\.\d{1,2})?$/;
const WHOLE = /^\d+$/;

/** "Joy of Minimalism!" → "joy-of-minimalism" */
export function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** "149.5" → 14950 */
export const rupeesToPaise = (value) => Math.round(Number.parseFloat(value) * 100);

/** 14950 → "149.5" */
export const paiseToRupees = (paise) => (paise == null ? '' : String(paise / 100));

export function isUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Returns an error message for one field config, or undefined. */
export function fieldError(field, raw) {
  const value = typeof raw === 'string' ? raw.trim() : raw;
  const empty = value === '' || value == null;
  if (empty) return field.required ? `${field.label} is required` : undefined;
  if (field.type === 'money' && !MONEY.test(value)) return 'Enter an amount like 149 or 149.50';
  if (field.type === 'number' && !WHOLE.test(value)) return 'Enter a whole number';
  if (field.type === 'url' && !isUrl(value)) return 'Enter a full URL starting with https://';
  if (field.type === 'slug' && !SLUG.test(value)) return 'Use lowercase letters, numbers and dashes';
  if (field.pattern && !field.pattern.regex.test(value)) return field.pattern.message;
  return undefined;
}

/** Validates every field and returns { name: message } for the invalid ones. */
export function validateFields(fields, values) {
  const errors = {};
  for (const field of fields) {
    const error = fieldError(field, values[field.name]);
    if (error) errors[field.name] = error;
  }
  return errors;
}

/** Drops empty strings so optional fields are omitted from the request body. */
export function compact(values) {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
      .filter(([, value]) => value !== ''),
  );
}

/** "2026-12-31" → end of that day in UTC (ISO). */
export const dateToIso = (value) => new Date(`${value}T23:59:59.000Z`).toISOString();

/** ISO → "2026-12-31" for <input type="date">. */
export const isoToDate = (value) => (value ? value.slice(0, 10) : '');
