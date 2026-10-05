import { api } from './client.js';

const get = (url, config) => api.get(url, config).then((res) => res.data);

export const catalogApi = {
  categories: () => get('/categories').then((data) => data.items),
  publishers: () => get('/publishers').then((data) => data.items),
  books: (params) => get('/books', { params, optionalAuth: true }),
  book: (bookId) => get(`/books/${bookId}`, { optionalAuth: true }),
  recommended: () => get('/books/recommended', { optionalAuth: true }),
  bestsellers: () => get('/books/bestsellers').then((data) => data.items),
  newLaunches: () => get('/books/new-launches').then((data) => data.items),
  review: (bookId, body) => api.post(`/books/${bookId}/reviews`, body).then((res) => res.data),
  author: (authorId) => get(`/authors/${authorId}`, { optionalAuth: true }),
  follow: (authorId) => api.post(`/authors/${authorId}/follow`).then((res) => res.data),
  unfollow: (authorId) => api.delete(`/authors/${authorId}/follow`).then((res) => res.data),
};
