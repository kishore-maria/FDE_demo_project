import { authors } from './data/authors.js';
import { bookRelations, books } from './data/books.js';
import { hiddenSubGenres, sidebarGenres, topLevelCategories } from './data/categories.js';
import { publishers } from './data/publishers.js';
import { store, storePolicies } from './data/store.js';
import { stableId } from './ids.js';

const coverUrl = (slug, side) => `https://picsum.photos/seed/${slug}-${side}/400/600`;

async function upsertBySlug(delegate, kind, data) {
  const id = stableId(kind, data.slug);
  return delegate.upsert({
    where: { slug: data.slug },
    create: { id, ...data },
    update: data,
  });
}

async function seedCategories(prisma) {
  for (const category of topLevelCategories) {
    await upsertBySlug(prisma.category, 'category', { ...category, showInSidebar: false });
  }

  const children = [
    ...sidebarGenres.map((genre, index) => ({ ...genre, displayOrder: index, showInSidebar: true })),
    ...hiddenSubGenres.map((genre, index) => ({ ...genre, displayOrder: 100 + index, showInSidebar: false })),
  ];
  for (const { parent, ...category } of children) {
    await upsertBySlug(prisma.category, 'category', {
      ...category,
      parentId: stableId('category', parent),
    });
  }
}

async function seedStore(prisma) {
  const { id: storeId } = await upsertBySlug(prisma.store, 'store', store);
  for (const policy of storePolicies) {
    await prisma.storePolicy.upsert({
      where: { storeId_type: { storeId, type: policy.type } },
      create: { id: stableId('policy', `${store.slug}:${policy.type}`), storeId, ...policy },
      update: policy,
    });
  }
  return storeId;
}

async function seedBooks(prisma, storeId) {
  for (const { author, publisher, categories, description, publishedAt, ...book } of books) {
    const bookId = stableId('book', book.slug);
    await upsertBySlug(prisma.book, 'book', {
      ...book,
      description: description ?? book.shortDescription,
      language: book.language ?? 'English',
      authorId: stableId('author', author),
      publisherId: stableId('publisher', publisher),
      storeId,
      coverImageUrl: coverUrl(book.slug, 'front'),
      backCoverImageUrl: coverUrl(book.slug, 'back'),
      stockQuantity: 100,
      isEditorsPick: book.isEditorsPick ?? false,
      publishedAt: new Date(`${publishedAt}T00:00:00.000Z`),
    });

    const categoryIds = categories.map((slug) => stableId('category', slug));
    await prisma.bookCategory.deleteMany({
      where: { bookId, categoryId: { notIn: categoryIds } },
    });
    for (const [index, categoryId] of categoryIds.entries()) {
      const isPrimary = index === 0;
      await prisma.bookCategory.upsert({
        where: { bookId_categoryId: { bookId, categoryId } },
        create: { bookId, categoryId, isPrimary },
        update: { isPrimary },
      });
    }
  }

  for (const relation of bookRelations) {
    const key = {
      bookId: stableId('book', relation.book),
      relatedBookId: stableId('book', relation.related),
      type: relation.type,
    };
    await prisma.bookRelation.upsert({
      where: { bookId_relatedBookId_type: key },
      create: key,
      update: {},
    });
  }
}

/** Seeds categories, publishers, authors, store + policies, books and book relations. Idempotent. */
export async function seedCatalog(prisma) {
  await seedCategories(prisma);
  for (const publisher of publishers) await upsertBySlug(prisma.publisher, 'publisher', publisher);
  for (const author of authors) await upsertBySlug(prisma.author, 'author', author);
  const storeId = await seedStore(prisma);
  await seedBooks(prisma, storeId);

  return {
    categories: topLevelCategories.length + sidebarGenres.length + hiddenSubGenres.length,
    publishers: publishers.length,
    authors: authors.length,
    books: books.length,
    bookRelations: bookRelations.length,
  };
}
