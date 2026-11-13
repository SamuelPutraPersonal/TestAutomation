import type { FastifyInstance } from 'fastify';
import { testHooksEnabled } from '../config/env';
import { testState } from '../lib/testState';

/**
 * Only active when test hooks are enabled:
 *  - global artificial latency (set via POST /api/test/delay)
 *  - X-Simulate-Failure: <5xx> header returns that status immediately
 */
export function registerTestMiddleware(app: FastifyInstance) {
  if (!testHooksEnabled) return;

  app.addHook('onRequest', async (req, reply) => {
    const isTestRoute = req.url.startsWith('/api/test');

    const header = req.headers['x-simulate-failure'];
    if (typeof header === 'string' && !isTestRoute) {
      const status = Number(header);
      if (Number.isInteger(status) && status >= 500 && status <= 599) {
        return reply.status(status).send({
          error: { code: 'SIMULATED_FAILURE', message: `Simulated failure (${status})` },
        });
      }
    }

    if (testState.delayMs > 0 && !isTestRoute && !req.url.startsWith('/docs')) {
      await new Promise((r) => setTimeout(r, testState.delayMs));
    }
  });
}
