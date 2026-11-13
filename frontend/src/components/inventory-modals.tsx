'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { Sku } from '@/lib/types';
import { Button, ErrorBox, Field, Modal } from './ui';
import { useToast } from './toast';

function useRefreshInventory() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['skus'] });
    qc.invalidateQueries({ queryKey: ['metrics'] });
  };
}

/** Shown when the server rejects our stale `version`. Lets the user pull the latest copy. */
function ConflictBanner({ prefix, onReload, loading }: { prefix: string; onReload: () => void; loading: boolean }) {
  return (
    <div data-testid={`${prefix}-conflict-banner`} role="alert" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p>This SKU was changed by someone else since you opened it. Reload the latest values and try again.</p>
      <Button variant="secondary" data-testid={`${prefix}-reload-btn`} loading={loading} onClick={onReload}>
        Reload latest
      </Button>
    </div>
  );
}

export function AdjustStockModal({ sku: initial, onClose }: { sku: Sku; onClose: () => void }) {
  const [sku, setSku] = useState(initial);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const refresh = useRefreshInventory();

  const reload = useMutation({
    mutationFn: () => api.get<{ data: Sku }>(`/api/skus/${sku.id}`).then((r) => r.data),
    onSuccess: (fresh) => {
      setSku(fresh);
      setConflict(false);
      setError(null);
    },
  });

  const adjust = useMutation({
    mutationFn: () =>
      api.post(`/api/skus/${sku.id}/adjust-stock`, { version: sku.version, delta: Number(delta), reason: reason || undefined }),
    onSuccess: () => {
      toast.success(`Stock adjusted for ${sku.code}`);
      refresh();
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') {
        setConflict(true);
        toast.error('Version conflict: SKU was modified by someone else');
      } else {
        const msg = e instanceof ApiError ? e.message : 'Adjustment failed';
        setError(msg);
        toast.error(msg);
      }
    },
  });

  const valid = /^-?\d+$/.test(delta) && Number(delta) !== 0;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (valid) adjust.mutate();
  };

  return (
    <Modal testId="adjust-stock-modal" title={`Adjust stock · ${sku.code}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <dl className="grid grid-cols-3 gap-2 rounded-md bg-slate-50 p-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">On hand</dt>
            <dd data-testid="adjust-stock-on-hand">{sku.quantityOnHand}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Reserved</dt>
            <dd data-testid="adjust-stock-reserved">{sku.quantityReserved}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Version</dt>
            <dd data-testid="adjust-stock-version">{sku.version}</dd>
          </div>
        </dl>
        <Field label="Delta (use negative to remove)" testId="adjust-stock-delta-input" inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. 25 or -10" />
        <Field label="Reason (optional)" testId="adjust-stock-reason-input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
        {conflict && <ConflictBanner prefix="adjust-stock" onReload={() => reload.mutate()} loading={reload.isPending} />}
        {error && <ErrorBox testId="adjust-stock-error" message={error} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" data-testid="adjust-stock-cancel-btn" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="adjust-stock-submit-btn" loading={adjust.isPending} disabled={!valid || conflict}>
            Apply adjustment
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function SkuFormModal({ sku: initial, onClose }: { sku?: Sku; onClose: () => void }) {
  const editing = !!initial;
  const [sku, setSku] = useState(initial);
  const [form, setForm] = useState({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    unitPrice: initial?.unitPrice ?? '',
    quantityOnHand: String(initial?.quantityOnHand ?? 0),
    reorderThreshold: String(initial?.reorderThreshold ?? 10),
  });
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const refresh = useRefreshInventory();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const reload = useMutation({
    mutationFn: () => api.get<{ data: Sku }>(`/api/skus/${sku!.id}`).then((r) => r.data),
    onSuccess: (fresh) => {
      setSku(fresh);
      setForm((f) => ({ ...f, name: fresh.name, description: fresh.description ?? '', unitPrice: fresh.unitPrice, quantityOnHand: String(fresh.quantityOnHand), reorderThreshold: String(fresh.reorderThreshold) }));
      setConflict(false);
      setError(null);
    },
  });

  const save = useMutation({
    mutationFn: () => {
      const common = {
        name: form.name.trim(),
        unitPrice: Number(form.unitPrice),
        quantityOnHand: Number(form.quantityOnHand),
        reorderThreshold: Number(form.reorderThreshold),
      };
      return editing
        ? api.patch(`/api/skus/${sku!.id}`, { ...common, description: form.description || null, version: sku!.version })
        : api.post('/api/skus', { ...common, code: form.code.trim(), description: form.description || undefined });
    },
    onSuccess: () => {
      toast.success(editing ? `Updated ${sku!.code}` : `Created ${form.code.toUpperCase()}`);
      refresh();
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') {
        setConflict(true);
        toast.error('Version conflict: SKU was modified by someone else');
      } else {
        const msg = e instanceof ApiError ? e.message : 'Save failed';
        setError(msg);
        toast.error(msg);
      }
    },
  });

  const valid = (editing || form.code.trim()) && form.name.trim() && form.unitPrice !== '' && !Number.isNaN(Number(form.unitPrice));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (valid) save.mutate();
  };

  return (
    <Modal testId="sku-form-modal" title={editing ? `Edit ${sku!.code}` : 'New SKU'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        {!editing && <Field label="Code" testId="sku-code-input" value={form.code} onChange={set('code')} />}
        <Field label="Name" testId="sku-name-input" value={form.name} onChange={set('name')} />
        <Field label="Description" testId="sku-description-input" value={form.description} onChange={set('description')} />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Unit price" testId="sku-price-input" inputMode="decimal" value={form.unitPrice} onChange={set('unitPrice')} />
          <Field label="On hand" testId="sku-quantity-input" inputMode="numeric" value={form.quantityOnHand} onChange={set('quantityOnHand')} />
          <Field label="Reorder at" testId="sku-threshold-input" inputMode="numeric" value={form.reorderThreshold} onChange={set('reorderThreshold')} />
        </div>
        {editing && (
          <p className="text-xs text-slate-500">
            Version <span data-testid="sku-form-version">{sku!.version}</span>
          </p>
        )}
        {conflict && <ConflictBanner prefix="sku-form" onReload={() => reload.mutate()} loading={reload.isPending} />}
        {error && <ErrorBox testId="sku-form-error" message={error} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" data-testid="sku-form-cancel-btn" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="sku-form-submit-btn" loading={save.isPending} disabled={!valid || conflict}>
            {editing ? 'Save changes' : 'Create SKU'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function DeactivateSkuModal({ sku, onClose }: { sku: Sku; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshInventory();
  const [error, setError] = useState<string | null>(null);
  const del = useMutation({
    mutationFn: () => api.delete(`/api/skus/${sku.id}?version=${sku.version}`),
    onSuccess: () => {
      toast.success(`Deactivated ${sku.code}`);
      refresh();
      onClose();
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Deactivation failed';
      setError(msg);
      toast.error(msg);
    },
  });
  return (
    <Modal testId="deactivate-sku-modal" title="Deactivate SKU" onClose={onClose}>
      <p className="mb-4 text-sm">
        Deactivate <strong>{sku.code}</strong>? It will no longer be available for new orders.
      </p>
      {error && <ErrorBox testId="deactivate-sku-error" message={error} />}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" data-testid="deactivate-sku-cancel-btn" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" data-testid="deactivate-sku-confirm-btn" loading={del.isPending} onClick={() => del.mutate()}>
          Deactivate
        </Button>
      </div>
    </Modal>
  );
}
