'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Card, EmptyState, PageHeader, Spinner, StatCard, formatDate } from '@/components/ui';
import { fmt, fmtDay, fmtTime } from '@/components/student/shared';
import { errorMessage, useWorkspaceData, workspaceRequest } from '@/lib/workspace/client';

interface Dash {
  today: { tasks: { id: string; title: string; deadline: string | null; priority: string }[]; blocks: { id: string; title: string; start: string; end: string; done: boolean }[] };
  deadlines: { id: string; title: string; deadline: string }[];
  dueSoonCount: number;
  progress: { assigned: number; submitted: number; completionPct: number | null };
  coach: { name: string } | null;
  groups: { id: string; name: string }[];
  unreadNotifications: number;
}

export default function StudentDashboardPage() {
  const { data, error, loading, reload } = useWorkspaceData<Dash>('/me/dashboard');
  const [actionError, setActionError] = useState('');

  async function toggleBlock(id: string, done: boolean) {
    setActionError('');
    try {
      await workspaceRequest(`/me/calendar/events/${id}`, { method: 'PATCH', body: { done } });
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader title="Your day" description="Today's tasks and work blocks, your next deadlines and progress." />
      {loading && !data && <Spinner label="Loading your dashboard" />}
      {error && <Alert>{error}</Alert>}
      {actionError && <div className="mb-4"><Alert>{actionError}</Alert></div>}
      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Overall progress" value={data.progress.completionPct === null ? '—' : `${data.progress.completionPct}%`} hint={`${data.progress.submitted} of ${data.progress.assigned} tasks submitted`} />
            <StatCard label="Due in 48 hours" value={data.dueSoonCount} />
            <StatCard label="Unread notifications" value={data.unreadNotifications} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Today's tasks" action={<Link href="/student/tasks" className="text-sm text-brand-600 hover:underline">All tasks</Link>}>
              {data.today.tasks.length === 0 ? <EmptyState title="Nothing due today" body="Open Tasks to see everything assigned to you." /> : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {data.today.tasks.map((t) => <li key={t.id} className="flex justify-between py-2"><span className="font-medium">{t.title}</span><span className="text-slate-500">{t.deadline ? `Due ${fmt(t.deadline)}` : 'No deadline'}</span></li>)}
                </ul>
              )}
            </Card>

            <Card title="Work blocks today" action={<Link href="/student/calendar" className="text-sm text-brand-600 hover:underline">Calendar</Link>}>
              {data.today.blocks.length === 0 ? <EmptyState title="No work blocks today" body="Approve a plan in Tasks to add blocks here." /> : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {data.today.blocks.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                      <div><p className={`font-medium ${b.done ? 'line-through text-slate-400' : ''}`}>{b.title}</p><p className="text-slate-500">{fmtTime(b.start)} – {fmtTime(b.end)}</p></div>
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={b.done} onChange={(e) => toggleBlock(b.id, e.target.checked)} className="h-4 w-4" />Done</label>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Upcoming deadlines">
              {data.deadlines.length === 0 ? <EmptyState title="No open deadlines" /> : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {data.deadlines.map((d) => <li key={d.id} className="flex justify-between py-2"><span>{d.title}</span><span className="text-slate-500">{formatDate(d.deadline)}</span></li>)}
                </ul>
              )}
            </Card>

            <Card title="Your coach and groups">
              <p className="text-sm">{data.coach ? <>Coach: <span className="font-medium">{data.coach.name}</span> · <Link href="/student/coach" className="text-brand-600 hover:underline">Message</Link></> : 'No coach assigned yet.'}</p>
              <ul className="mt-3 space-y-1 text-sm">
                {data.groups.map((g) => <li key={g.id}><Link href={`/student/groups?group=${g.id}`} className="text-brand-600 hover:underline">{g.name}</Link></li>)}
              </ul>
              {data.groups.length === 0 && <p className="mt-2 text-sm text-slate-500">You are not in a group yet.</p>}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
