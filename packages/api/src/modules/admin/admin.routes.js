import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRole } from '../../middlewares/authorize.js';
import * as shipments from '../shipments/shipments.controller.js';

export const adminRouter = Router();

adminRouter.use(authenticate(), requireRole('ADMIN'));

adminRouter.post('/shipments/:shipmentId/advance', shipments.advanceShipment);
