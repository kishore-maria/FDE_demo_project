import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRegistered } from '../../middlewares/authorize.js';
import * as controller from './cart.controller.js';

export const cartRouter = Router();

// Any token (registered or guest) has a server cart.
cartRouter.use(authenticate());

cartRouter.get('/', controller.getCart);
cartRouter.delete('/', controller.clearCart);
cartRouter.post('/items', controller.addItem);
cartRouter.post('/merge', controller.mergeCart);
cartRouter.post('/buy-again/:orderId', requireRegistered, controller.buyAgain);
cartRouter.put('/items/:bookId', controller.updateItem);
cartRouter.delete('/items/:bookId', controller.removeItem);
