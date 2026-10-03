import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRegistered } from '../../middlewares/authorize.js';
import * as controller from './authors.controller.js';

export const authorsRouter = Router();
const registered = [authenticate(), requireRegistered];

authorsRouter.get('/', authenticate({ optional: true }), controller.listAuthors);

// Static paths must stay above /:authorId.
authorsRouter.get('/following', ...registered, controller.listFollowing);
authorsRouter.get('/following/new-releases', ...registered, controller.listNewReleases);
authorsRouter.get('/suggestions', ...registered, controller.listSuggestions);

authorsRouter.get('/:authorId', authenticate({ optional: true }), controller.getAuthor);
authorsRouter.post('/:authorId/follow', ...registered, controller.followAuthor);
authorsRouter.delete('/:authorId/follow', ...registered, controller.unfollowAuthor);
