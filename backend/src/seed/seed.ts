import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Deterministic seed: fixed UUIDs, fixed timestamps, fixed credentials.
 * Assumes empty tables (the reset route truncates first).
 */
const uid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const day = (d: number) => new Date(Date.UTC(2025, 0, d, 9, 0, 0));

export const SEED_USERS = [
  { id: uid(1), email: 'admin@example.com', name: 'Alice Admin', role: 'ADMIN', password: 'Admin123!' },
  { id: uid(2), email: 'operator@example.com', name: 'Oscar Operator', role: 'OPERATOR', password: 'Operator123!' },
  { id: uid(3), email: 'operator2@example.com', name: 'Olivia Operator', role: 'OPERATOR', password: 'Operator123!' },
] as const;

const SKUS = [
  { id: uid(11), code: 'WIDGET-001', name: 'Standard Widget', unitPrice: '4.50', quantityOnHand: 200, reorderThreshold: 20 },
  { id: uid(12), code: 'WIDGET-002', name: 'Premium Widget', unitPrice: '9.99', quantityOnHand: 80, reorderThreshold: 15 },
  { id: uid(13), code: 'GADGET-001', name: 'Basic Gadget', unitPrice: '24.00', quantityOnHand: 50, reorderThreshold: 10 },
  { id: uid(14), code: 'GADGET-002', name: 'Smart Gadget', unitPrice: '59.90', quantityOnHand: 12, reorderThreshold: 10 },
  { id: uid(15), code: 'BOLT-M8', name: 'M8 Bolt Pack', unitPrice: '1.25', quantityOnHand: 500, reorderThreshold: 100 },
  { id: uid(16), code: 'CABLE-USB', name: 'USB-C Cable', unitPrice: '7.80', quantityOnHand: 0, reorderThreshold: 25 },
  { id: uid(17), code: 'BOX-SM', name: 'Small Shipping Box', unitPrice: '0.80', quantityOnHand: 1000, reorderThreshold: 200 },
  { id: uid(18), code: 'LEGACY-001', name: 'Legacy Item (inactive)', unitPrice: '3.00', quantityOnHand: 5, reorderThreshold: 5, isActive: false },
];

type SeedOrder = {
  n: number;
  customerName: string;
  status: 'PENDING' | 'ALLOCATED' | 'PACKED' | 'SHIPPED' | 'CANCELLED';
  items: [skuId: string, qty: number][];
  tracking?: string;
};

const ORDERS: SeedOrder[] = [
  { n: 1, customerName: 'Acme Corp', status: 'PENDING', items: [[uid(11), 10], [uid(15), 20]] },
  { n: 2, customerName: 'Globex Ltd', status: 'ALLOCATED', items: [[uid(14), 4], [uid(12), 5]] },
  { n: 3, customerName: 'Initech', status: 'PACKED', items: [[uid(13), 2], [uid(17), 2]] },
  { n: 4, customerName: 'Umbrella Inc', status: 'SHIPPED', items: [[uid(11), 5]], tracking: 'TRK00000004US' },
  { n: 5, customerName: 'Hooli', status: 'CANCELLED', items: [[uid(14), 1]] },
];

export async function runSeed(db: PrismaClient) {
  for (const u of SEED_USERS) {
    await db.user.create({
      data: { id: u.id, email: u.email, name: u.name, role: u.role, passwordHash: await bcrypt.hash(u.password, 10), createdAt: day(1) },
    });
  }

  // Reservations derive from open (ALLOCATED/PACKED) orders so stock is always consistent.
  const reserved = new Map<string, number>();
  for (const o of ORDERS.filter((o) => o.status === 'ALLOCATED' || o.status === 'PACKED')) {
    for (const [skuId, q] of o.items) reserved.set(skuId, (reserved.get(skuId) ?? 0) + q);
  }
  for (const s of SKUS) {
    await db.sku.create({ data: { ...s, quantityReserved: reserved.get(s.id) ?? 0, createdAt: day(1) } });
  }

  const operator = SEED_USERS[1].id;
  for (const o of ORDERS) {
    const orderNumber = `ORD-${String(o.n).padStart(6, '0')}`;
    const unitPrice = (id: string) => SKUS.find((s) => s.id === id)!.unitPrice;
    await db.order.create({
      data: {
        id: uid(20 + o.n),
        orderNumber,
        customerName: o.customerName,
        shippingAddress: `${o.n} Warehouse Way, Springfield`,
        status: o.status,
        trackingNumber: o.tracking ?? null,
        cancelReason: o.status === 'CANCELLED' ? 'Customer request' : null,
        version: 1,
        createdById: operator,
        createdAt: day(1 + o.n),
        allocatedAt: o.status !== 'PENDING' && o.status !== 'CANCELLED' ? day(2 + o.n) : null,
        packedAt: o.status === 'PACKED' || o.status === 'SHIPPED' ? day(2 + o.n) : null,
        shippedAt: o.status === 'SHIPPED' ? day(3 + o.n) : null,
        cancelledAt: o.status === 'CANCELLED' ? day(3 + o.n) : null,
        items: { create: o.items.map(([skuId, quantity]) => ({ skuId, quantity, unitPrice: unitPrice(skuId) })) },
      },
    });
    await db.auditLog.create({
      data: {
        action: 'ORDER_CREATED',
        entityType: 'Order',
        entityId: uid(20 + o.n),
        actorId: operator,
        metadata: { orderNumber },
        createdAt: day(1 + o.n),
      },
    });
  }
  await db.auditLog.create({
    data: {
      action: 'ORDER_SHIPPED',
      entityType: 'Order',
      entityId: uid(24),
      actorId: null,
      metadata: { orderNumber: 'ORD-000004', trackingNumber: 'TRK00000004US' },
      createdAt: day(8),
    },
  });

  // Next created order becomes ORD-000006.
  await db.$executeRawUnsafe(`SELECT setval('order_number_seq', ${ORDERS.length})`);
}
