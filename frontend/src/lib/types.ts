export type Role = 'ADMIN' | 'OPERATOR';
export type OrderStatus = 'PENDING' | 'ALLOCATED' | 'PACKED' | 'SHIPPED' | 'CANCELLED';
export const ORDER_STATUSES: OrderStatus[] = ['PENDING', 'ALLOCATED', 'PACKED', 'SHIPPED', 'CANCELLED'];

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Sku {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unitPrice: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  reorderThreshold: number;
  isActive: boolean;
  version: number;
}

export interface OrderItem {
  id: string;
  skuId: string;
  quantity: number;
  unitPrice: string;
  sku: { id: string; code: string; name: string };
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  shippingAddress: string;
  status: OrderStatus;
  trackingNumber: string | null;
  cancelReason: string | null;
  version: number;
  totalAmount: string;
  createdAt: string;
  items: OrderItem[];
  createdBy: { id: string; name: string; email: string };
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  actor: { id: string; name: string; email: string } | null;
  metadata: unknown;
  createdAt: string;
}

export interface Paged<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Metrics {
  orders: Record<OrderStatus, number>;
  activeSkus: number;
  lowStockSkus: number;
  outOfStockSkus: number;
}
