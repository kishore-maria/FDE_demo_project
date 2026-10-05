// PIN-code based delivery estimates (no courier API). Shared by the API (committed dates) and the web app (previews).
// India has no DST, so IST is a fixed UTC+5:30 offset.

export const WAREHOUSE_PIN = '560001';
// Postal circle of the warehouse (Karnataka spans PIN prefixes 56–59).
export const WAREHOUSE_STATE_PREFIXES = Object.freeze(['56', '57', '58', '59']);
export const DISPATCH_CUTOFF_HOUR_IST = 14;

export const DELIVERY_ZONES = Object.freeze({
  LOCAL: { label: 'Same city', minDays: 1, maxDays: 1 },
  STATE: { label: 'Same state', minDays: 2, maxDays: 2 },
  REGION: { label: 'Same region', minDays: 3, maxDays: 3 },
  METRO: { label: 'Metro city', minDays: 3, maxDays: 3 },
  NATIONAL: { label: 'Rest of India', minDays: 4, maxDays: 5 },
  REMOTE: { label: 'Remote area', minDays: 6, maxDays: 8 },
});

// Delhi, Mumbai, Kolkata, Chennai, Hyderabad, Pune, Ahmedabad.
const METRO_PREFIXES = ['110', '400', '700', '600', '500', '411', '380'];
// North-East (78, 79), Jammu & Kashmir / Ladakh (18, 19), Andaman & Nicobar (744), Lakshadweep (68255).
const REMOTE_PREFIXES = ['78', '79', '18', '19', '744', '68255'];

// Fixed-date national holidays (MM-DD); add festival dates per year to DATED_HOLIDAYS.
const RECURRING_HOLIDAYS = new Set(['01-26', '08-15', '10-02', '12-25']);
const DATED_HOLIDAYS = new Set([]);

export const GENERIC_DELIVERY_TEXT = 'Usually delivered in 1–8 business days';

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Zone key for a destination PIN, or null when the PIN is invalid or not serviceable. */
export function deliveryZone(pin) {
  const value = String(pin ?? '').trim();
  // 0xxxxx does not exist; 9xxxxx is the Army Post Office.
  if (!/^[1-8]\d{5}$/.test(value)) return null;
  if (REMOTE_PREFIXES.some((prefix) => value.startsWith(prefix))) return 'REMOTE';
  if (value.slice(0, 3) === WAREHOUSE_PIN.slice(0, 3)) return 'LOCAL';
  if (WAREHOUSE_STATE_PREFIXES.includes(value.slice(0, 2))) return 'STATE';
  if (value[0] === WAREHOUSE_PIN[0]) return 'REGION';
  if (METRO_PREFIXES.includes(value.slice(0, 3))) return 'METRO';
  return 'NATIONAL';
}

export const isServiceablePin = (pin) => deliveryZone(pin) !== null;

// Calendar days are handled as UTC-midnight timestamps of the IST date.
const istShift = (date) => new Date(date.getTime() + IST_OFFSET_MS);
const istDay = (date) => {
  const shifted = istShift(date);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
};
const isoDay = (day) => new Date(day).toISOString().slice(0, 10);

export function isBusinessDay(day) {
  const weekday = new Date(day).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const iso = isoDay(day);
  return !RECURRING_HOLIDAYS.has(iso.slice(5)) && !DATED_HOLIDAYS.has(iso);
}

function addIstBusinessDays(day, count) {
  let result = day;
  for (let added = 0; added < count; ) {
    result += DAY_MS;
    if (isBusinessDay(result)) added += 1;
  }
  return result;
}

/** Noon IST on the given calendar day, so the date reads the same in any time zone near India. */
const noonIst = (day) => new Date(day + 12 * 60 * 60 * 1000 - IST_OFFSET_MS);

/** The IST day the parcel leaves the warehouse: today before the cutoff on a business day, else the next one. */
export function dispatchDay(now = new Date()) {
  const today = istDay(now);
  const beforeCutoff = istShift(now).getUTCHours() < DISPATCH_CUTOFF_HOUR_IST;
  if (isBusinessDay(today) && beforeCutoff) return today;
  return addIstBusinessDays(today, 1);
}

/** "Thu, 8 Oct" in IST. */
export function formatShortDate(date) {
  const ist = istShift(date);
  return `${WEEKDAYS[ist.getUTCDay()]}, ${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]}`;
}

/**
 * Delivery estimate for a destination PIN.
 * Returns { serviceable, zone, label, minDays, maxDays, earliest, latest, cutoffAt, text }:
 * - serviceable is null when no PIN is known (generic text, no dates);
 * - latest is the date the shop commits to; cutoffAt is set when ordering now still dispatches today.
 */
export function estimateDelivery({ pin, digital = false, now = new Date() } = {}) {
  if (digital) {
    return { serviceable: true, zone: 'DIGITAL', label: 'Digital', minDays: 0, maxDays: 0, earliest: now, latest: now, cutoffAt: null, text: 'Instant download' };
  }
  const empty = { zone: null, label: null, minDays: null, maxDays: null, earliest: null, latest: null, cutoffAt: null };
  if (!pin) return { ...empty, serviceable: null, text: GENERIC_DELIVERY_TEXT };

  const zone = deliveryZone(pin);
  if (!zone) return { ...empty, serviceable: false, text: `Delivery is not available to PIN ${pin}` };

  const { label, minDays, maxDays } = DELIVERY_ZONES[zone];
  const dispatch = dispatchDay(now);
  const earliest = noonIst(addIstBusinessDays(dispatch, minDays));
  const latest = noonIst(addIstBusinessDays(dispatch, maxDays));
  const cutoffAt = dispatch === istDay(now) ? new Date(dispatch + DISPATCH_CUTOFF_HOUR_IST * 60 * 60 * 1000 - IST_OFFSET_MS) : null;
  const text =
    minDays === maxDays
      ? `Delivery by ${formatShortDate(latest)}`
      : `Delivery between ${formatShortDate(earliest)} and ${formatShortDate(latest)}`;
  return { serviceable: true, zone, label, minDays, maxDays, earliest, latest, cutoffAt, text };
}
