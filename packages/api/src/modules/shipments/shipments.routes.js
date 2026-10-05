import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import * as controller from './shipments.controller.js';

export const shipmentsRouter = Router();

shipmentsRouter.post('/calculate-rate', controller.calculateRate);
shipmentsRouter.get('/order/:orderId', authenticate({ allowOrderScope: true }), controller.listOrderShipments);
