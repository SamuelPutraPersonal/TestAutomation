import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { runSeed } from '../../seed/seed';
import { cancelPendingJobs } from '../../jobs/shipment';
import { testState } from '../../lib/testState';

/** Registered only when NODE_ENV=test or ENABLE_TEST_HOOKS=true. Unauthenticated by design. */
const routes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/reset',
    { schema: { tags: ['Test Hooks'], summary: 'Truncate all tables, restart sequences, re-run the seed' } },
    async () => {
      cancelPendingJobs();
      testState.delayMs = 0;
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "AuditLog","OrderItem","Order","Sku","RefreshToken","User" RESTART IDENTITY CASCADE',
      );
      await runSeed(prisma);
      return { status: 'ok' };
    },
  );

  app.post(
    '/delay',
    {
      schema: {
        tags: ['Test Hooks'],
        summary: 'Inject latency (ms) into every non-test request. Use 0 to disable.',
        body: z.object({ ms: z.number().int().min(0).max(30_000) }),
      },
    },
    async (req) => {
      testState.delayMs = req.body.ms;
      return { status: 'ok', delayMs: testState.delayMs };
    },
  );
};

export default routes;
