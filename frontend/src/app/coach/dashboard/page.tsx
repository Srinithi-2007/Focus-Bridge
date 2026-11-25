'use client';

import Link from 'next/link';
import { Alert, Card, EmptyState, PageHeader, Spinner, StatCard, formatDate } from '@/components/ui';
import { ProgressBar } from '@/components/coach/shared';
import { formatDateTime } from '@/lib/coach/format';
import { useWorkspaceData } from '@/lib/workspace/client';

interface Dashboard {
  metrics: { assignedStudents: number; groups: number; openTasks: number; pendingFeedback: number; reviewsDue: number };
  roster: { id: string; name: string; status: string; openTasks: number; overdueTasks: number; completionPct: number | null; lastReviewAt: string | null; reviewDue: boolean }[];
  upcomingActivities: { id: string; title: string; startsAt: string; location: string; groupName: string }[];
  recentActivity: { id: string; summary: string; createdAt: string }[];
}

const QUICK = [
  { href: '/coach/tasks?new=1', label: 'New task' },
  { href: '/coach/reviews', label: 'Write a review' },
  { href: '/coach/activities?new=1', label: 'Schedule activity' },
  { href: '/coach/groups', label: 'Open classroom' },
];

export default function CoachDashboardPage() {
  const { data, error, loading } = useWorkspaceData<Dashboard>('/coach/dashboard');

  return (
    <>
      <PageHeader title="Coach overview" description="Your students, groups, open work and upcoming sessions." />
      {loading && !data && <Spinner label="Loading overview" />}
      {error && <Alert>{error}</Alert>}
      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Assigned students" value={data.metrics.assignedStudents} />
            <StatCard label="Groups" value={data.metrics.groups} />
            <StatCard label="Open tasks" value={data.metrics.openTasks} hint="Published, not yet submitted" />
            <StatCard label="Awaiting feedback" value={data.metrics.pendingFeedback} />
            <StatCard label="Reviews due" value={data.metrics.reviewsDue} hint="No submitted review in 30 days" />
          </div>

          <Card title="Quick actions">
            <div className="flex flex-wrap gap-3">
              {QUICK.map((q) => (
                <Link key={q.href} href={q.href} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{q.label}</Link>
              ))}
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card title="Student roster" className="xl:col-span-2" action={<Link href="/coach/students" className="text-sm text-brand-600 hover:underline">All students</Link>}>
              {data.roster.length === 0 ? (
                <EmptyState title="No students allocated yet" body="An administrator allocates students to you." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Student</th><th>Open</th><th>Overdue</th><th>Progress</th><th>Last review</th><th /></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.roster.map((s) => (
                        <tr key={s.id}>
                          <td className="py-2 font-medium">{s.name}{s.reviewDue && <span className="ml-2 text-xs text-amber-700">review due</span>}</td>
                          <td>{s.openTasks}</td>
                          <td>{s.overdueTasks}</td>
                          <td className="w-40"><ProgressBar value={s.completionPct} /></td>
                          <td>{formatDate(s.lastReviewAt)}</td>
                          <td className="text-right whitespace-nowrap"><Link href={`/coach/students/${s.id}`} className="text-brand-600 hover:underline">Open</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <div className="space-y-6">
              <Card title="Upcoming activities" action={<Link href="/coach/activities" className="text-sm text-brand-600 hover:underline">Schedule</Link>}>
                {data.upcomingActivities.length === 0 ? <EmptyState title="Nothing scheduled" /> : (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {data.upcomingActivities.map((a) => (
                      <li key={a.id} className="py-2"><p className="font-medium">{a.title}</p><p className="text-slate-500">{a.groupName} · {formatDateTime(a.startsAt)}{a.location ? ` · ${a.location}` : ''}</p></li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Recent activity">
                {data.recentActivity.length === 0 ? <EmptyState title="No activity yet" /> : (
                  <ol className="space-y-3 text-sm">
                    {data.recentActivity.map((a) => <li key={a.id}><span>{a.summary}</span><span className="block text-xs text-slate-500">{formatDateTime(a.createdAt)}</span></li>)}
                  </ol>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
