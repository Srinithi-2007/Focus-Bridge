export function getApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') {
    if (configured) {
      if (window.location.hostname === '127.0.0.1' && configured.includes('localhost')) {
        return configured.replace('localhost', '127.0.0.1');
      }
      if (window.location.hostname === 'localhost' && configured.includes('127.0.0.1')) {
        return configured.replace('127.0.0.1', 'localhost');
      }
      return configured;
    }
    const host = window.location.hostname || 'localhost';
    return `http://${host}:4000/api`;
  }
  return configured || 'http://localhost:4000/api';
}

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export type Role = 'admin' | 'coach' | 'student';

export interface SessionUser {
  id: string;
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: string;
  coachId: string | null;
}

export class ApiError extends Error {
  status: number;
  details?: { path: string; message: string }[];
  constructor(message: string, status: number, details?: { path: string; message: string }[]) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function formatApiError(err: unknown, fallbackMessage: string): string {
  if (err instanceof ApiError) {
    if (err.details && err.details.length > 0) {
      const issues = err.details.map((d) => d.message).filter(Boolean);
      if (issues.length > 0) {
        return `${err.message}: ${issues.join('; ')}`;
      }
    }
    return err.message;
  }
  return fallbackMessage;
}

export function getCsrfToken(): string | null {
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)fb_csrf=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('fb_csrf_token');
  }
  return null;
}

// Sends JSON to the API using httpOnly cookie credentials and CSRF protection, normalizing errors.
export async function apiRequest<T>(path: string, options: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  let res: Response;
  const base = getApiBase();
  try {
    res = await fetch(`${base}${path}`, {
      method: options.method || (options.body ? 'POST' : 'GET'),
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      credentials: 'include',
    });
  } catch {
    throw new ApiError('Cannot reach the FocusBridge server. Check your connection and try again.', 0);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error?.message || 'Something went wrong. Please try again.', res.status, data?.error?.details);
  }
  return data as T;
}
