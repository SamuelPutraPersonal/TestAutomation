import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Prisma, Sku } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { writeAudit } from '../../lib/audit';
import { badRequest, conflict, notFound } from '../../lib/errors';

const toDto = (s: Sku) => ({ ...s, unitPrice: s.unitPrice.toString(), quantityAvailable: s.quantityOnHand - s.quantityReserved });

const version = z.number().int().positive();
const idParam = z.object({ id: z.string().uuid() });

/**
 * Optimistic update: succeeds only if the row still has the version the client read.
 * Throws 404 if the SKU is gone, 409 VERSION_CONFLICT if someone else changed it first.
 */
async function updateWithVersion(id: string, expected: number, data: Prisma.SkuUncheckedUpdateManyInput) {
  const res = await prisma.sku.updateMany({
    where: { id, version: expected },
    data: { ...data, version: { increment: 1 } },
  });
  const current = await prisma.sku.findUnique({ where: { id } });
  if (!current) throw notFound('SKU');
  if (res.count === 0) {
    throw conflict('VERSION_CONFLICT', 'This SKU was modified by someone else. Reload and retry.', {
      currentVersion: current.version,
    });
  }
  return current;
}

const routes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  const adminOnly = app.requireRole('ADMIN');
  const staff = app.requireRole('ADMIN', 'OPERATOR');

  app.get(
    '/',
    {
      schema: {
        tags: ['Inventory'],
        summary: 'List SKUs',
        querystring: z.object({
          search: z.string().optional(),
          includeInactive: z.enum(['true', 'false']).default('false'),
          lowStock: z.enum(['true', 'false']).default('false'),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
        }),
      },
    },
    async (req) => {
      const { search, includeInactive, lowStock, page, pageSize } = req.query;
      const where: Prisma.SkuWhereInput = {
        ...(includeInactive === 'true' ? {} : { isActive: true }),
        ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }] } : {}),
      };
      // Low stock compares two columns, so filter in SQL for correct pagination.
      let ids: string[] | undefined;
      if (lowStock === 'true') {
        const rows = await prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Sku" WHERE "quantityOnHand" - "quantityReserved" <= "reorderThreshold"`;
        ids = rows.map((r) => r.id);
        where.id = { in: ids };
      }
      const [total, items] = await Promise.all([
        prisma.sku.count({ where }),
        prisma.sku.findMany({ where, orderBy: { code: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      ]);
      return { data: items.map(toDto), page, pageSize, total };
    },
  );

  app.get('/:id', { schema: { tags: ['Inventory'], summary: 'Get SKU', params: idParam } }, async (req) => {
    const sku = await prisma.sku.findUnique({ where: { id: req.params.id } });
    if (!sku) throw notFound('SKU');
    return { data: toDto(sku) };
  });

  app.post(
    '/',
    {
      preHandler: adminOnly,
      schema: {
        tags: ['Inventory'],
        summary: 'Create SKU (ADMIN)',
        body: z.object({
          code: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/, 'Letters, digits, - and _ only'),
          name: z.string().min(1).max(120),
          description: z.string().max(500).optional(),
          unitPrice: z.coerce.number().nonnegative().multipleOf(0.01),
          quantityOnHand: z.number().int().nonnegative().default(0),
          reorderThreshold: z.number().int().nonnegative().default(10),
        }),
      },
    },
    async (req, reply) => {
      const code = req.body.code.toUpperCase();
      if (await prisma.sku.findUnique({ where: { code } })) throw conflict('SKU_CODE_TAKEN', `SKU code ${code} already exists`);
      const sku = await prisma.sku.create({ data: { ...req.body, code } });
      await writeAudit({ action: 'SKU_CREATED', entityType: 'Sku', entityId: sku.id, actorId: req.user.sub, metadata: { code } });
      return reply.status(201).send({ data: toDto(sku) });
    },
  );

  app.patch(
    '/:id',
    {
      preHandler: adminOnly,
      schema: {
        tags: ['Inventory'],
        summary: 'Update SKU with optimistic locking (ADMIN). 409 VERSION_CONFLICT on stale version.',
        params: idParam,
        body: z.object({
          version,
          name: z.string().min(1).max(120).optional(),
          description: z.string().max(500).nullable().optional(),
          unitPrice: z.coerce.number().nonnegative().multipleOf(0.01).optional(),
          quantityOnHand: z.number().int().nonnegative().optional(),
          reorderThreshold: z.number().int().nonnegative().optional(),
          isActive: z.boolean().optional(),
        }),
      },
    },
    async (req) => {
      const { version: expected, ...changes } = req.body;
      const existing = await prisma.sku.findUnique({ where: { id: req.params.id } });
      if (!existing) throw notFound('SKU');
      if (changes.quantityOnHand !== undefined && changes.quantityOnHand < existing.quantityReserved) {
        throw badRequest(`Quantity on hand cannot be below reserved quantity (${existing.quantityReserved})`);
      }
      const sku = await updateWithVersion(req.params.id, expected, changes);
      await writeAudit({ action: 'SKU_UPDATED', entityType: 'Sku', entityId: sku.id, actorId: req.user.sub, metadata: changes });
      return { data: toDto(sku) };
    },
  );

  app.post(
    '/:id/adjust-stock',
    {
      preHandler: staff,
      schema: {
        tags: ['Inventory'],
        summary: 'Adjust stock by a signed delta with optimistic locking',
        params: idParam,
        body: z.object({
          version,
          delta: z.number().int().refine((n) => n !== 0, 'Delta must be non-zero'),
          reason: z.string().max(200).optional(),
        }),
      },
    },
    async (req) => {
      const existing = await prisma.sku.findUnique({ where: { id: req.params.id } });
      if (!existing) throw notFound('SKU');
      const next = existing.quantityOnHand + req.body.delta;
      if (next < existing.quantityReserved) {
        throw badRequest(`Adjustment would drop stock below reserved quantity (${existing.quantityReserved})`);
      }
      const sku = await updateWithVersion(req.params.id, req.body.version, { quantityOnHand: next });
      await writeAudit({
        action: 'STOCK_ADJUSTED',
        entityType: 'Sku',
        entityId: sku.id,
        actorId: req.user.sub,
        metadata: { delta: req.body.delta, reason: req.body.reason ?? null, quantityOnHand: next },
      });
      return { data: toDto(sku) };
    },
  );

  app.delete(
    '/:id',
    {
      preHandler: adminOnly,
      schema: {
        tags: ['Inventory'],
        summary: 'Deactivate SKU (soft delete, ADMIN)',
        params: idParam,
        querystring: z.object({ version: z.coerce.number().int().positive() }),
      },
    },
    async (req) => {
      const existing = await prisma.sku.findUnique({ where: { id: req.params.id } });
      if (!existing) throw notFound('SKU');
      if (existing.quantityReserved > 0) throw conflict('SKU_HAS_RESERVATIONS', 'Cannot deactivate a SKU with reserved stock');
      const sku = await updateWithVersion(req.params.id, req.query.version, { isActive: false });
      await writeAudit({ action: 'SKU_DEACTIVATED', entityType: 'Sku', entityId: sku.id, actorId: req.user.sub });
      return { data: toDto(sku) };
    },
  );
};

export default routes;
