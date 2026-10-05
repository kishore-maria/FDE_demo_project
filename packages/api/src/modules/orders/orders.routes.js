import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRegistered } from '../../middlewares/authorize.js';
import * as controller from './orders.controller.js';

export const ordersRouter = Router();

// Guests may act on orders from their current session, or with an order-scoped token from
// POST /orders/lookup/verify (both enforced by assertOrderAccess).
const orderAccess = authenticate({ allowOrderScope: true });
ordersRouter.post('/checkout', authenticate(), controller.checkoutOrder);
ordersRouter.get('/', authenticate(), requireRegistered, controller.listOrders);
ordersRouter.get('/:orderId', orderAccess, controller.getOrder);
ordersRouter.post('/:orderId/cancel', orderAccess, controller.cancelOrder);
ordersRouter.post('/:orderId/return', orderAccess, controller.returnOrder);
ordersRouter.patch('/:orderId/address', orderAccess, controller.updateOrderAddress);
