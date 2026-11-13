'use client';

import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import type { OrderStatus } from '@/lib/types';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:opacity-50',
};

export function Button({
  variant = 'primary',
  loading,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({
  label,
  testId,
  error,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; testId: string; error?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input
        {...rest}
        data-testid={testId}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      {error && (
        <span data-testid={`${testId}-error`} className="mt-1 block text-xs text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

export function Modal({
  testId,
  title,
  onClose,
  children,
  wide,
}: {
  testId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div data-testid={`${testId}-backdrop`} className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className={`relative max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white p-6 shadow-xl ${wide ? 'max-w-2xl' : 'max-w-md'}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 data-testid={`${testId}-title`} className="text-lg font-semibold">
            {title}
          </h2>
          <button data-testid={`${testId}-close-btn`} aria-label="Close" onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const statusStyles: Record<OrderStatus, string> = {
  PENDING: 'bg-slate-100 text-slate-700 ring-slate-300',
  ALLOCATED: 'bg-sky-100 text-sky-800 ring-sky-300',
  PACKED: 'bg-amber-100 text-amber-800 ring-amber-300',
  SHIPPED: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  CANCELLED: 'bg-red-100 text-red-800 ring-red-300',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      data-testid="order-status-badge"
      data-status={status}
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
}

export function Pagination({
  testId,
  page,
  pageSize,
  total,
  onPage,
}: {
  testId: string;
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div data-testid={testId} className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
      <span data-testid={`${testId}-info`}>
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" data-testid={`${testId}-prev-btn`} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <Button variant="secondary" data-testid={`${testId}-next-btn`} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function Spinner({ testId = 'loading-spinner' }: { testId?: string }) {
  return (
    <div data-testid={testId} className="flex justify-center p-8 text-slate-400">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

export function ErrorBox({ message, testId = 'error-message' }: { message: string; testId?: string }) {
  return (
    <div data-testid={testId} role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {message}
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const money = (v: string | number) => `$${Number(v).toFixed(2)}`;
export const fmtDate = (iso: string) => new Date(iso).toLocaleString();
