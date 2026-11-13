import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { unauthorized } from '../../lib/errors';
import { generateOpaqueToken, hashToken } from '../../lib/tokens';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../plugins/auth';

const REFRESH_PATH = '/api/auth';

const baseCookie = { httpOnly: true, sameSite: 'lax' as const, secure: env.COOKIE_SECURE };

function setAccessCookie(reply: FastifyReply, token: string) {
  reply.setCookie(ACCESS_COOKIE, token, { ...baseCookie, path: '/' });
}
function setRefreshCookie(reply: FastifyReply, token: string, expires: Date) {
  reply.setCookie(REFRESH_COOKIE, token, { ...baseCookie, path: REFRESH_PATH, expires });
}
function clearCookies(reply: FastifyReply) {
  reply.clearCookie(ACCESS_COOKIE, { path: '/' });
  reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
}

const publicUser = (u: { id: string; email: string; name: string; role: string }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
});

const routes: FastifyPluginAsyncZod = async (app) => {
  const refreshExpiry = () => new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

  app.post(
    '/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Log in; sets HTTP-only access and refresh cookies',
        body: z.object({ email: z.string().email(), password: z.string().min(1) }),
      },
    },
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { email: req.body.email.toLowerCase() } });
      const ok = user && user.isActive && (await bcrypt.compare(req.body.password, user.passwordHash));
      if (!ok) throw unauthorized('Invalid email or password');

      const raw = generateOpaqueToken();
      const expiresAt = refreshExpiry();
      await prisma.refreshToken.create({
        data: { userId: user.id, tokenHash: hashToken(raw), family: randomUUID(), expiresAt },
      });

      setAccessCookie(reply, app.jwt.sign({ sub: user.id, email: user.email, role: user.role }));
      setRefreshCookie(reply, raw, expiresAt);
      return { user: publicUser(user) };
    },
  );

  app.post(
    '/refresh',
    { schema: { tags: ['Auth'], summary: 'Rotate the refresh token and issue a new access token' } },
    async (req, reply) => {
      const raw = req.cookies[REFRESH_COOKIE];
      if (!raw) throw unauthorized('Missing refresh token');

      const existing = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(raw) },
        include: { user: true },
      });
      if (!existing) {
        clearCookies(reply);
        throw unauthorized('Invalid refresh token');
      }

      // Reuse of an already-rotated token => assume theft, kill the whole family.
      if (existing.revokedAt) {
        await prisma.refreshToken.updateMany({
          where: { family: existing.family, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        clearCookies(reply);
        throw unauthorized('Refresh token reuse detected');
      }
      if (existing.expiresAt < new Date() || !existing.user.isActive) {
        clearCookies(reply);
        throw unauthorized('Refresh token expired');
      }

      const nextRaw = generateOpaqueToken();
      const expiresAt = refreshExpiry();
      // Atomic claim: only one concurrent request can revoke this token.
      const rotated = await prisma.$transaction(async (tx) => {
        const claimed = await tx.refreshToken.updateMany({
          where: { id: existing.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        if (claimed.count === 0) return null;
        const next = await tx.refreshToken.create({
          data: { userId: existing.userId, tokenHash: hashToken(nextRaw), family: existing.family, expiresAt },
        });
        await tx.refreshToken.update({ where: { id: existing.id }, data: { replacedById: next.id } });
        return next;
      });
      if (!rotated) {
        clearCookies(reply);
        throw unauthorized('Refresh token already used');
      }

      const u = existing.user;
      setAccessCookie(reply, app.jwt.sign({ sub: u.id, email: u.email, role: u.role }));
      setRefreshCookie(reply, nextRaw, expiresAt);
      return { user: publicUser(u) };
    },
  );

  app.post('/logout', { schema: { tags: ['Auth'], summary: 'Revoke the session and clear cookies' } }, async (req, reply) => {
    const raw = req.cookies[REFRESH_COOKIE];
    if (raw) {
      const token = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });
      if (token) {
        await prisma.refreshToken.updateMany({
          where: { family: token.family, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    }
    clearCookies(reply);
    return reply.status(204).send();
  });

  app.get(
    '/me',
    { preHandler: app.authenticate, schema: { tags: ['Auth'], summary: 'Current user' } },
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
      if (!user || !user.isActive) throw unauthorized();
      return { user: publicUser(user) };
    },
  );
};

export default routes;
