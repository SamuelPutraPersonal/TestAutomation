'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { ErrorBox, fmtDate, Pagination, Spinner, useDebounced } from '@/components/ui';
import type { AuditEntry, Paged } from '@/lib/types';

export default function AuditPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const debouncedAction = useDebounced(action);
  const isAdmin = user?.role === 'ADMIN';

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', page, debouncedAction, entityType],
    queryFn: () => api.get<Paged<AuditEntry>>(`/api/audit-logs${qs({ page, pageSize: 15, action: debouncedAction, entityType })}`),
    enabled: isAdmin,
    placeholderData: (prev) => prev,
  });

  if (!isAdmin) return <ErrorBox testId="forbidden-message" message="Only administrators can view the audit log." />;

  return (
    <div data-testid="audit-page" className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit Log</h1>
      <div className="flex gap-3">
        <input
          data-testid="audit-action-filter"
          placeholder="Filter by action (exact, e.g. ORDER_SHIPPED)"
          value={action}
          onChange={(e) => {
            setAction(e.target.value.trim());
            setPage(1);
          }}
          className="w-80 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          data-testid="audit-entity-filter"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All entities</option>
          <option value="Order">Order</option>
          <option value="Sku">Sku</option>
          <option value="User">User</option>
        </select>
      </div>

      {isLoading && <Spinner testId="audit-loading" />}
      {error && <ErrorBox testId="audit-error" message="Failed to load audit log" />}
      {data && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table data-testid="audit-table" className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Entity</th>
                <th className="px-4 py-2">Actor</th>
                <th className="px-4 py-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.data.length === 0 && (
                <tr>
                  <td data-testid="audit-empty" colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    No audit entries found.
                  </td>
                </tr>
              )}
              {data.data.map((a) => (
                <tr key={a.id} data-testid="audit-row" data-action={a.action}>
                  <td data-testid="audit-time" className="whitespace-nowrap px-4 py-2">
                    {fmtDate(a.createdAt)}
                  </td>
                  <td data-testid="audit-action" className="px-4 py-2 font-mono text-xs">
                    {a.action}
                  </td>
                  <td data-testid="audit-entity" className="px-4 py-2">
                    {a.entityType} <span className="text-xs text-slate-400">{a.entityId.slice(0, 8)}</span>
                  </td>
                  <td data-testid="audit-actor" className="px-4 py-2">
                    {a.actor?.name ?? 'System'}
                  </td>
                  <td data-testid="audit-metadata" className="px-4 py-2 font-mono text-xs text-slate-600">
                    {a.metadata ? JSON.stringify(a.metadata) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination testId="audit-pagination" page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
