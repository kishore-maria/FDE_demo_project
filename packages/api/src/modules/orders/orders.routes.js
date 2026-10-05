import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import * as controller from './orders.controller.js';

export const ordersRouter = Router();

// Registered users and guests can both check out.
ordersRouter.post('/checkout', authenticate(), controller.checkoutOrder);
