import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { createOrder, getOrder, orderInclude, toOrderDto, transitionOrder, type OrderAction } from './service';

const idParam = z.object({ id: z.string().uuid() });
const statusEnum = z.enum(['PENDING', 'ALLOCATED', 'PACKED', 'SHIPPED', 'CANCELLED']);
const transitionBody = z.object({ version: z.number().int().positive().optional() }).optional();

const routes: FastifyPluginAsyncZod = async (app) => {
  // ADMIN and OPERATOR may both work orders.
  app.addHook('preHandler', app.requireRole('ADMIN', 'OPERATOR'));

  app.get(
    '/',
    {
      schema: {
        tags: ['Orders'],
        summary: 'List orders',
        querystring: z.object({
          status: statusEnum.optional(),
          search: z.string().optional(),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(50),
        }),
      },
    },
    async (req) => {
      const { status, search, page, pageSize } = req.query;
      const where: Prisma.OrderWhereInput = {
        ...(status ? { status } : {}),
        ...(search ? { OR: [{ orderNumber: { contains: search, mode: 'insensitive' } }, { customerName: { contains: search, mode: 'insensitive' } }] } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      ]);
      return { data: rows.map(toOrderDto), page, pageSize, total };
    },
  );

  app.get('/:id', { schema: { tags: ['Orders'], summary: 'Get order', params: idParam } }, async (req) => ({
    data: toOrderDto(await getOrder(req.params.id)),
  }));

  app.post(
    '/',
    {
      schema: {
        tags: ['Orders'],
        summary: 'Create order (status PENDING)',
        body: z.object({
          customerName: z.string().min(1).max(120),
          shippingAddress: z.string().min(1).max(300),
          items: z.array(z.object({ skuId: z.string().uuid(), quantity: z.number().int().min(1).max(10_000) })).min(1).max(50),
        }),
      },
    },
    async (req, reply) => reply.status(201).send({ data: toOrderDto(await createOrder(req.body, req.user.sub)) }),
  );

  const actions: [OrderAction, string][] = [
    ['allocate', 'PENDING -> ALLOCATED. Reserves stock; 409 INSUFFICIENT_STOCK if unavailable.'],
    ['pack', 'ALLOCATED -> PACKED.'],
    ['ship', 'PACKED -> SHIPPED. Deducts stock and triggers the background tracking job.'],
  ];
  for (const [action, summary] of actions) {
    app.post(
      `/:id/${action}`,
      { schema: { tags: ['Orders'], summary, params: idParam, body: transitionBody } },
      async (req) => ({
        data: toOrderDto(await transitionOrder(req.params.id, action, req.user.sub, { expectedVersion: req.body?.version })),
      }),
    );
  }

  app.post(
    '/:id/cancel',
    {
      schema: {
        tags: ['Orders'],
        summary: 'Cancel an order (not allowed once SHIPPED); releases reserved stock.',
        params: idParam,
        body: z.object({ version: z.number().int().positive().optional(), reason: z.string().max(200).optional() }).optional(),
      },
    },
    async (req) => ({
      data: toOrderDto(await transitionOrder(req.params.id, 'cancel', req.user.sub, { expectedVersion: req.body?.version, reason: req.body?.reason })),
    }),
  );
};

export default routes;
