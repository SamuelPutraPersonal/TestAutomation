'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError, qs } from '@/lib/api';
import type { Order, Paged, Sku } from '@/lib/types';
import { Button, ErrorBox, Field, fmtDate, Modal, money, StatusBadge } from './ui';
import { useToast } from './toast';

interface Line {
  key: number;
  skuId: string;
  quantity: string;
}

export function CreateOrderModal({ onClose }: { onClose: () => void }) {
  const [customerName, setCustomerName] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [lines, setLines] = useState<Line[]>([{ key: 1, skuId: '', quantity: '1' }]);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  const skus = useQuery({
    queryKey: ['skus', 'order-picker'],
    queryFn: () => api.get<Paged<Sku>>(`/api/skus${qs({ pageSize: 100 })}`).then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<{ data: Order }>('/api/orders', {
        customerName: customerName.trim(),
        shippingAddress: shippingAddress.trim(),
        items: lines.map((l) => ({ skuId: l.skuId, quantity: Number(l.quantity) })),
      }),
    onSuccess: (r) => {
      toast.success(`Order ${r.data.orderNumber} created`);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['metrics'] });
      onClose();
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Could not create order';
      setError(msg);
      toast.error(msg);
    },
  });

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const chosen = lines.map((l) => l.skuId).filter(Boolean);
  const dup = new Set(chosen).size !== chosen.length;
  const valid =
    customerName.trim() &&
    shippingAddress.trim() &&
    !dup &&
    lines.every((l) => l.skuId && Number.isInteger(Number(l.quantity)) && Number(l.quantity) >= 1);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (valid) create.mutate();
  };

  return (
    <Modal testId="create-order-modal" title="New order" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer" testId="order-customer-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <Field label="Shipping address" testId="order-address-input" value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} />
        </div>

        <div data-testid="order-lines" className="space-y-2">
          <p className="text-sm font-medium">Items</p>
          {lines.map((l, i) => (
            <div key={l.key} data-testid={`order-line-${i}`} className="flex items-center gap-2">
              <select
                data-testid={`order-line-sku-select-${i}`}
                value={l.skuId}
                onChange={(e) => update(l.key, { skuId: e.target.value })}
                className="flex-1 rounded-md border border-slate-300 px-2 py-2 text-sm"
              >
                <option value="">Select SKU…</option>
                {skus.data?.filter((s) => s.isActive).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name} ({s.quantityAvailable} available)
                  </option>
                ))}
              </select>
              <input
                data-testid={`order-line-qty-input-${i}`}
                aria-label="Quantity"
                inputMode="numeric"
                value={l.quantity}
                onChange={(e) => update(l.key, { quantity: e.target.value })}
                className="w-20 rounded-md border border-slate-300 px-2 py-2 text-sm"
              />
              <Button variant="ghost" data-testid={`order-line-remove-btn-${i}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {dup && <p data-testid="order-duplicate-sku-error" className="text-xs text-red-600">Each SKU can appear only once.</p>}
          <Button variant="secondary" data-testid="order-add-line-btn" onClick={() => setLines((ls) => [...ls, { key: Math.max(...ls.map((x) => x.key)) + 1, skuId: '', quantity: '1' }])}>
            <Plus className="h-4 w-4" /> Add item
          </Button>
        </div>

        {error && <ErrorBox testId="create-order-error" message={error} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" data-testid="create-order-cancel-btn" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="create-order-submit-btn" loading={create.isPending} disabled={!valid}>
            Create order
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function CancelOrderModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => api.post(`/api/orders/${order.id}/cancel`, { version: order.version, reason: reason.trim() || undefined }),
    onSuccess: () => {
      toast.success(`Order ${order.orderNumber} cancelled`);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['skus'] });
      qc.invalidateQueries({ queryKey: ['metrics'] });
      onClose();
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Cancel failed';
      setError(msg);
      toast.error(msg);
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
  return (
    <Modal testId="cancel-order-modal" title={`Cancel ${order.orderNumber}`} onClose={onClose}>
      <p className="mb-3 text-sm">Any stock reserved for this order will be released.</p>
      <Field label="Reason (optional)" testId="cancel-reason-input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
      {error && (
        <div className="mt-3">
          <ErrorBox testId="cancel-order-error" message={error} />
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" data-testid="cancel-order-dismiss-btn" onClick={onClose}>
          Keep order
        </Button>
        <Button variant="danger" data-testid="cancel-order-confirm-btn" loading={cancel.isPending} onClick={() => cancel.mutate()}>
          Cancel order
        </Button>
      </div>
    </Modal>
  );
}

export function OrderDetailModal({ order, onClose }: { order: Order; onClose: () => void }) {
  return (
    <Modal testId="order-detail-modal" title={order.orderNumber} onClose={onClose} wide>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-3">
          <StatusBadge status={order.status} />
          <span data-testid="order-detail-tracking">{order.trackingNumber ?? (order.status === 'SHIPPED' ? 'Generating tracking number…' : 'No tracking yet')}</span>
        </div>
        <p data-testid="order-detail-customer">
          {order.customerName} · {order.shippingAddress}
        </p>
        <table className="w-full text-left" data-testid="order-detail-items">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1">SKU</th>
              <th className="py-1 text-right">Qty</th>
              <th className="py-1 text-right">Unit</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id} data-testid={`order-detail-item-${i.sku.code}`}>
                <td className="py-1">{i.sku.code} · {i.sku.name}</td>
                <td className="py-1 text-right">{i.quantity}</td>
                <td className="py-1 text-right">{money(i.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p data-testid="order-detail-total" className="text-right font-medium">Total {money(order.totalAmount)}</p>
        <p className="text-xs text-slate-500">Created {fmtDate(order.createdAt)} by {order.createdBy.name} · version {order.version}</p>
        {order.cancelReason && <p data-testid="order-detail-cancel-reason" className="text-red-700">Cancelled: {order.cancelReason}</p>}
      </div>
    </Modal>
  );
}
