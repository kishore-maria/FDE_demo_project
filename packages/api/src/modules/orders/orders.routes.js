import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRegistered } from '../../middlewares/authorize.js';
import * as controller from './orders.controller.js';

export const ordersRouter = Router();

// Guests may act on orders from their current session (enforced by assertOrderAccess).
ordersRouter.post('/checkout', authenticate(), controller.checkoutOrder);
ordersRouter.get('/', authenticate(), requireRegistered, controller.listOrders);
ordersRouter.get('/:orderId', authenticate(), controller.getOrder);
ordersRouter.post('/:orderId/cancel', authenticate(), controller.cancelOrder);
ordersRouter.post('/:orderId/return', authenticate(), controller.returnOrder);
ordersRouter.patch('/:orderId/address', authenticate(), controller.updateOrderAddress);
