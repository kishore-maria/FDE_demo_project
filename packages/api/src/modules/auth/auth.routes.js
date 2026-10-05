import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import * as controller from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', controller.register);
authRouter.post('/login', controller.login);
authRouter.post('/guest-session', controller.createGuestSession);
authRouter.get('/profile', authenticate(), controller.getProfile);
authRouter.put('/profile', authenticate(), controller.updateProfile);
authRouter.put('/set-password', authenticate(), controller.setPassword);
