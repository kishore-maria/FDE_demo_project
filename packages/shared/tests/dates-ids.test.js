import { describe, expect, test } from 'vitest';
import {
  addBusinessDays,
  formatDeliveryDate,
  generateOrderNumber,
  generateTrackingNumber,
  getDeliveryText,
} from '../src/index.js';

describe('addBusinessDays', () => {
  test('Friday + 3 business days is Wednesday', () => {
    const friday = new Date(2025, 0, 3);
    const result = addBusinessDays(friday, 3);
    expect(result.getDay()).toBe(3);
    expect(result.getDate()).toBe(8);
  });

  test('Monday + 3 business days is Thursday', () => {
    expect(addBusinessDays(new Date(2025, 0, 6), 3).getDay()).toBe(4);
  });

  test('does not mutate the input date', () => {
    const date = new Date(2025, 0, 3);
    addBusinessDays(date, 3);
    expect(date.getDate()).toBe(3);
  });
});

describe('delivery text', () => {
  test('formats like the design', () => {
    expect(formatDeliveryDate(new Date(2025, 6, 21))).toBe('Delivery by Mon, 21 Jul');
  });

  test('eBooks are instant', () => {
    expect(getDeliveryText('EBOOK')).toBe('Instant download');
  });

  test('print books without a PIN get the generic range', () => {
    expect(getDeliveryText('PAPERBACK', new Date(2025, 0, 3))).toBe('Usually delivered in 1–8 business days');
  });

  test('print books with a PIN get a dated estimate', () => {
    expect(getDeliveryText('PAPERBACK', new Date('2026-10-05T04:30:00Z'), '560001')).toBe('Delivery by Tue, 6 Oct');
  });
});

describe('ids', () => {
  test('order number format', () => {
    expect(generateOrderNumber()).toMatch(/^BW-[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  test('tracking number format', () => {
    expect(generateTrackingNumber()).toMatch(/^TRK-[0-9A-HJKMNP-TV-Z]{10}$/);
  });

  test('order numbers are unique across many calls', () => {
    const numbers = new Set(Array.from({ length: 1000 }, generateOrderNumber));
    expect(numbers.size).toBe(1000);
  });
});
