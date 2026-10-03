// Top-level groups are hidden from the sidebar; "All" is a UI-only filter, not a category row.
export const topLevelCategories = [
  { slug: 'fiction', name: 'Fiction', displayOrder: 0 },
  { slug: 'non-fiction', name: 'Non-Fiction', displayOrder: 1 },
];

// Sidebar genres in the exact order shown in the design.
export const sidebarGenres = [
  { slug: 'romance', name: 'Romance', parent: 'fiction' },
  { slug: 'mystery', name: 'Mystery', parent: 'fiction' },
  { slug: 'science-fiction', name: 'Science Fiction', parent: 'fiction' },
  { slug: 'fantasy', name: 'Fantasy', parent: 'fiction' },
  { slug: 'historical', name: 'Historical', parent: 'fiction' },
  { slug: 'biography', name: 'Biography', parent: 'non-fiction' },
  { slug: 'self-help', name: 'Self-help', parent: 'non-fiction' },
  { slug: 'memoir', name: 'Memoir', parent: 'non-fiction' },
  { slug: 'travel', name: 'Travel', parent: 'non-fiction' },
  { slug: 'cooking', name: 'Cooking', parent: 'non-fiction' },
  { slug: 'childrens', name: "Children's", parent: 'fiction' },
  { slug: 'young-adult', name: 'Young Adult', parent: 'fiction' },
  { slug: 'comics-graphic-novels', name: 'Comics & Graphic Novels', parent: 'fiction' },
  { slug: 'poetry', name: 'Poetry', parent: 'fiction' },
  { slug: 'drama', name: 'Drama', parent: 'fiction' },
  { slug: 'science', name: 'Science', parent: 'non-fiction' },
  { slug: 'philosophy', name: 'Philosophy', parent: 'non-fiction' },
  { slug: 'religion', name: 'Religion', parent: 'non-fiction' },
  { slug: 'language-learning', name: 'Language Learning', parent: 'non-fiction' },
];

// Extra tags seen on design cards (e.g. "Fiction, Thriller, Horror") that are not sidebar genres.
export const hiddenSubGenres = [
  { slug: 'thriller', name: 'Thriller', parent: 'fiction' },
  { slug: 'horror', name: 'Horror', parent: 'fiction' },
  { slug: 'love', name: 'Love', parent: 'fiction' },
];
