import { describe, expect, test } from 'vitest';
import {
  DELIVERY_ZONES,
  GENERIC_DELIVERY_TEXT,
  deliveryZone,
  dispatchDay,
  estimateDelivery,
  isServiceablePin,
} from '../src/index.js';

// Monday 5 Oct 2026, 10:00 IST (before the 2 PM cutoff).
const MON_10_IST = new Date('2026-10-05T04:30:00Z');
const day = (date) => date.toISOString().slice(0, 10);

describe('deliveryZone', () => {
  test.each([
    ['560001', 'LOCAL'],
    ['560103', 'LOCAL'],
    ['570001', 'STATE'],
    ['590001', 'STATE'],
    ['500001', 'REGION'],
    ['600001', 'METRO'],
    ['110001', 'METRO'],
    ['400001', 'METRO'],
    ['226001', 'NATIONAL'],
    ['682001', 'NATIONAL'],
    ['781001', 'REMOTE'],
    ['190001', 'REMOTE'],
    ['744101', 'REMOTE'],
    ['682551', 'REMOTE'],
  ])('%s → %s', (pin, zone) => {
    expect(deliveryZone(pin)).toBe(zone);
    expect(isServiceablePin(pin)).toBe(true);
  });

  test.each(['012345', '999001', '56000', '5600011', 'abcdef', '', null])('%s is not serviceable', (pin) => {
    expect(deliveryZone(pin)).toBeNull();
    expect(isServiceablePin(pin)).toBe(false);
  });
});

describe('dispatchDay', () => {
  test('before 2 PM IST on a business day ships today', () => {
    expect(day(new Date(dispatchDay(MON_10_IST)))).toBe('2026-10-05');
  });

  test('after the cutoff ships the next business day', () => {
    expect(day(new Date(dispatchDay(new Date('2026-10-05T09:00:00Z'))))).toBe('2026-10-06');
  });

  test('Friday evening ships on Monday', () => {
    expect(day(new Date(dispatchDay(new Date('2026-10-09T10:00:00Z'))))).toBe('2026-10-12');
  });

  test('skips national holidays (Gandhi Jayanti, Fri 2 Oct)', () => {
    expect(day(new Date(dispatchDay(new Date('2026-10-01T10:00:00Z'))))).toBe('2026-10-05');
  });

  test('uses the IST calendar day, not UTC', () => {
    // 20:00 UTC Monday is 01:30 IST Tuesday.
    expect(day(new Date(dispatchDay(new Date('2026-10-05T20:00:00Z'))))).toBe('2026-10-06');
  });
});

describe('estimateDelivery', () => {
  test.each([
    ['560001', 'Delivery by Tue, 6 Oct', '2026-10-06', '2026-10-06'],
    ['570001', 'Delivery by Wed, 7 Oct', '2026-10-07', '2026-10-07'],
    ['600001', 'Delivery by Thu, 8 Oct', '2026-10-08', '2026-10-08'],
    ['226001', 'Delivery between Fri, 9 Oct and Mon, 12 Oct', '2026-10-09', '2026-10-12'],
    ['781001', 'Delivery between Tue, 13 Oct and Thu, 15 Oct', '2026-10-13', '2026-10-15'],
  ])('%s from Monday morning: %s', (pin, text, earliest, latest) => {
    const estimate = estimateDelivery({ pin, now: MON_10_IST });
    expect(estimate).toMatchObject({ serviceable: true, text });
    expect(day(estimate.earliest)).toBe(earliest);
    expect(day(estimate.latest)).toBe(latest);
  });

  test('dates are committed at noon IST and match the zone table', () => {
    const estimate = estimateDelivery({ pin: '560001', now: MON_10_IST });
    expect(estimate.latest.toISOString()).toBe('2026-10-06T06:30:00.000Z');
    expect(estimate).toMatchObject({ zone: 'LOCAL', ...DELIVERY_ZONES.LOCAL });
  });

  test('reports the dispatch cutoff while it is still reachable', () => {
    expect(estimateDelivery({ pin: '560001', now: MON_10_IST }).cutoffAt.toISOString()).toBe('2026-10-05T08:30:00.000Z');
    expect(estimateDelivery({ pin: '560001', now: new Date('2026-10-05T09:00:00Z') }).cutoffAt).toBeNull();
    expect(estimateDelivery({ pin: '560001', now: new Date('2026-10-03T04:30:00Z') }).cutoffAt).toBeNull();
  });

  test('after the cutoff the date moves by a business day', () => {
    expect(estimateDelivery({ pin: '560001', now: new Date('2026-10-05T09:00:00Z') }).text).toBe('Delivery by Wed, 7 Oct');
  });

  test('without a PIN there is no firm date', () => {
    expect(estimateDelivery({ now: MON_10_IST })).toMatchObject({ serviceable: null, latest: null, text: GENERIC_DELIVERY_TEXT });
  });

  test('unserviceable PINs are flagged', () => {
    expect(estimateDelivery({ pin: '999001', now: MON_10_IST })).toMatchObject({
      serviceable: false,
      latest: null,
      text: 'Delivery is not available to PIN 999001',
    });
  });

  test('eBooks are instant regardless of PIN', () => {
    expect(estimateDelivery({ pin: '999001', digital: true, now: MON_10_IST })).toMatchObject({
      serviceable: true,
      zone: 'DIGITAL',
      text: 'Instant download',
    });
  });
});
