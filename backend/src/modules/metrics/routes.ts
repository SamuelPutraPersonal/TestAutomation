import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { prisma } from '../../lib/prisma';

const routes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    { preHandler: app.authenticate, schema: { tags: ['Dashboard'], summary: 'Dashboard metrics' } },
    async () => {
      const [byStatus, skuCount, stock] = await Promise.all([
        prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.sku.count({ where: { isActive: true } }),
        prisma.$queryRaw<{ low: bigint; out: bigint }[]>`
          SELECT
            COUNT(*) FILTER (WHERE "quantityOnHand" - "quantityReserved" <= "reorderThreshold") AS low,
            COUNT(*) FILTER (WHERE "quantityOnHand" - "quantityReserved" <= 0) AS out
          FROM "Sku" WHERE "isActive" = true`,
      ]);
      const orders = { PENDING: 0, ALLOCATED: 0, PACKED: 0, SHIPPED: 0, CANCELLED: 0 } as Record<string, number>;
      for (const r of byStatus) orders[r.status] = r._count._all;
      return { data: { orders, activeSkus: skuCount, lowStockSkus: Number(stock[0].low), outOfStockSkus: Number(stock[0].out) } };
    },
  );
};

export default routes;
