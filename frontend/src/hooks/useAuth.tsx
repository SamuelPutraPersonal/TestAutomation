'use client';

import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>('/api/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });

  // Fired by the API client when a refresh fails mid-session.
  useEffect(() => {
    const onExpired = () => qc.setQueryData(['me'], null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [qc]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { user } = await api.post<{ user: User }>('/api/auth/login', { email, password });
      qc.setQueryData(['me'], user);
      return user;
    },
    [qc],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    }
  }, [qc]);

  return <Ctx.Provider value={{ user: me.data ?? null, isLoading: me.isLoading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
