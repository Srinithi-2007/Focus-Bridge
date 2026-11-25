'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest, ApiError, formatApiError, getCsrfToken, getApiBase } from '@/lib/api';
import { clearSession } from '@/lib/session';

function sendToLogin() {
  clearSession();
  if (typeof window !== 'undefined') window.location.href = '/login';
}

// Every workspace request authenticates via httpOnly cookie credentials and CSRF headers, returning to sign-in on 401.
export async function adminRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  try {
    return await apiRequest<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) sendToLogin();
    throw err;
  }
}

export function errorMessage(err: unknown): string {
  return formatApiError(err, 'Something went wrong. Please try again.');
}

// Fetches a CSV export with httpOnly session cookie credentials and saves it as a file.
export async function downloadCsv(path: string, filename: string) {
  const headers: Record<string, string> = {};
  const csrf = getCsrfToken();
  if (csrf) headers['X-CSRF-Token'] = csrf;

  let res: Response;
  const base = getApiBase();
  try {
    res = await fetch(`${base}${path}`, {
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Export failed. Network error.', 0);
  }

  if (res.status === 401) {
    sendToLogin();
    throw new ApiError('Please sign in again.', 401);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error?.message || 'Export failed.', res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Loads data for a path. Changing `path` (which encodes filters) or calling reload() refetches.
export function useAdminData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    adminRequest<T>(path)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}
