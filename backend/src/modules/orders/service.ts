import type { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { writeAudit } from '../../lib/audit';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { enqueueShipmentJob } from '../../jobs/shipment';

export type OrderAction = 'allocate' | 'pack' | 'ship' | 'cancel';

const TRANSITIONS: Record<OrderAction, { from: OrderStatus[]; to: OrderStatus; stamp: 'allocatedAt' | 'packedAt' | 'shippedAt' | 'cancelledAt' }> = {
  allocate: { from: ['PENDING'], to: 'ALLOCATED', stamp: 'allocatedAt' },
  pack: { from: ['ALLOCATED'], to: 'PACKED', stamp: 'packedAt' },
  ship: { from: ['PACKED'], to: 'SHIPPED', stamp: 'shippedAt' },
  cancel: { from: ['PENDING', 'ALLOCATED', 'PACKED'], to: 'CANCELLED', stamp: 'cancelledAt' },
};

export const orderInclude = {
  items: { include: { sku: { select: { id: true, code: true, name: true } } }, orderBy: { sku: { code: 'asc' } } },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.OrderInclude;

type OrderWithRels = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function toOrderDto(o: OrderWithRels) {
  const total = o.items.reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0);
  return { ...o, totalAmount: total.toFixed(2), items: o.items.map((i) => ({ ...i, unitPrice: i.unitPrice.toString() })) };
}

export async function createOrder(
  input: { customerName: string; shippingAddress: string; items: { skuId: string; quantity: number }[] },
  actorId: string,
) {
  const skuIds = input.items.map((i) => i.skuId);
  if (new Set(skuIds).size !== skuIds.length) throw badRequest('Duplicate SKUs in order; merge quantities');

  const id = await prisma.$transaction(async (tx) => {
    const skus = await tx.sku.findMany({ where: { id: { in: skuIds }, isActive: true } });
    if (skus.length !== skuIds.length) throw badRequest('One or more SKUs do not exist or are inactive');
    const price = new Map(skus.map((s) => [s.id, s.unitPrice]));

    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
    const orderNumber = `ORD-${n.toString().padStart(6, '0')}`;

    const order = await tx.order.create({
      data: {
        orderNumber,
        customerName: input.customerName,
        shippingAddress: input.shippingAddress,
        createdById: actorId,
        items: { create: input.items.map((i) => ({ skuId: i.skuId, quantity: i.quantity, unitPrice: price.get(i.skuId)! })) },
      },
    });
    await writeAudit({ action: 'ORDER_CREATED', entityType: 'Order', entityId: order.id, actorId, metadata: { orderNumber } }, tx);
    return order.id;
  });
  return getOrder(id);
}

export async function getOrder(id: string) {
  const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  if (!order) throw notFound('Order');
  return order;
}

export async function transitionOrder(
  orderId: string,
  action: OrderAction,
  actorId: string,
  opts: { expectedVersion?: number; reason?: string } = {},
) {
  const rule = TRANSITIONS[action];

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw notFound('Order');

    if (opts.expectedVersion !== undefined && opts.expectedVersion !== order.version) {
      throw conflict('VERSION_CONFLICT', 'Order was modified by someone else. Reload and retry.', { currentVersion: order.version });
    }
    if (!rule.from.includes(order.status)) {
      throw conflict('INVALID_TRANSITION', `Cannot ${action} an order in status ${order.status}`, { status: order.status });
    }

    // Claim the transition; concurrent callers lose here instead of double-applying stock effects.
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: order.status, version: order.version },
      data: {
        status: rule.to,
        [rule.stamp]: new Date(),
        version: { increment: 1 },
        ...(action === 'cancel' ? { cancelReason: opts.reason ?? null } : {}),
      },
    });
    if (claimed.count === 0) {
      throw conflict('VERSION_CONFLICT', 'Order was modified concurrently. Reload and retry.');
    }

    // Consistent lock ordering avoids deadlocks between concurrent multi-SKU orders.
    const items = [...order.items].sort((a, b) => a.skuId.localeCompare(b.skuId));

    if (action === 'allocate') {
      for (const it of items) {
        const n = await tx.$executeRaw`
          UPDATE "Sku"
          SET "quantityReserved" = "quantityReserved" + ${it.quantity}, "version" = "version" + 1, "updatedAt" = now()
          WHERE "id" = ${it.skuId} AND "isActive" = true
            AND "quantityOnHand" - "quantityReserved" >= ${it.quantity}`;
        if (n === 0) {
          const sku = await tx.sku.findUnique({ where: { id: it.skuId } });
          throw conflict('INSUFFICIENT_STOCK', `Insufficient stock for ${sku?.code ?? it.skuId}`, {
            skuId: it.skuId,
            requested: it.quantity,
            available: sku ? sku.quantityOnHand - sku.quantityReserved : 0,
          });
        }
      }
    } else if (action === 'ship') {
      for (const it of items) {
        await tx.$executeRaw`
          UPDATE "Sku"
          SET "quantityOnHand" = "quantityOnHand" - ${it.quantity},
              "quantityReserved" = "quantityReserved" - ${it.quantity},
              "version" = "version" + 1, "updatedAt" = now()
          WHERE "id" = ${it.skuId}`;
      }
    } else if (action === 'cancel' && (order.status === 'ALLOCATED' || order.status === 'PACKED')) {
      for (const it of items) {
        await tx.$executeRaw`
          UPDATE "Sku"
          SET "quantityReserved" = "quantityReserved" - ${it.quantity}, "version" = "version" + 1, "updatedAt" = now()
          WHERE "id" = ${it.skuId}`;
      }
    }

    // ORDER_SHIPPED is written by the background worker once tracking is generated.
    if (action !== 'ship') {
      await writeAudit(
        {
          action: `ORDER_${rule.to}`,
          entityType: 'Order',
          entityId: orderId,
          actorId,
          metadata: { orderNumber: order.orderNumber, from: order.status, ...(opts.reason ? { reason: opts.reason } : {}) },
        },
        tx,
      );
    }
  });

  // Enqueue only after the transaction commits.
  if (action === 'ship') enqueueShipmentJob(orderId);
  return getOrder(orderId);
}
