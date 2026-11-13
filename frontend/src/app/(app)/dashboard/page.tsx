'use client';

import { useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { ErrorBox, fmtDate, Spinner, StatusBadge } from '@/components/ui';
import { ORDER_STATUSES, type AuditEntry, type Metrics, type Order, type Paged, type Sku } from '@/lib/types';

const POLL = 5000;

function Card({ id, label, value, tone = 'text-slate-900' }: { id: string; label: string; value: number; tone?: string }) {
  return (
    <div data-testid={`metric-${id}`} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p data-testid={`metric-${id}-value`} className={`mt-1 text-3xl font-semibold ${tone}`}>
        {value}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const metrics = useQuery({ queryKey: ['metrics'], queryFn: () => api.get<{ data: Metrics }>('/api/metrics').then((r) => r.data), refetchInterval: POLL });
  const recentOrders = useQuery({
    queryKey: ['orders', 'recent'],
    queryFn: () => api.get<Paged<Order>>(`/api/orders${qs({ pageSize: 5 })}`),
    refetchInterval: POLL,
  });
  const lowStock = useQuery({
    queryKey: ['skus', 'low'],
    queryFn: () => api.get<Paged<Sku>>(`/api/skus${qs({ lowStock: true, pageSize: 6 })}`),
    refetchInterval: POLL,
  });
  const activity = useQuery({
    queryKey: ['audit', 'recent'],
    queryFn: () => api.get<Paged<AuditEntry>>(`/api/audit-logs${qs({ pageSize: 6 })}`),
    enabled: isAdmin,
    refetchInterval: POLL,
  });

  if (metrics.isLoading) return <Spinner testId="dashboard-loading" />;
  if (metrics.error || !metrics.data) return <ErrorBox testId="dashboard-error" message="Failed to load metrics" />;
  const m = metrics.data;
  const totalOrders = ORDER_STATUSES.reduce((n, s) => n + m.orders[s], 0);

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <section data-testid="metrics-orders" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Card id="total-orders" label="Total orders" value={totalOrders} />
        {ORDER_STATUSES.map((s) => (
          <Card key={s} id={`orders-${s.toLowerCase()}`} label={s} value={m.orders[s]} />
        ))}
      </section>

      <section data-testid="metrics-inventory" className="grid grid-cols-3 gap-3">
        <Card id="active-skus" label="Active SKUs" value={m.activeSkus} />
        <Card id="low-stock" label="Low stock" value={m.lowStockSkus} tone="text-amber-600" />
        <Card id="out-of-stock" label="Out of stock" value={m.outOfStockSkus} tone="text-red-600" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section data-testid="recent-orders" className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 font-medium">Recent orders</h2>
          <ul className="divide-y">
            {recentOrders.data?.data.map((o) => (
              <li key={o.id} data-testid={`recent-order-${o.orderNumber}`} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className="font-medium">{o.orderNumber}</span> · {o.customerName}
                </span>
                <StatusBadge status={o.status} />
              </li>
            ))}
          </ul>
        </section>

        <section data-testid="low-stock-list" className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 font-medium">Low stock items</h2>
          {lowStock.data?.data.length === 0 && <p data-testid="low-stock-empty" className="text-sm text-slate-500">All stock levels healthy.</p>}
          <ul className="divide-y">
            {lowStock.data?.data.map((s) => (
              <li key={s.id} data-testid={`low-stock-${s.code}`} className="flex justify-between py-2 text-sm">
                <span>
                  <span className="font-medium">{s.code}</span> · {s.name}
                </span>
                <span className={s.quantityAvailable <= 0 ? 'text-red-600' : 'text-amber-600'}>{s.quantityAvailable} available</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {isAdmin && (
        <section data-testid="recent-activity" className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 font-medium">Recent activity</h2>
          <ul className="divide-y">
            {activity.data?.data.map((a) => (
              <li key={a.id} data-testid="recent-activity-item" className="flex justify-between py-2 text-sm">
                <span>
                  <span className="font-mono text-xs">{a.action}</span> · {a.actor?.name ?? 'System'}
                </span>
                <span className="text-slate-500">{fmtDate(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
