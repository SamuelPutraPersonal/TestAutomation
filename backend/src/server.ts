import { buildApp } from './app';
import { env, testHooksEnabled } from './config/env';
import { prisma } from './lib/prisma';
import { cancelPendingJobs, recoverShipmentJobs } from './jobs/shipment';

async function main() {
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: env.HOST });
  await recoverShipmentJobs();
  if (testHooksEnabled) app.log.warn('Test hooks ENABLED (/api/test/*, X-Simulate-Failure)');
  app.log.info(`API docs: http://localhost:${env.PORT}/docs`);

  const shutdown = async () => {
    cancelPendingJobs();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
