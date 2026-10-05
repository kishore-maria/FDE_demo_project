import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { authorCardInclude, serializeAuthor } from '../authors/authors.service.js';
import {
  bookSummaryInclude,
  serializeBookSummary,
  serializeCategory,
  serializePublisher,
} from '../catalog/catalog.serializer.js';
import { getBookDetail } from '../catalog/catalog.service.js';
import { orderInclude, serializeOrderSummary, serializeShipment } from '../orders/orders.serializer.js';

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const pageOf = (query) => {
  const page = toInt(query.page, 1);
  const pageSize = toInt(query.pageSize, 12);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
};

async function mustExist(model, id, label) {
  const row = await prisma[model].findUnique({ where: { id } });
  if (!row) throw notFound(`${label} not found`);
  return row;
}

// ─── Books ───────────────────────────────────────────────────────────────────

/** GET /admin/books — paginated books, optionally filtered by `search` (title or author). */
export async function listBooks(query) {
  const { page, pageSize, skip, take } = pageOf(query);
  const search = query.search?.trim();
  const where = search ? { title: { contains: search, mode: 'insensitive' } } : {};
  const [total, books] = await Promise.all([
    prisma.book.count({ where }),
    prisma.book.findMany({ where, include: bookSummaryInclude, orderBy: [{ title: 'asc' }, { id: 'asc' }], skip, take }),
  ]);
  const now = new Date();
  return {
    items: books.map((book) => serializeBookSummary(book, now)),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

async function assertBookReferences(input, bookId) {
  const invalid = (message) => badRequest(message, undefined, 'INVALID_REFERENCE');

  if (input.categories) {
    if (input.categories.filter((c) => c.isPrimary).length !== 1) {
      throw badRequest('Exactly one category must be primary', undefined, 'VALIDATION_ERROR');
    }
    const ids = [...new Set(input.categories.map((c) => c.categoryId))];
    if (ids.length !== input.categories.length) throw badRequest('Duplicate category', undefined, 'VALIDATION_ERROR');
    if ((await prisma.category.count({ where: { id: { in: ids } } })) !== ids.length) throw invalid('Unknown category');
  }
  if (input.authorId && !(await prisma.author.findUnique({ where: { id: input.authorId } }))) throw invalid('Unknown author');
  if (input.publisherId && !(await prisma.publisher.findUnique({ where: { id: input.publisherId } }))) {
    throw invalid('Unknown publisher');
  }
  if (input.storeId && !(await prisma.store.findUnique({ where: { id: input.storeId } }))) throw invalid('Unknown store');
  if (input.relations) {
    const ids = [...new Set(input.relations.map((r) => r.relatedBookId))];
    if (bookId && ids.includes(bookId)) throw invalid('A book cannot be related to itself');
    if ((await prisma.book.count({ where: { id: { in: ids } } })) !== ids.length) throw invalid('Unknown related book');
  }
}

function bookData(input) {
  const { categories, relations, publishedAt, ...fields } = input;
  return {
    ...fields,
    ...(publishedAt !== undefined && { publishedAt: new Date(publishedAt) }),
  };
}

const categoryRows = (categories) =>
  categories.map(({ categoryId, isPrimary = false }) => ({ categoryId, isPrimary }));

/** POST /admin/books — validates references, creates the book with categories/relations, returns BookDetail. */
export async function createBook(input) {
  await assertBookReferences(input);
  const book = await prisma.book.create({
    data: {
      description: input.shortDescription,
      ...bookData(input),
      categories: { create: categoryRows(input.categories) },
      ...(input.relations && { relationsFrom: { create: input.relations } }),
    },
  });
  return getBookDetail(book.id, null);
}

/** PUT /admin/books/:id — partial update; `categories`/`relations`, when given, replace the existing rows. */
export async function updateBook(bookId, input) {
  await mustExist('book', bookId, 'Book');
  await assertBookReferences(input, bookId);
  await prisma.$transaction(async (tx) => {
    await tx.book.update({ where: { id: bookId }, data: bookData(input) });
    if (input.categories) {
      await tx.bookCategory.deleteMany({ where: { bookId } });
      await tx.bookCategory.createMany({ data: categoryRows(input.categories).map((row) => ({ ...row, bookId })) });
    }
    if (input.relations) {
      await tx.bookRelation.deleteMany({ where: { bookId } });
      await tx.bookRelation.createMany({ data: input.relations.map((row) => ({ ...row, bookId })) });
    }
  });
  return getBookDetail(bookId, null);
}

/** DELETE /admin/books/:id — 409 BOOK_HAS_ORDERS when the book was ever ordered. */
export async function deleteBook(bookId) {
  await mustExist('book', bookId, 'Book');
  if (await prisma.orderItem.count({ where: { bookId } })) {
    throw conflict('This book has orders and cannot be deleted. Set its stock to 0 instead.', 'BOOK_HAS_ORDERS');
  }
  await prisma.book.delete({ where: { id: bookId } });
}

// ─── Categories ──────────────────────────────────────────────────────────────

/** GET /admin/categories — flat list (parents first) with book counts. */
export async function listCategories() {
  const categories = await prisma.category.findMany({
    include: { _count: { select: { books: true } } },
    orderBy: [{ parentId: { sort: 'asc', nulls: 'first' } }, { displayOrder: 'asc' }, { name: 'asc' }],
  });
  return { items: categories.map((c) => serializeCategory(c, c._count.books)) };
}

async function assertParent(parentId, categoryId) {
  if (!parentId) return;
  if (parentId === categoryId) throw badRequest('A category cannot be its own parent', undefined, 'VALIDATION_ERROR');
  const parent = await prisma.category.findUnique({ where: { id: parentId } });
  if (!parent) throw badRequest('Unknown parent category', undefined, 'INVALID_REFERENCE');
  if (parent.parentId) throw badRequest('Categories can only be two levels deep', undefined, 'VALIDATION_ERROR');
}

const categoryData = ({ name, slug, parentId, displayOrder, showInSidebar }) => ({
  name: name.trim(),
  slug,
  parentId: parentId ?? null,
  ...(displayOrder !== undefined && { displayOrder }),
  ...(showInSidebar !== undefined && { showInSidebar }),
});

/** POST /admin/categories — categories are at most two levels deep. */
export async function createCategory(input) {
  await assertParent(input.parentId);
  const category = await prisma.category.create({ data: categoryData(input) });
  return serializeCategory(category, 0);
}

/** PUT /admin/categories/:id — a parent with children cannot become a child (409 CATEGORY_HAS_CHILDREN). */
export async function updateCategory(categoryId, input) {
  await mustExist('category', categoryId, 'Category');
  await assertParent(input.parentId, categoryId);
  if (input.parentId && (await prisma.category.count({ where: { parentId: categoryId } }))) {
    throw conflict('A category with sub-categories cannot become a sub-category', 'CATEGORY_HAS_CHILDREN');
  }
  const category = await prisma.category.update({
    where: { id: categoryId },
    data: categoryData(input),
    include: { _count: { select: { books: true } } },
  });
  return serializeCategory(category, category._count.books);
}

/** DELETE /admin/categories/:id — 409 CATEGORY_IN_USE while it has books or sub-categories. */
export async function deleteCategory(categoryId) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { _count: { select: { books: true, children: true } } },
  });
  if (!category) throw notFound('Category not found');
  if (category._count.books || category._count.children) {
    throw conflict('This category still has books or sub-categories', 'CATEGORY_IN_USE');
  }
  await prisma.category.delete({ where: { id: categoryId } });
}

// ─── Publishers ──────────────────────────────────────────────────────────────

const withBookCount = { _count: { select: { books: true } } };

/** GET /admin/publishers — with book counts. */
export async function listPublishers() {
  const publishers = await prisma.publisher.findMany({ include: withBookCount, orderBy: { name: 'asc' } });
  return { items: publishers.map(serializePublisher) };
}

const publisherData = ({ name, slug, description, logoUrl }) => ({
  name: name.trim(),
  slug,
  description: description ?? null,
  logoUrl: logoUrl ?? null,
});

/** POST /admin/publishers */
export async function createPublisher(input) {
  return serializePublisher(await prisma.publisher.create({ data: publisherData(input), include: withBookCount }));
}

/** PUT /admin/publishers/:id — omitted optional fields are cleared. */
export async function updatePublisher(publisherId, input) {
  await mustExist('publisher', publisherId, 'Publisher');
  return serializePublisher(
    await prisma.publisher.update({ where: { id: publisherId }, data: publisherData(input), include: withBookCount }),
  );
}

/** DELETE /admin/publishers/:id — 409 PUBLISHER_IN_USE while it has books. */
export async function deletePublisher(publisherId) {
  await mustExist('publisher', publisherId, 'Publisher');
  if (await prisma.book.count({ where: { publisherId } })) {
    throw conflict('This publisher still has books', 'PUBLISHER_IN_USE');
  }
  await prisma.publisher.delete({ where: { id: publisherId } });
}

// ─── Authors ─────────────────────────────────────────────────────────────────

/** GET /admin/authors — author cards with book counts and top category. */
export async function listAuthors() {
  const authors = await prisma.author.findMany({ include: authorCardInclude, orderBy: { name: 'asc' } });
  return { items: authors.map((author) => serializeAuthor(author)) };
}

const authorData = ({ name, slug, bio, photoUrl }) => ({ name: name.trim(), slug, bio, photoUrl: photoUrl ?? null });

/** POST /admin/authors */
export async function createAuthor(input) {
  return serializeAuthor(await prisma.author.create({ data: authorData(input), include: authorCardInclude }));
}

/** PUT /admin/authors/:id — an omitted photoUrl is cleared. */
export async function updateAuthor(authorId, input) {
  await mustExist('author', authorId, 'Author');
  return serializeAuthor(
    await prisma.author.update({ where: { id: authorId }, data: authorData(input), include: authorCardInclude }),
  );
}

/** DELETE /admin/authors/:id — 409 AUTHOR_IN_USE while they have books. */
export async function deleteAuthor(authorId) {
  await mustExist('author', authorId, 'Author');
  if (await prisma.book.count({ where: { authorId } })) throw conflict('This author still has books', 'AUTHOR_IN_USE');
  await prisma.author.delete({ where: { id: authorId } });
}

// ─── Coupons ─────────────────────────────────────────────────────────────────

const serializeCoupon = (coupon) => ({
  id: coupon.id,
  code: coupon.code,
  discountType: coupon.discountType,
  discountValue: coupon.discountValue,
  maxDiscountPaise: coupon.maxDiscountPaise ?? null,
  minOrderValuePaise: coupon.minOrderValuePaise,
  validUntil: coupon.validUntil,
  usageLimit: coupon.usageLimit ?? null,
  usedCount: coupon.usedCount,
  isActive: coupon.isActive,
});

function couponData(input) {
  if (input.discountType === 'PERCENT' && input.discountValue > 100) {
    throw badRequest('A percentage discount cannot exceed 100', undefined, 'VALIDATION_ERROR');
  }
  return {
    code: input.code,
    discountType: input.discountType,
    discountValue: input.discountValue,
    maxDiscountPaise: input.maxDiscountPaise ?? null,
    minOrderValuePaise: input.minOrderValuePaise ?? 0,
    validUntil: new Date(input.validUntil),
    usageLimit: input.usageLimit ?? null,
    ...(input.isActive !== undefined && { isActive: input.isActive }),
  };
}

/** GET /admin/coupons — all coupons, including inactive and expired ones. */
export async function listCoupons() {
  const coupons = await prisma.coupon.findMany({ orderBy: { code: 'asc' } });
  return { items: coupons.map(serializeCoupon) };
}

/** POST /admin/coupons — FLAT values are paise, PERCENT values are whole percent (≤ 100). */
export async function createCoupon(input) {
  return serializeCoupon(await prisma.coupon.create({ data: couponData(input) }));
}

/** PUT /admin/coupons/:id — full replacement of the coupon rules (usedCount is kept). */
export async function updateCoupon(couponId, input) {
  await mustExist('coupon', couponId, 'Coupon');
  return serializeCoupon(await prisma.coupon.update({ where: { id: couponId }, data: couponData(input) }));
}

/** Orders keep their totals; deleting a used coupon just unlinks it (onDelete: SetNull). */
export async function deleteCoupon(couponId) {
  await mustExist('coupon', couponId, 'Coupon');
  await prisma.coupon.delete({ where: { id: couponId } });
}

// ─── Stores & policies ───────────────────────────────────────────────────────

const policiesInclude = { policies: { orderBy: { type: 'asc' } } };

const serializePolicy = ({ id, type, title, content }) => ({ id, type, title, content });

const serializeStore = (store) => ({
  id: store.id,
  name: store.name,
  slug: store.slug,
  description: store.description,
  isActive: store.isActive,
  policies: store.policies.map(serializePolicy),
});

/** GET /stores/:slug — public; inactive stores are hidden. */
export async function getStoreBySlug(slug) {
  const store = await prisma.store.findUnique({ where: { slug }, include: policiesInclude });
  if (!store || !store.isActive) throw notFound('Store not found');
  return serializeStore(store);
}

const storeData = ({ name, slug, description, isActive }) => ({
  name: name.trim(),
  slug,
  description,
  ...(isActive !== undefined && { isActive }),
});

/** GET /admin/stores — with their policies. */
export async function listStores() {
  const stores = await prisma.store.findMany({ include: policiesInclude, orderBy: { name: 'asc' } });
  return { items: stores.map(serializeStore) };
}

/** POST /admin/stores */
export async function createStore(input) {
  return serializeStore(await prisma.store.create({ data: storeData(input), include: policiesInclude }));
}

/** PUT /admin/stores/:id */
export async function updateStore(storeId, input) {
  await mustExist('store', storeId, 'Store');
  return serializeStore(await prisma.store.update({ where: { id: storeId }, data: storeData(input), include: policiesInclude }));
}

/** Books in the store are kept and simply detached (onDelete: SetNull). */
export async function deleteStore(storeId) {
  await mustExist('store', storeId, 'Store');
  await prisma.store.delete({ where: { id: storeId } });
}

/** GET /admin/stores/:id/policies */
export async function listPolicies(storeId) {
  await mustExist('store', storeId, 'Store');
  const policies = await prisma.storePolicy.findMany({ where: { storeId }, orderBy: { type: 'asc' } });
  return { items: policies.map(serializePolicy) };
}

async function findPolicy(storeId, policyId) {
  const policy = await prisma.storePolicy.findFirst({ where: { id: policyId, storeId } });
  if (!policy) throw notFound('Policy not found');
  return policy;
}

/** POST /admin/stores/:id/policies — one policy per type (duplicate type → 409 via the unique index). */
export async function createPolicy(storeId, { type, title, content }) {
  await mustExist('store', storeId, 'Store');
  return serializePolicy(await prisma.storePolicy.create({ data: { storeId, type, title: title.trim(), content } }));
}

/** PUT /admin/stores/:id/policies/:policyId — the policy must belong to the store. */
export async function updatePolicy(storeId, policyId, { type, title, content }) {
  await findPolicy(storeId, policyId);
  return serializePolicy(
    await prisma.storePolicy.update({ where: { id: policyId }, data: { type, title: title.trim(), content } }),
  );
}

/** DELETE /admin/stores/:id/policies/:policyId */
export async function deletePolicy(storeId, policyId) {
  await findPolicy(storeId, policyId);
  await prisma.storePolicy.delete({ where: { id: policyId } });
}

// ─── Orders ──────────────────────────────────────────────────────────────────

/** GET /admin/orders — every customer's orders (newest first) with shipments, optionally by status. */
export async function listOrders(query) {
  const { page, pageSize, skip, take } = pageOf(query);
  const where = query.status ? { status: query.status } : {};
  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, include: orderInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip, take }),
  ]);
  const now = new Date();
  return {
    items: orders.map((order) => ({
      ...serializeOrderSummary(order, now),
      shipments: order.shipments.map(serializeShipment),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}
