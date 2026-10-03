import { formatINR, getDeliveryText } from 'bookworm-shared';

/** Prisma include needed by serializeBookSummary. */
export const bookSummaryInclude = {
  author: { select: { id: true, name: true, slug: true, photoUrl: true } },
  publisher: { select: { id: true, name: true, slug: true } },
  categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
};

const byPrimaryThenName = (a, b) =>
  Number(b.isPrimary) - Number(a.isPrimary) || a.category.name.localeCompare(b.category.name);

/** ratingAvg is stored unrounded (incremental updates); expose 2 decimals. */
export const roundRating = (value) => Math.round(value * 100) / 100;

/** Card-level shape of a book used by lists, cart, wishlist and orders. */
export function serializeBookSummary(book, now = new Date()) {
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    shortDescription: book.shortDescription,
    author: {
      id: book.author.id,
      name: book.author.name,
      slug: book.author.slug,
      photoUrl: book.author.photoUrl ?? null,
    },
    publisher: { id: book.publisher.id, name: book.publisher.name, slug: book.publisher.slug },
    categories: [...book.categories].sort(byPrimaryThenName).map(({ category, isPrimary }) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      isPrimary,
    })),
    pricePaise: book.pricePaise,
    priceInr: formatINR(book.pricePaise),
    format: book.format,
    language: book.language,
    coverImageUrl: book.coverImageUrl,
    ratingAvg: roundRating(book.ratingAvg),
    ratingCount: book.ratingCount,
    salesCount: book.salesCount,
    inStock: book.stockQuantity > 0,
    deliveryText: getDeliveryText(book.format, now),
  };
}

export function serializeCategory(category, bookCount) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    parentId: category.parentId ?? null,
    displayOrder: category.displayOrder,
    showInSidebar: category.showInSidebar,
    ...(bookCount !== undefined && { bookCount }),
  };
}

export function serializePublisher(publisher) {
  return {
    id: publisher.id,
    name: publisher.name,
    slug: publisher.slug,
    description: publisher.description ?? null,
    logoUrl: publisher.logoUrl ?? null,
    ...(publisher._count && { bookCount: publisher._count.books }),
  };
}

/** Expects the review to include `user: { select: { firstName: true } }`. */
export function serializeReview(review) {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment ?? null,
    createdAt: review.createdAt,
    reviewer: { firstName: review.user.firstName },
  };
}
