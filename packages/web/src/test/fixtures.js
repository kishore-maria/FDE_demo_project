const author = (name, slug) => ({ id: `author-${slug}`, name, slug, photoUrl: `https://i.pravatar.cc/150?u=${slug}` });
const abc = { id: 'pub-abc', name: 'ABC Publishers', slug: 'abc-publishers' };
const selfHelp = { id: 'cat-self-help', name: 'Self-help', slug: 'self-help', isPrimary: true };

export const joy = {
  id: '3655c0fb-15c6-56a2-a40d-e0636592fb83',
  slug: 'joy-of-minimalism',
  title: 'Joy of Minimalism',
  shortDescription: 'Declutter your life to uncover peace, clarity, and joy.',
  author: author('Daniel Reed', 'daniel-reed'),
  publisher: abc,
  categories: [selfHelp],
  pricePaise: 14900,
  priceInr: '₹149',
  format: 'PAPERBACK',
  language: 'English',
  coverImageUrl: 'https://picsum.photos/seed/joy-of-minimalism-front/400/600',
  ratingAvg: 4.8,
  ratingCount: 36,
  salesCount: 145,
  inStock: true,
  deliveryText: 'Delivery by Thu, 8 Oct',
};

export const path = {
  ...joy,
  id: 'fa0f460c-ef26-5889-a4c3-8acdbdaafe8d',
  slug: 'the-path-to-success',
  title: 'The Path to Success',
  shortDescription: 'Practical habits for long-term success.',
  author: author('James Wright', 'james-wright'),
  pricePaise: 35900,
  priceInr: '₹359',
  coverImageUrl: 'https://picsum.photos/seed/the-path-to-success-front/400/600',
};

export const vanishing = {
  ...joy,
  id: '0b6b8d4e-1111-4b22-8c33-444455556666',
  slug: 'the-vanishing-house',
  title: 'The Vanishing House',
  shortDescription: 'A house that disappears every full moon.',
  author: author('Clara Nelson', 'clara-nelson'),
  categories: [{ id: 'cat-mystery', name: 'Mystery', slug: 'mystery', isPrimary: true }],
  pricePaise: 9900,
  priceInr: '₹99',
  format: 'EBOOK',
  deliveryText: 'Instant download',
};

/** API Cart response for the given [book, quantity] lines. */
export function cartResponse(lines) {
  const items = lines.map(([book, quantity]) => ({
    book,
    quantity,
    lineTotalPaise: book.pricePaise * quantity,
    lineTotalInr: `₹${(book.pricePaise * quantity) / 100}`,
  }));
  const subtotalPaise = items.reduce((sum, item) => sum + item.lineTotalPaise, 0);
  return {
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotalPaise,
    subtotalInr: `₹${subtotalPaise / 100}`,
  };
}
