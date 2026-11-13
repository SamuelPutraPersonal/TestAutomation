'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { api, ApiError, qs } from '@/lib/api';
import { Button, ErrorBox, money, Spinner, StatusBadge, useDebounced } from '@/components/ui';
import { useToast } from '@/components/toast';
import { CancelOrderModal, CreateOrderModal, OrderDetailModal } from '@/components/order-modals';
import { ORDER_STATUSES, type Order, type OrderStatus, type Paged } from '@/lib/types';

type Action = 'allocate' | 'pack' | 'ship';
const NEXT: Partial<Record<OrderStatus, { action: Action; label: string }>> = {
  PENDING: { action: 'allocate', label: 'Allocate' },
  ALLOCATED: { action: 'pack', label: 'Pack' },
  PACKED: { action: 'ship', label: 'Ship' },
};
const CANCELLABLE: OrderStatus[] = ['PENDING', 'ALLOCATED', 'PACKED'];

// Poll fast while any shipment is still waiting on the 3s background tracking job.
const awaitingTracking = (orders?: Order[]) => !!orders?.some((o) => o.status === 'SHIPPED' && !o.trackingNumber);

function OrderCard({ order, onOpen, onCancel }: { order: Order; onOpen: () => void; onCancel: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const next = NEXT[order.status];

  const transition = useMutation({
    mutationFn: (action: Action) => api.post<{ data: Order }>(`/api/orders/${order.id}/${action}`, { version: order.version }),
    onSuccess: (_r, action) => {
      toast.success(`${order.orderNumber}: ${action} succeeded`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Action failed'),
    // Refetch either way: on conflict/insufficient stock the card must show the truth.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['skus'] });
      qc.invalidateQueries({ queryKey: ['metrics'] });
    },
  });

  return (
    <div data-testid={`order-card-${order.orderNumber}`} data-status={order.status} data-version={order.version} className="space-y-2 rounded-lg bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between">
        <button data-testid="order-number" onClick={onOpen} className="font-semibold text-indigo-700 hover:underline">
          {order.orderNumber}
        </button>
        <StatusBadge status={order.status} />
      </div>
      <p data-testid="order-customer" className="text-slate-700">{order.customerName}</p>
      <p className="text-xs text-slate-500">
        <span data-testid="order-item-count">{order.items.length} item(s)</span> · <span data-testid="order-total">{money(order.totalAmount)}</span>
      </p>

      {order.status === 'SHIPPED' &&
        (order.trackingNumber ? (
          <p data-testid="order-tracking-number" className="rounded bg-emerald-50 px-2 py-1 font-mono text-xs text-emerald-800">
            {order.trackingNumber}
          </p>
        ) : (
          <p data-testid="order-tracking-pending" className="flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
            <Loader2 className="h-3 w-3 animate-spin" /> Generating tracking number…
          </p>
        ))}
      {order.status === 'CANCELLED' && order.cancelReason && (
        <p data-testid="order-cancel-reason" className="text-xs text-red-700">{order.cancelReason}</p>
      )}

      {(next || CANCELLABLE.includes(order.status)) && (
        <div className="flex gap-2 pt-1">
          {next && (
            <Button data-testid={`order-action-${next.action}-btn`} className="flex-1" loading={transition.isPending} onClick={() => transition.mutate(next.action)}>
              {next.label}
            </Button>
          )}
          {CANCELLABLE.includes(order.status) && (
            <Button variant="secondary" data-testid="order-action-cancel-btn" disabled={transition.isPending} onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['orders', 'board', debounced],
    queryFn: () => api.get<Paged<Order>>(`/api/orders${qs({ pageSize: 100, search: debounced })}`),
    refetchInterval: (q) => (awaitingTracking(q.state.data?.data) ? 1000 : 10_000),
    placeholderData: (prev) => prev,
  });

  const orders = data?.data ?? [];
  const detail = orders.find((o) => o.id === detailId);
  const cancelling = orders.find((o) => o.id === cancelId);

  return (
    <div data-testid="orders-page" className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Order board</h1>
        <div className="flex items-center gap-3">
          <input
            data-testid="orders-search-input"
            placeholder="Search order # or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <Button data-testid="create-order-btn" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New order
          </Button>
        </div>
      </div>

      {isLoading && <Spinner testId="orders-loading" />}
      {error && (
        <div className="space-y-2">
          <ErrorBox testId="orders-error" message="Failed to load orders" />
          <Button variant="secondary" data-testid="orders-retry-btn" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {data && (
        <div data-testid="order-board" className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {ORDER_STATUSES.map((status) => {
            const col = orders.filter((o) => o.status === status);
            return (
              <section key={status} data-testid={`order-column-${status}`} className="rounded-xl bg-slate-100 p-3">
                <h2 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {status}
                  <span data-testid={`order-column-count-${status}`} className="rounded-full bg-white px-2 py-0.5">
                    {col.length}
                  </span>
                </h2>
                <div className="space-y-2">
                  {col.length === 0 && <p data-testid={`order-column-empty-${status}`} className="py-4 text-center text-xs text-slate-400">No orders</p>}
                  {col.map((o) => (
                    <OrderCard key={o.id} order={o} onOpen={() => setDetailId(o.id)} onCancel={() => setCancelId(o.id)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {creating && <CreateOrderModal onClose={() => setCreating(false)} />}
      {detail && <OrderDetailModal order={detail} onClose={() => setDetailId(null)} />}
      {cancelling && <CancelOrderModal order={cancelling} onClose={() => setCancelId(null)} />}
    </div>
  );
}
