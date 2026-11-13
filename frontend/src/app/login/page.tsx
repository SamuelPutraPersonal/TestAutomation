'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Boxes } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/lib/api';
import { Button, Field } from '@/components/ui';
import { useToast } from '@/components/toast';

const DEMO = [
  { id: 'admin', label: 'Admin', email: 'admin@example.com', password: 'Admin123!' },
  { id: 'operator2', label: 'Operator 2', email: 'operator2@example.com', password: 'Operator123!' },
];

export default function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user) router.replace('/dashboard');
  }, [isLoading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const u = await login(email, password);
      toast.success(`Welcome back, ${u.name}`);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div data-testid="login-card" className="w-full max-w-sm rounded-xl bg-white p-8 shadow">
        <div className="mb-6 flex items-center gap-2">
          <Boxes className="h-7 w-7 text-indigo-600" />
          <h1 data-testid="login-title" className="text-xl font-semibold">
            Warehouse Portal
          </h1>
        </div>
        <form data-testid="login-form" onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Email" testId="login-email-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field label="Password" testId="login-password-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && (
            <p data-testid="login-error-message" role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" data-testid="submit-login-btn" loading={submitting} className="w-full">
            Sign in
          </Button>
        </form>
        <div className="mt-6 border-t pt-4">
          <p className="mb-2 text-xs text-slate-500">Demo accounts (local dev)</p>
          <div className="flex gap-2">
            {DEMO.map((d) => (
              <Button
                key={d.id}
                variant="secondary"
                data-testid={`login-fill-${d.id}-btn`}
                className="flex-1 text-xs"
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                }}
              >
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
