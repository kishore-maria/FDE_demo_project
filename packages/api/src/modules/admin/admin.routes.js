import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRole } from '../../middlewares/authorize.js';
import * as shipments from '../shipments/shipments.controller.js';
import * as c from './admin.controller.js';

export const adminRouter = Router();

adminRouter.use(authenticate(), requireRole('ADMIN'));

adminRouter.route('/books').get(c.listBooks).post(c.createBook);
adminRouter.route('/books/:bookId').put(c.updateBook).delete(c.deleteBook);

adminRouter.route('/categories').get(c.listCategories).post(c.createCategory);
adminRouter.route('/categories/:categoryId').put(c.updateCategory).delete(c.deleteCategory);

adminRouter.route('/publishers').get(c.listPublishers).post(c.createPublisher);
adminRouter.route('/publishers/:publisherId').put(c.updatePublisher).delete(c.deletePublisher);

adminRouter.route('/authors').get(c.listAuthors).post(c.createAuthor);
adminRouter.route('/authors/:authorId').put(c.updateAuthor).delete(c.deleteAuthor);

adminRouter.route('/coupons').get(c.listCoupons).post(c.createCoupon);
adminRouter.route('/coupons/:couponId').put(c.updateCoupon).delete(c.deleteCoupon);

adminRouter.route('/stores').get(c.listStores).post(c.createStore);
adminRouter.route('/stores/:storeId').put(c.updateStore).delete(c.deleteStore);
adminRouter.route('/stores/:storeId/policies').get(c.listPolicies).post(c.createPolicy);
adminRouter.route('/stores/:storeId/policies/:policyId').put(c.updatePolicy).delete(c.deletePolicy);

adminRouter.get('/orders', c.listOrders);
adminRouter.post('/shipments/:shipmentId/advance', shipments.advanceShipment);

export const storesRouter = Router();
storesRouter.get('/:slug', c.getStore);
