import { apiRequest, type Role, type SessionUser } from './api';

// Authentication sessions live exclusively in an httpOnly cookie (`fb_session`) set by the backend,
// preventing XSS-based JWT theft. Only non-sensitive UI user profile and CSRF fallback are stored client-side.
const LEGACY_TOKEN_KEY = 'fb_token';
const USER_KEY = 'fb_user';
const CSRF_KEY = 'fb_csrf_token';

export function saveSession(_token: string | null | undefined, user: SessionUser, csrfToken?: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(LEGACY_TOKEN_KEY);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  if (csrfToken) {
    sessionStorage.setItem(CSRF_KEY, csrfToken);
  }
}

export function getStoredCsrfToken(): string | null {
  return typeof window === 'undefined' ? null : sessionStorage.getItem(CSRF_KEY);
}

export function getCachedUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as SessionUser) : null;
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(LEGACY_TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(CSRF_KEY);
}

export async function logout() {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } catch {
    // Ignore network error on logout
  } finally {
    clearSession();
  }
}

export const ROLE_HOME: Record<Role, string> = {
  admin: '/admin/dashboard',
  coach: '/coach/dashboard',
  student: '/student/dashboard',
};
