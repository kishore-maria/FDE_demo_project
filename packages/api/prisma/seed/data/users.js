export const DEMO_PASSWORDS = {
  admin: 'Admin@1234',
  customer: 'Test@1234',
  fresh: 'Test@1234',
};

export const users = [
  {
    key: 'admin',
    email: 'admin@bookworm.com',
    firstName: 'Admin',
    lastName: 'BookWorm',
    role: 'ADMIN',
    giftPoints: 0,
    walletBalancePaise: 0,
  },
  {
    key: 'customer',
    email: 'customer@test.com',
    firstName: 'John',
    lastName: 'Smith',
    phone: '9876543210',
    role: 'CUSTOMER',
    giftPoints: 200,
    walletBalancePaise: 100000,
  },
  {
    key: 'fresh',
    email: 'fresh@test.com',
    firstName: 'Priya',
    lastName: 'Sharma',
    phone: '9123456780',
    role: 'CUSTOMER',
    giftPoints: 0,
    walletBalancePaise: 0,
  },
];

export const customerAddress = {
  firstName: 'John',
  lastName: 'Smith',
  email: 'customer@test.com',
  phone: '9876543210',
  line1: '221 MG Road',
  line2: 'Near Trinity Metro Station',
  city: 'Bengaluru',
  pin: '560001',
  state: 'Karnataka',
  country: 'India',
  isDefault: true,
};

// Fixed far-future expiry keeps tests deterministic; EXPIRED10 is intentionally in the past.
export const coupons = [
  {
    code: 'BOOK10',
    discountType: 'FLAT',
    discountValue: 10000,
    minOrderValuePaise: 30000,
    validUntil: '2027-12-31T23:59:59.000Z',
  },
  {
    code: 'SAVE20',
    discountType: 'PERCENT',
    discountValue: 20,
    maxDiscountPaise: 20000,
    minOrderValuePaise: 50000,
    validUntil: '2027-12-31T23:59:59.000Z',
  },
  {
    code: 'WELCOME50',
    discountType: 'FLAT',
    discountValue: 5000,
    minOrderValuePaise: 0,
    validUntil: '2027-12-31T23:59:59.000Z',
  },
  {
    code: 'EXPIRED10',
    discountType: 'PERCENT',
    discountValue: 10,
    minOrderValuePaise: 0,
    validUntil: '2025-01-01T00:00:00.000Z',
  },
];

// Past orders for customer@test.com. Days are relative to the moment the seed runs.
export const customerOrders = [
  {
    key: 'seed-order-a',
    orderNumber: 'BW-SEED000A',
    trackingNumber: 'TRK-SEED00000A',
    placedDaysAgo: 30,
    deliveredDaysAgo: 26,
    items: [
      { book: 'less-but-better', quantity: 1 },
      { book: 'the-focus-reset', quantity: 1 },
    ],
    payment: { method: 'CREDIT_CARD', cardLast4: '4242' },
  },
  {
    key: 'seed-order-b',
    orderNumber: 'BW-SEED000B',
    trackingNumber: 'TRK-SEED00000B',
    placedDaysAgo: 8,
    deliveredDaysAgo: 3,
    couponCode: 'WELCOME50',
    items: [
      { book: 'the-silent-witness', quantity: 1 },
      { book: 'shadows-on-the-lake', quantity: 1 },
    ],
    payment: { method: 'UPI', upiHandleMasked: 'jo***@okaxis' },
  },
];

// Customer's gift point history must add up to the 200-point balance.
export const WELCOME_BONUS_POINTS = 140;

export const customerFollows = [
  { author: 'daniel-reed', source: 'AUTO_PURCHASE' },
  { author: 'sophia-bennett', source: 'AUTO_PURCHASE' },
];
