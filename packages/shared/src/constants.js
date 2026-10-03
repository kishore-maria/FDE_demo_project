// 12% follows the design mock; printed books are GST-exempt in India (documented assumption).
export const TAX_RATE = 0.12;
export const FREE_DELIVERY_THRESHOLD_PAISE = 50000;
export const DELIVERY_CHARGE_PAISE = 4900;
export const GIFT_POINT_VALUE_PAISE = 100;
export const GIFT_POINT_EARN_RATE = 0.05;
export const CANCEL_WINDOW_HOURS = 48;
export const RETURN_WINDOW_DAYS = 7;
export const ORDER_RESERVATION_MINUTES = 30;
export const REVIEW_MAX_CHARS = 100;
export const DELIVERY_BUSINESS_DAYS = 3;

export const BOOK_FORMATS = Object.freeze(['PAPERBACK', 'HARDCOVER', 'EBOOK']);

export const ORDER_STATUSES = Object.freeze([
  'PENDING',
  'CONFIRMED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'EXPIRED',
  'RETURN_REQUESTED',
  'RETURNED',
]);

export const PAYMENT_STATUSES = Object.freeze(['UNPAID', 'PAID', 'FAILED', 'REFUNDED']);

export const PAYMENT_METHODS = Object.freeze(['CREDIT_CARD', 'DEBIT_CARD', 'UPI', 'WALLET']);

export const SHIPMENT_STATUSES = Object.freeze([
  'PROCESSING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
]);

export const USER_ROLES = Object.freeze(['GUEST', 'CUSTOMER', 'ADMIN']);
