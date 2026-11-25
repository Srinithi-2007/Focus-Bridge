'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiRequest, ApiError, Role, SessionUser } from '@/lib/api';
import { clearSession, logout } from '@/lib/session';
import { Alert, Spinner } from '@/components/ui';

export interface NavItem { href: string; label: string }
type Gate = { state: 'checking' } | { state: 'ok'; user: SessionUser; orgName: string } | { state: 'denied'; message: string };

// Navigation gate for a role workspace. Authentication uses the httpOnly session cookie; the API enforces the role on every request.
export default function WorkspaceShell({ nav, requiredRole, label, children }: { nav: NavItem[]; requiredRole: Role; label: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [gate, setGate] = useState<Gate>({ state: 'checking' });

  useEffect(() => {
    apiRequest<{ user: SessionUser; organization: { name: string } | null }>('/auth/me')
      .then((d) => {
        if (d.user.role !== requiredRole) {
          setGate({ state: 'denied', message: `This workspace is only available to ${requiredRole}s.` });
          return;
        }
        setGate({ state: 'ok', user: d.user, orgName: d.organization?.name || 'Organization' });
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
          router.replace('/login');
          return;
        }
        setGate({ state: 'denied', message: err instanceof Error ? err.message : 'Could not load your session.' });
      });
  }, [router, requiredRole]);

  async function signOut() {
    await logout();
    router.replace('/login');
  }

  if (gate.state === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-transparent">
        <div className="rounded-2xl border border-stone-200/90 bg-[#FCFBF8] p-8 shadow-lg">
          <Spinner label="Checking your session" />
        </div>
      </div>
    );
  }
  if (gate.state === 'denied') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-transparent">
        <div className="mx-auto max-w-md w-full rounded-2xl border border-stone-200/90 bg-[#FCFBF8] p-8 shadow-lg">
          <Alert>{gate.message}</Alert>
          <button type="button" onClick={signOut} className="mt-4 font-medium text-emerald-800 hover:text-emerald-950 hover:underline">
            Sign in with a different account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent lg:flex">
      <aside className="border-b border-stone-200/90 bg-[#FCFBF8] shadow-sm lg:w-64 lg:flex-shrink-0 lg:border-b-0 lg:border-r lg:border-stone-200/90">
        <div className="flex items-center justify-between px-6 py-5">
          <Link href={nav[0].href} className="flex items-center gap-2 font-bold tracking-tight text-emerald-950">
            <span className="text-emerald-700 font-serif">✦</span>
            <span className="text-lg">FocusBridge</span>
          </Link>
          <span className="hidden rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 lg:block">
            {label}
          </span>
        </div>
        <nav aria-label={`${label} navigation`} className="flex gap-1 overflow-x-auto px-4 pb-4 lg:flex-col lg:pb-6">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-emerald-100/80 text-emerald-950 font-semibold border-l-4 border-emerald-800 shadow-xs'
                    : 'text-stone-700 hover:bg-stone-100/80 hover:text-stone-950'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-transparent">
        <header className="flex items-center justify-between border-b border-stone-200/90 bg-[#FCFBF8] px-6 py-4 shadow-xs">
          <p className="text-sm font-medium text-stone-700">{gate.orgName}</p>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-stone-600 sm:inline">
              {gate.user.firstName} {gate.user.lastName}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="font-medium text-emerald-800 hover:text-emerald-950 hover:underline transition-colors"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-transparent">{children}</main>
      </div>
    </div>
  );
}
