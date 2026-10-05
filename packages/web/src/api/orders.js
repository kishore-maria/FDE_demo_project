import { api } from './client.js';

const data = (res) => res.data;

export const ordersApi = {
  addresses: () => api.get('/users/me/addresses').then((res) => res.data.items),
  validateCoupon: (code, subtotalPaise) => api.post('/coupons/validate', { code, subtotalPaise }).then(data),
  wallet: () => api.get('/payments/wallet').then(data),
  checkout: (body) => api.post('/orders/checkout', body).then((res) => res.data.order),
  initiatePayment: (orderId, method) => api.post('/payments/initiate', { orderId, method }).then(data),
  confirmPayment: (body) => api.post('/payments/confirm', body).then(data),
  list: (params) => api.get('/orders', { params }).then(data),
  get: (orderId) => api.get(`/orders/${orderId}`).then(data),
  cancel: (orderId) => api.post(`/orders/${orderId}/cancel`).then(data),
  requestReturn: (orderId) => api.post(`/orders/${orderId}/return`).then(data),
  updateAddress: (orderId, address) => api.patch(`/orders/${orderId}/address`, address).then(data),
  buyAgain: (orderId) => api.post(`/cart/buy-again/${orderId}`).then(data),
  lookup: (email, orderNumber) => api.post('/orders/lookup', { email, orderNumber }, { skipAuth: true }).then(data),
};
