import { estimateDelivery, formatShortDate } from './delivery.js';

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

/** "Delivery by Mon, 21 Jul" (IST calendar date). */
export function formatDeliveryDate(date) {
  return `Delivery by ${formatShortDate(date)}`;
}

/** Delivery text for a book format; without a PIN print books get the generic range. */
export function getDeliveryText(format, fromDate = new Date(), pin = null) {
  return estimateDelivery({ pin, digital: format === 'EBOOK', now: fromDate }).text;
}
