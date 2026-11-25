'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Card, EmptyState, formatDate, PageHeader, Spinner, StatCard } from '@/components/ui';
import { adminRequest, errorMessage, useAdminData } from '@/lib/admin/client';

interface Dashboard {
  metrics: Record<string, number>;
  pendingCoaches: { id: string; name: string; email: string; createdAt: string }[];
  openInvitations: { id: string; email: string; role: string; expiresAt: string }[];
  groups: { id: string; name: string; memberCount: number }[];
  recentActivity: { id: string; summary: string; actor: string; createdAt: string }[];
}

const QUICK_ACTIONS = [
  { href: '/admin/students', label: 'Invite student' },
  { href: '/admin/coaches', label: 'Invite coach' },
  { href: '/admin/allocations', label: 'Assign coaches' },
  { href: '/admin/groups', label: 'Create group' },
  { href: '/admin/programs', label: 'Create program' },
  { href: '/admin/reports', label: 'View reports' },
];

export default function AdminDashboardPage() {
  const { data, error, loading, reload } = useAdminData<Dashboard>('/admin/dashboard');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function approve(id: string) {
    setBusyId(id);
    setActionError('');
    try {
      await adminRequest(`/admin/users/${id}/approve`, { method: 'PATCH' });
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader title="Executive overview" description="Organization status, pending approvals and recent activity." />
      {loading && !data && <Spinner label="Loading overview" />}
      {error && <Alert>{error}</Alert>}
      {actionError && <Alert>{actionError}</Alert>}
      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Active students" value={data.metrics.activeStudents} hint={`${data.metrics.invitedStudents} invitation(s) pending`} />
            <StatCard label="Unassigned students" value={data.metrics.unassignedStudents} hint="Active students without a coach" />
            <StatCard label="Active coaches" value={data.metrics.activeCoaches} hint={`${data.metrics.pendingCoaches} awaiting approval`} />
            <StatCard label="Groups & programs" value={`${data.metrics.groupCount} / ${data.metrics.programCount}`} hint="Classrooms and coaching programs" />
          </div>

          <Card title="Quick actions">
            <div className="flex flex-wrap gap-3">
              {QUICK_ACTIONS.map((a) => (
                <Link key={a.href + a.label} href={a.href} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {a.label}
                </Link>
              ))}
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title={`Coaches awaiting approval (${data.pendingCoaches.length})`}>
              {data.pendingCoaches.length === 0 ? (
                <EmptyState title="No coaches are waiting for approval" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.pendingCoaches.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-sm text-slate-500">{c.email}</p>
                      </div>
                      <button type="button" disabled={busyId === c.id} onClick={() => approve(c.id)} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                        {busyId === c.id ? 'Approving…' : 'Approve'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title={`Open invitations (${data.metrics.openInvitations})`} action={<Link href="/admin/students" className="text-sm text-brand-600 hover:underline">Manage</Link>}>
              {data.openInvitations.length === 0 ? (
                <EmptyState title="No open invitations" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.openInvitations.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <span className="truncate">{i.email}</span>
                      <span className="whitespace-nowrap text-slate-500">{i.role} · expires {formatDate(i.expiresAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Groups" action={<Link href="/admin/groups" className="text-sm text-brand-600 hover:underline">All groups</Link>}>
              {data.groups.length === 0 ? (
                <EmptyState title="No groups yet" body="Create a group to bring students together with a coach." />
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {data.groups.map((g) => (
                    <li key={g.id} className="flex justify-between py-2"><span>{g.name}</span><span className="text-slate-500">{g.memberCount} members</span></li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Recent activity">
              {data.recentActivity.length === 0 ? (
                <EmptyState title="No activity yet" body="Administrative actions will appear here." />
              ) : (
                <ol className="space-y-3 text-sm">
                  {data.recentActivity.map((a) => (
                    <li key={a.id} className="flex flex-col">
                      <span className="text-slate-800">{a.summary}</span>
                      <span className="text-xs text-slate-500">{a.actor} · {formatDate(a.createdAt)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
