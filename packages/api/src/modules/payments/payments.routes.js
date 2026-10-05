import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRegistered } from '../../middlewares/authorize.js';
import * as controller from './payments.controller.js';

export const paymentsRouter = Router();

paymentsRouter.post('/initiate', authenticate(), controller.initiatePayment);
paymentsRouter.post('/confirm', authenticate(), controller.confirmPayment);
paymentsRouter.get('/wallet', authenticate(), requireRegistered, controller.getWallet);
