import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env, testHooksEnabled } from './config/env';
import { AppError } from './lib/errors';
import authPlugin from './plugins/auth';
import { registerTestMiddleware } from './middleware/testHooks';
import authRoutes from './modules/auth/routes';
import userRoutes from './modules/users/routes';
import inventoryRoutes from './modules/inventory/routes';
import orderRoutes from './modules/orders/routes';
import auditRoutes from './modules/audit/routes';
import metricsRoutes from './modules/metrics/routes';
import testRoutes from './modules/test-hooks/routes';

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: 'info' },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);

  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'] });

  await app.register(swagger, {
    openapi: {
      info: { title: 'Warehouse & Order Fulfillment API', version: '1.0.0' },
      components: { securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'access_token' } } },
      security: [{ cookieAuth: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  registerTestMiddleware(app);
  await app.register(authPlugin);

  app.get('/api/health', { schema: { tags: ['System'], summary: 'Liveness probe' } }, async () => ({ status: 'ok' }));

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(inventoryRoutes, { prefix: '/api/skus' });
  await app.register(orderRoutes, { prefix: '/api/orders' });
  await app.register(auditRoutes, { prefix: '/api/audit-logs' });
  await app.register(metricsRoutes, { prefix: '/api/metrics' });
  if (testHooksEnabled) await app.register(testRoutes, { prefix: '/api/test' });

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // Uniform error envelope: { error: { code, message, details? } }
  app.setErrorHandler((err: any, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
        },
      });
    }
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err?.code === 'P2002') {
      return reply.status(409).send({ error: { code: 'UNIQUE_VIOLATION', message: 'A record with these values already exists' } });
    }
    if (typeof err?.statusCode === 'number' && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: err.code ?? 'BAD_REQUEST', message: err.message } });
    }
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });

  return app;
}
