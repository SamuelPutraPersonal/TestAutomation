import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditInput {
  action: string;
  entityType: 'Order' | 'Sku' | 'User';
  entityId: string;
  actorId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/** Append-only. Pass a transaction client to make the entry atomic with the change. */
export function writeAudit(input: AuditInput, db: Db = prisma) {
  return db.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      actorId: input.actorId ?? null,
      metadata: input.metadata,
    },
  });
}
