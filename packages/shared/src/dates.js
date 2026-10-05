import { DELIVERY_BUSINESS_DAYS } from './constants.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Adds n business days (Mon–Fri), skipping weekends. Returns a new Date. */
export function addBusinessDays(date, n) {
  const result = new Date(date.getTime());
  let remaining = n;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

/** "Delivery by Mon, 21 Jul" */
export function formatDeliveryDate(date) {
  return `Delivery by ${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** Delivery text for a book format: eBooks are delivered instantly. */
export function getDeliveryText(format, fromDate = new Date()) {
  if (format === 'EBOOK') return 'Instant download';
  return formatDeliveryDate(addBusinessDays(fromDate, DELIVERY_BUSINESS_DAYS));
}
