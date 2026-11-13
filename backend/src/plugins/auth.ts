import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';

export interface JwtUser {
  sub: string;
  email: string;
  role: Role;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: Role[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

async function authPlugin(app: FastifyInstance) {
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET,
    cookie: { cookieName: ACCESS_COOKIE, signed: false },
    sign: { expiresIn: env.ACCESS_TOKEN_TTL },
  });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw unauthorized();
    }
  });

  app.decorate('requireRole', (...roles: Role[]) => async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    if (!roles.includes(req.user.role)) throw forbidden();
  });
}

export default fp(authPlugin, { name: 'auth' });
