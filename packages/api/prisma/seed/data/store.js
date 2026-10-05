export const store = {
  slug: 'bookworm-main',
  name: 'BookWorm Main Store',
  description: 'The official BookWorm online bookstore — books across every genre, delivered across India.',
};

export const storePolicies = [
  {
    type: 'RETURN',
    title: 'Returns within 7 days',
    content:
      'Delivered print books can be returned within 7 days of delivery. A return pickup is arranged and the amount is refunded to the original payment method once the book reaches us.',
  },
  {
    type: 'CANCELLATION',
    title: 'Cancel within 48 hours',
    content:
      'Orders can be cancelled within 48 hours of placing them, as long as they have not shipped. Gift points used on the order are restored and payments are refunded in full.',
  },
  {
    type: 'SHIPPING',
    title: 'Free delivery over ₹500',
    content:
      'Orders of ₹500 or more ship free. Smaller orders have a flat ₹49 delivery charge. Print books arrive in about 3 business days; eBooks are available instantly.',
  },
  {
    type: 'PAYMENT',
    title: 'Secure payments',
    content:
      'We accept credit cards, debit cards, UPI and BookWorm Wallet. Card numbers are never stored — only the last four digits are kept for your reference.',
  },
];
