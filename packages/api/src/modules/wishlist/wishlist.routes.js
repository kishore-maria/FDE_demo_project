import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRegistered } from '../../middlewares/authorize.js';
import * as controller from './wishlist.controller.js';

export const wishlistRouter = Router();

wishlistRouter.use(authenticate(), requireRegistered);

wishlistRouter.get('/', controller.getWishlist);
wishlistRouter.post('/', controller.addToWishlist);
wishlistRouter.delete('/:bookId', controller.removeFromWishlist);
