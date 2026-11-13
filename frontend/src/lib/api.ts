const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any,
  ) {
    super(message);
  }
}

// Concurrent 401s share a single refresh call (refresh tokens are single-use).
let refreshing: Promise<boolean> | null = null;
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function send(method: string, path: string, body?: unknown) {
  return fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await send(method, path, body);
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server');
  }

  const isAuthCall = path === '/api/auth/login' || path === '/api/auth/refresh';
  if (res.status === 401 && !isAuthCall) {
    if (await refreshSession()) {
      res = await send(method, path, body);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('auth:expired'));
    }
  }

  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== false) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
};
