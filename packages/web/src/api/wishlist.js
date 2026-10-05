import { api } from './client.js';

export const wishlistApi = {
  list: () => api.get('/wishlist').then((res) => res.data.items),
  add: (bookId) => api.post('/wishlist', { bookId }).then((res) => res.data),
  remove: (bookId) => api.delete(`/wishlist/${bookId}`).then((res) => res.data.items),
};
