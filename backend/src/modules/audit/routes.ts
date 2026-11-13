import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';

const routes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.requireRole('ADMIN'));

  app.get(
    '/',
    {
      schema: {
        tags: ['Audit'],
        summary: 'List audit log entries, newest first (ADMIN)',
        querystring: z.object({
          action: z.string().optional(),
          entityType: z.enum(['Order', 'Sku', 'User']).optional(),
          entityId: z.string().optional(),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        }),
      },
    },
    async (req) => {
      const { page, pageSize, ...filters } = req.query;
      const where: Prisma.AuditLogWhereInput = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const [total, data] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          include: { actor: { select: { id: true, name: true, email: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      return { data, page, pageSize, total };
    },
  );
};

export default routes;
