import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { writeAudit } from '../lib/audit';

const timers = new Set<NodeJS.Timeout>();

export const trackingNumberFor = (orderNumber: string) => `TRK${orderNumber.replace(/\D/g, '').padStart(8, '0')}US`;

/** Worker body. Idempotent: only an order still lacking a tracking number is updated. */
async function processShipment(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== 'SHIPPED' || order.trackingNumber) return;
  const trackingNumber = trackingNumberFor(order.orderNumber);

  await prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({ where: { id: orderId, trackingNumber: null }, data: { trackingNumber } });
    if (res.count === 0) return;
    await writeAudit(
      {
        action: 'ORDER_SHIPPED',
        entityType: 'Order',
        entityId: orderId,
        actorId: null, // system actor
        metadata: { orderNumber: order.orderNumber, trackingNumber },
      },
      tx,
    );
  });
}

/** Simulated queue: runs after SHIPMENT_JOB_DELAY_MS in-process. */
export function enqueueShipmentJob(orderId: string, delayMs = env.SHIPMENT_JOB_DELAY_MS) {
  const t = setTimeout(() => {
    timers.delete(t);
    processShipment(orderId).catch((err) => console.error(`[shipment-job] failed for ${orderId}`, err));
  }, delayMs);
  timers.add(t);
}

export function cancelPendingJobs() {
  for (const t of timers) clearTimeout(t);
  timers.clear();
}

/** On boot, resume shipments whose job was lost to a restart. */
export async function recoverShipmentJobs() {
  const stuck = await prisma.order.findMany({ where: { status: 'SHIPPED', trackingNumber: null }, select: { id: true } });
  for (const o of stuck) enqueueShipmentJob(o.id, 0);
}
