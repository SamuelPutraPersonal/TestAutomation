'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button, ErrorBox, money, Pagination, Spinner, useDebounced } from '@/components/ui';
import { AdjustStockModal, DeactivateSkuModal, SkuFormModal } from '@/components/inventory-modals';
import type { Paged, Sku } from '@/lib/types';

type Modal = { kind: 'adjust' | 'edit' | 'deactivate'; sku: Sku } | { kind: 'create' } | null;

export default function InventoryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const debounced = useDebounced(search);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['skus', { page, search: debounced, lowStock, includeInactive }],
    queryFn: () => api.get<Paged<Sku>>(`/api/skus${qs({ page, pageSize: 10, search: debounced, lowStock, includeInactive })}`),
    placeholderData: (prev) => prev,
  });

  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <div data-testid="inventory-page" className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        {isAdmin && (
          <Button data-testid="create-sku-btn" onClick={() => setModal({ kind: 'create' })}>
            <Plus className="h-4 w-4" /> New SKU
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <input
          data-testid="inventory-search-input"
          placeholder="Search code or name…"
          value={search}
          onChange={(e) => reset(setSearch)(e.target.value)}
          className="w-72 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input data-testid="inventory-low-stock-toggle" type="checkbox" checked={lowStock} onChange={(e) => reset(setLowStock)(e.target.checked)} />
          Low stock only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input data-testid="inventory-inactive-toggle" type="checkbox" checked={includeInactive} onChange={(e) => reset(setIncludeInactive)(e.target.checked)} />
          Include inactive
        </label>
      </div>

      {isLoading && <Spinner testId="inventory-loading" />}
      {error && (
        <div className="space-y-2">
          <ErrorBox testId="inventory-error" message="Failed to load inventory" />
          <Button variant="secondary" data-testid="inventory-retry-btn" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {data && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table data-testid="inventory-table" className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2 text-right">Price</th>
                <th className="px-4 py-2 text-right">On hand</th>
                <th className="px-4 py-2 text-right">Reserved</th>
                <th className="px-4 py-2 text-right">Available</th>
                <th className="px-4 py-2 text-right">Version</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.data.length === 0 && (
                <tr>
                  <td data-testid="inventory-empty" colSpan={9} className="px-4 py-6 text-center text-slate-500">
                    No SKUs match your filters.
                  </td>
                </tr>
              )}
              {data.data.map((s) => {
                const low = s.quantityAvailable <= s.reorderThreshold;
                return (
                  <tr key={s.id} data-testid={`sku-row-${s.code}`} data-sku-code={s.code} className={s.isActive ? '' : 'opacity-60'}>
                    <td data-testid="sku-code" className="px-4 py-2 font-mono">{s.code}</td>
                    <td data-testid="sku-name" className="px-4 py-2">{s.name}</td>
                    <td data-testid="sku-price" className="px-4 py-2 text-right">{money(s.unitPrice)}</td>
                    <td data-testid="sku-on-hand" className="px-4 py-2 text-right">{s.quantityOnHand}</td>
                    <td data-testid="sku-reserved" className="px-4 py-2 text-right">{s.quantityReserved}</td>
                    <td data-testid="sku-available" className={`px-4 py-2 text-right font-medium ${low ? 'text-amber-600' : ''}`}>
                      {s.quantityAvailable}
                    </td>
                    <td data-testid="sku-version" className="px-4 py-2 text-right text-slate-500">{s.version}</td>
                    <td className="px-4 py-2">
                      <span data-testid="sku-status-badge" data-status={s.isActive ? 'active' : 'inactive'} className="text-xs">
                        {!s.isActive ? 'Inactive' : s.quantityAvailable <= 0 ? 'Out of stock' : low ? 'Low stock' : 'In stock'}
                      </span>
                    </td>
                    <td className="space-x-1 whitespace-nowrap px-4 py-2 text-right">
                      {s.isActive && (
                        <Button variant="secondary" data-testid={`adjust-stock-btn-${s.code}`} onClick={() => setModal({ kind: 'adjust', sku: s })}>
                          Adjust
                        </Button>
                      )}
                      {isAdmin && s.isActive && (
                        <>
                          <Button variant="secondary" data-testid={`edit-sku-btn-${s.code}`} onClick={() => setModal({ kind: 'edit', sku: s })}>
                            Edit
                          </Button>
                          <Button variant="ghost" data-testid={`deactivate-sku-btn-${s.code}`} onClick={() => setModal({ kind: 'deactivate', sku: s })}>
                            Deactivate
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination testId="inventory-pagination" page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </div>
      )}

      {modal?.kind === 'adjust' && <AdjustStockModal key={`${modal.sku.id}`} sku={modal.sku} onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && <SkuFormModal sku={modal.sku} onClose={() => setModal(null)} />}
      {modal?.kind === 'create' && <SkuFormModal onClose={() => setModal(null)} />}
      {modal?.kind === 'deactivate' && <DeactivateSkuModal sku={modal.sku} onClose={() => setModal(null)} />}
    </div>
  );
}
