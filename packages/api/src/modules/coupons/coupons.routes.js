import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import * as controller from './coupons.controller.js';

export const couponsRouter = Router();

couponsRouter.post('/validate', authenticate(), controller.validateCoupon);
