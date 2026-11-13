'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

const styles: Record<ToastType, string> = {
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  error: 'border-red-300 bg-red-50 text-red-900',
  info: 'border-sky-300 bg-sky-50 text-sky-900',
};
const icons = { success: CheckCircle2, error: XCircle, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t, { id, type, message }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div data-testid="toast-container" aria-live="polite" className="fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div
              key={t.id}
              data-testid={`toast-${t.type}`}
              data-toast-type={t.type}
              role={t.type === 'error' ? 'alert' : 'status'}
              className={`flex items-start gap-2 rounded-lg border p-3 text-sm shadow-lg ${styles[t.type]}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <p data-testid="toast-message" className="flex-1">
                {t.message}
              </p>
              <button data-testid="toast-close-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
