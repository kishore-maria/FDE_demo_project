import * as admin from './admin.service.js';

const send = (status, fn) => async (req, res) => {
  const body = await fn(req);
  if (status === 204) res.status(204).end();
  else res.status(status).json(body);
};

export const listBooks = send(200, (req) => admin.listBooks(req.query));
export const createBook = send(201, (req) => admin.createBook(req.body));
export const updateBook = send(200, (req) => admin.updateBook(req.params.bookId, req.body));
export const deleteBook = send(204, (req) => admin.deleteBook(req.params.bookId));

export const listCategories = send(200, () => admin.listCategories());
export const createCategory = send(201, (req) => admin.createCategory(req.body));
export const updateCategory = send(200, (req) => admin.updateCategory(req.params.categoryId, req.body));
export const deleteCategory = send(204, (req) => admin.deleteCategory(req.params.categoryId));

export const listPublishers = send(200, () => admin.listPublishers());
export const createPublisher = send(201, (req) => admin.createPublisher(req.body));
export const updatePublisher = send(200, (req) => admin.updatePublisher(req.params.publisherId, req.body));
export const deletePublisher = send(204, (req) => admin.deletePublisher(req.params.publisherId));

export const listAuthors = send(200, () => admin.listAuthors());
export const createAuthor = send(201, (req) => admin.createAuthor(req.body));
export const updateAuthor = send(200, (req) => admin.updateAuthor(req.params.authorId, req.body));
export const deleteAuthor = send(204, (req) => admin.deleteAuthor(req.params.authorId));

export const listCoupons = send(200, () => admin.listCoupons());
export const createCoupon = send(201, (req) => admin.createCoupon(req.body));
export const updateCoupon = send(200, (req) => admin.updateCoupon(req.params.couponId, req.body));
export const deleteCoupon = send(204, (req) => admin.deleteCoupon(req.params.couponId));

export const listStores = send(200, () => admin.listStores());
export const createStore = send(201, (req) => admin.createStore(req.body));
export const updateStore = send(200, (req) => admin.updateStore(req.params.storeId, req.body));
export const deleteStore = send(204, (req) => admin.deleteStore(req.params.storeId));

export const listPolicies = send(200, (req) => admin.listPolicies(req.params.storeId));
export const createPolicy = send(201, (req) => admin.createPolicy(req.params.storeId, req.body));
export const updatePolicy = send(200, (req) => admin.updatePolicy(req.params.storeId, req.params.policyId, req.body));
export const deletePolicy = send(204, (req) => admin.deletePolicy(req.params.storeId, req.params.policyId));

export const listOrders = send(200, (req) => admin.listOrders(req.query));

export const getStore = send(200, (req) => admin.getStoreBySlug(req.params.slug));
