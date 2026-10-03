import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRegistered } from '../../middlewares/authorize.js';
import * as addresses from './addresses.controller.js';

export const usersRouter = Router();

usersRouter.use('/me', authenticate(), requireRegistered);

usersRouter.get('/me/addresses', addresses.list);
usersRouter.post('/me/addresses', addresses.create);
usersRouter.put('/me/addresses/:addressId', addresses.update);
usersRouter.delete('/me/addresses/:addressId', addresses.remove);
usersRouter.put('/me/addresses/:addressId/default', addresses.setDefault);
