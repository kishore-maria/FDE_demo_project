import { describe, expect, test } from 'vitest';
import { formatINR, formatINRFixed, toINR, toPaise } from '../src/index.js';

describe('formatINR', () => {
  test.each([
    [14900, '₹149'],
    [39900, '₹399'],
    [0, '₹0'],
    [6096, '₹60.96'],
    [12345600, '₹1,23,456'],
  ])('formats %i paise as %s', (paise, expected) => {
    expect(formatINR(paise)).toBe(expected);
  });

  test('rejects non-integer paise', () => {
    expect(() => formatINR(149.5)).toThrow(TypeError);
  });
});

describe('formatINRFixed', () => {
  test('always shows two decimals', () => {
    expect(formatINRFixed(50800)).toBe('₹508.00');
    expect(formatINRFixed(6096)).toBe('₹60.96');
  });
});

describe('toPaise / toINR', () => {
  test('converts rupees to paise without float drift', () => {
    expect(toPaise(149)).toBe(14900);
    expect(toPaise(99.5)).toBe(9950);
    expect(toPaise(0.29)).toBe(29);
  });

  test('converts paise to rupees', () => {
    expect(toINR(14900)).toBe(149);
  });
});
