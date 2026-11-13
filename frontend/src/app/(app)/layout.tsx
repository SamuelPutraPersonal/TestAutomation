'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Boxes, ClipboardList, FlaskConical, LayoutDashboard, LogOut, Package, ScrollText } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', id: 'dashboard', icon: LayoutDashboard, adminOnly: false },
  { href: '/inventory', label: 'Inventory', id: 'inventory', icon: Package, adminOnly: false },
  { href: '/orders', label: 'Orders', id: 'orders', icon: ClipboardList, adminOnly: false },
  { href: '/audit-logs', label: 'Audit Log', id: 'audit', icon: ScrollText, adminOnly: true },
  { href: '/practice', label: 'Practice Lab', id: 'practice', icon: FlaskConical, adminOnly: false },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  if (isLoading || !user) return <Spinner testId="auth-loading" />;

  return (
    <div className="flex min-h-screen">
      <aside data-testid="sidebar" className="flex w-56 shrink-0 flex-col bg-slate-900 p-4 text-slate-200">
        <div className="mb-8 flex items-center gap-2 text-white">
          <Boxes className="h-6 w-6" />
          <span className="font-semibold">Warehouse Portal</span>
        </div>
        <nav className="flex-1 space-y-1">
          {NAV.filter((n) => !n.adminOnly || user.role === 'ADMIN').map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                data-testid={`nav-${n.id}-link`}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${active ? 'bg-slate-700 text-white' : 'hover:bg-slate-800'}`}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-700 pt-4 text-sm">
          <p data-testid="user-name" className="font-medium text-white">
            {user.name}
          </p>
          <p data-testid="user-email" className="truncate text-xs text-slate-400">
            {user.email}
          </p>
          <span data-testid="user-role-badge" className="mt-1 inline-block rounded bg-indigo-500/30 px-1.5 py-0.5 text-xs text-indigo-200">
            {user.role}
          </span>
          <button
            data-testid="logout-btn"
            onClick={async () => {
              await logout();
              router.replace('/login');
            }}
            className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-slate-300 hover:bg-slate-800"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
