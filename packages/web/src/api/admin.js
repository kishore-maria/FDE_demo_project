import { api } from './client.js';

const data = (res) => res.data;
const items = (res) => res.data.items;

/** CRUD helpers for a flat admin resource such as /admin/authors. */
const resource = (base) => ({
  list: () => api.get(base).then(items),
  create: (body) => api.post(base, body).then(data),
  update: (id, body) => api.put(`${base}/${id}`, body).then(data),
  remove: (id) => api.delete(`${base}/${id}`),
});

export const adminApi = {
  books: {
    list: (params) => api.get('/admin/books', { params }).then(data),
    get: (bookId) => api.get(`/books/${bookId}`).then(data),
    create: (body) => api.post('/admin/books', body).then(data),
    update: (bookId, body) => api.put(`/admin/books/${bookId}`, body).then(data),
    remove: (bookId) => api.delete(`/admin/books/${bookId}`),
  },
  categories: resource('/admin/categories'),
  publishers: resource('/admin/publishers'),
  authors: resource('/admin/authors'),
  coupons: resource('/admin/coupons'),
  stores: resource('/admin/stores'),
  policies: (storeId) => resource(`/admin/stores/${storeId}/policies`),
  orders: (params) => api.get('/admin/orders', { params }).then(data),
  advanceShipment: (shipmentId) => api.post(`/admin/shipments/${shipmentId}/advance`).then(data),
};
