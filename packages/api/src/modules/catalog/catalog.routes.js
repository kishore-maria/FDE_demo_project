import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRegistered } from '../../middlewares/authorize.js';
import * as controller from './catalog.controller.js';

export const catalogRouter = Router();

catalogRouter.get('/categories', controller.listCategories);
catalogRouter.get('/publishers', controller.listPublishers);
catalogRouter.get('/publishers/:publisherId', controller.getPublisher);

// Static /books/* paths (recommended, bestsellers, new-launches) must be registered before /books/:bookId.
catalogRouter.get('/books', authenticate({ optional: true }), controller.listBooks);
catalogRouter.get('/books/recommended', authenticate({ optional: true }), controller.getRecommended);
catalogRouter.get('/books/bestsellers', controller.getBestsellers);
catalogRouter.get('/books/new-launches', controller.getNewLaunches);
catalogRouter.get('/books/:bookId', authenticate({ optional: true }), controller.getBook);
catalogRouter.post('/books/:bookId/reviews', authenticate(), requireRegistered, controller.upsertReview);
