import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { runSeed } from '../src/seed/seed';

async function main() {
  // Idempotent: wipe then reseed so repeated runs give identical state.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog","OrderItem","Order","Sku","RefreshToken","User" RESTART IDENTITY CASCADE',
  );
  await runSeed(prisma);
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
