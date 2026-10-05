import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { authorsRouter } from './modules/authors/authors.routes.js';
import { cartRouter } from './modules/cart/cart.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { couponsRouter } from './modules/coupons/coupons.routes.js';
import { ordersRouter } from './modules/orders/orders.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { shipmentsRouter } from './modules/shipments/shipments.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { wishlistRouter } from './modules/wishlist/wishlist.routes.js';

const specPath = fileURLToPath(new URL('../openapi/openapi.yaml', import.meta.url));
const openApiDocument = YAML.parse(readFileSync(specPath, 'utf8'));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === '0' || value === 'false') return false;
  if (value === 'true') return true;
  return /^\d+$/.test(value) ? Number(value) : value;
}

function corsOrigins() {
  return (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Builds the Express app without listening, so tests can drive it with supertest.
 * @param {object} [options]
 * @param {boolean} [options.enableResponseValidation] validate responses against openapi.yaml (default: on in tests)
 * @param {number} [options.lookupLimit] max public order lookups per minute per IP
 * @param {(router: import('express').Router) => void} [options.registerTestRoutes] test-only hook, mounted before module routes
 */
export function createApp(options = {}) {
  const config = {
    enableResponseValidation: options.enableResponseValidation ?? process.env.NODE_ENV === 'test',
    lookupLimit: options.lookupLimit ?? Number(process.env.RATE_LIMIT_LOOKUP_MAX ?? 10),
  };

  const app = express();
  app.locals.config = config;
  app.disable('x-powered-by');
  app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

  app.use(helmet());
  app.use(cors({ origin: corsOrigins() }));
  app.use(express.json({ limit: '100kb' }));
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  app.get('/api/docs/openapi.json', (req, res) => res.json(openApiDocument));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'BookWorm API' }));

  app.use(
    OpenApiValidator.middleware({
      apiSpec: specPath,
      validateRequests: true,
      validateResponses: config.enableResponseValidation,
      validateSecurity: false,
      ignorePaths: /^\/api\/docs/,
      serDes: [OpenApiValidator.serdes.dateTime.serializer, OpenApiValidator.serdes.date.serializer],
    }),
  );

  const api = express.Router();
  options.registerTestRoutes?.(api);

  api.get('/health', (req, res) => {
    res.json({ status: 'ok', version, timestamp: new Date().toISOString() });
  });
  api.use('/auth', authRouter);
  api.use('/users', usersRouter);
  api.use('/authors', authorsRouter);
  api.use('/cart', cartRouter);
  api.use('/wishlist', wishlistRouter);
  api.use('/coupons', couponsRouter);
  api.use('/orders', ordersRouter);
  api.use('/payments', paymentsRouter);
  api.use('/shipments', shipmentsRouter);
  api.use('/admin', adminRouter);
  api.use(catalogRouter);

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
