import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { writeAudit } from '../../lib/audit';
import { conflict, notFound } from '../../lib/errors';

const select = { id: true, email: true, name: true, role: true, isActive: true, createdAt: true } as const;
const roleEnum = z.enum(['ADMIN', 'OPERATOR']);

const routes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.requireRole('ADMIN'));

  app.get('/', { schema: { tags: ['Users'], summary: 'List users (ADMIN)' } }, async () => ({
    data: await prisma.user.findMany({ select, orderBy: { createdAt: 'asc' } }),
  }));

  app.post(
    '/',
    {
      schema: {
        tags: ['Users'],
        summary: 'Create user (ADMIN)',
        body: z.object({
          email: z.string().email(),
          name: z.string().min(1).max(100),
          password: z.string().min(8).max(128),
          role: roleEnum.default('OPERATOR'),
        }),
      },
    },
    async (req, reply) => {
      const email = req.body.email.toLowerCase();
      if (await prisma.user.findUnique({ where: { email } })) {
        throw conflict('EMAIL_TAKEN', 'A user with this email already exists');
      }
      const user = await prisma.user.create({
        data: {
          email,
          name: req.body.name,
          role: req.body.role,
          passwordHash: await bcrypt.hash(req.body.password, 10),
        },
        select,
      });
      await writeAudit({ action: 'USER_CREATED', entityType: 'User', entityId: user.id, actorId: req.user.sub, metadata: { email, role: user.role } });
      return reply.status(201).send({ data: user });
    },
  );

  app.patch(
    '/:id',
    {
      schema: {
        tags: ['Users'],
        summary: 'Update user (ADMIN)',
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          name: z.string().min(1).max(100).optional(),
          role: roleEnum.optional(),
          isActive: z.boolean().optional(),
          password: z.string().min(8).max(128).optional(),
        }),
      },
    },
    async (req) => {
      const { password, ...rest } = req.body;
      const exists = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!exists) throw notFound('User');
      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
        select,
      });
      if (rest.isActive === false) {
        await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await writeAudit({ action: 'USER_UPDATED', entityType: 'User', entityId: user.id, actorId: req.user.sub, metadata: { ...rest, passwordChanged: !!password } });
      return { data: user };
    },
  );
};

export default routes;
