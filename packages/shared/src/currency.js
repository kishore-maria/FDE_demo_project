const wholeRupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const withPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function assertPaise(paise) {
  if (!Number.isInteger(paise)) {
    throw new TypeError(`Expected integer paise, received ${paise}`);
  }
}

/** "₹149" for whole rupees, "₹60.96" otherwise; Indian digit grouping ("₹1,23,456"). */
export function formatINR(paise) {
  assertPaise(paise);
  return paise % 100 === 0 ? wholeRupees.format(paise / 100) : withPaise.format(paise / 100);
}

/** Always two decimals, e.g. "₹508.00" (totals panel). */
export function formatINRFixed(paise) {
  assertPaise(paise);
  return withPaise.format(paise / 100);
}

export function toPaise(inr) {
  return Math.round(inr * 100);
}

export function toINR(paise) {
  return paise / 100;
}
