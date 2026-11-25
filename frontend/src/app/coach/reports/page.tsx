'use client';

import { useState } from 'react';
import { Alert, Card, EmptyState, PageHeader, SelectField, Spinner, StatCard } from '@/components/ui';
import Button from '@/components/Button';
import { ProgressBar } from '@/components/coach/shared';
import { downloadCsv, errorMessage, useWorkspaceData } from '@/lib/workspace/client';

interface Report {
  range: { from: string; to: string };
  group: { id: string; name: string } | null;
  students: { id: string; name: string; assignedCount: number; submittedCount: number; openCount: number; overdueCount: number; completionPct: number | null; reviewsSubmittedInRange: number }[];
  groups: { id: string; name: string; memberCount: number }[];
  activities: { completed: number; scheduled: number; cancelled: number };
  weeklySubmissions: { week: string; count: number }[];
  summary: { students: number; reviewsSubmitted: number };
}

export default function CoachReportsPage() {
  const [draft, setDraft] = useState({ from: '', to: '', groupId: '' });
  const [applied, setApplied] = useState({ from: '', to: '', groupId: '' });
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState('');

  const q = new URLSearchParams();
  if (applied.from) q.set('from', applied.from);
  if (applied.to) q.set('to', applied.to);
  if (applied.groupId) q.set('groupId', applied.groupId);
  const qs = q.toString();
  const { data, error, loading } = useWorkspaceData<{ report: Report }>(`/coach/reports${qs ? `?${qs}` : ''}`);
  const groups = useWorkspaceData<{ groups: { id: string; name: string }[] }>('/coach/groups');
  const report = data?.report;
  const maxWeek = Math.max(1, ...(report?.weeklySubmissions || []).map((w) => w.count));

  async function exportCsv(type: string) {
    setExporting(type);
    setExportError('');
    try {
      await downloadCsv(`/coach/reports/export?type=${type}${qs ? `&${qs}` : ''}`, `coach-${type}.csv`);
    } catch (e) {
      setExportError(errorMessage(e));
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      <PageHeader title="Progress & reports" description="Progress for your allocated students and groups. Shown as totals and completion rates; students are listed by name, not ranked." />

      <Card className="mb-6">
        <form className="flex flex-wrap items-end gap-4" onSubmit={(e) => { e.preventDefault(); setApplied(draft); }}>
          <div className="flex flex-col gap-1"><label htmlFor="r-from" className="text-sm font-medium text-slate-700">From</label><input id="r-from" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" /></div>
          <div className="flex flex-col gap-1"><label htmlFor="r-to" className="text-sm font-medium text-slate-700">To</label><input id="r-to" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" /></div>
          <div className="w-56"><SelectField label="Group" value={draft.groupId} onChange={(v) => setDraft({ ...draft, groupId: v })} options={[{ value: '', label: 'All my students' }, ...(groups.data?.groups || []).map((g) => ({ value: g.id, label: g.name }))]} /></div>
          <Button type="submit">Apply</Button>
          <button type="button" className="text-sm text-slate-600 hover:underline" onClick={() => { const empty = { from: '', to: '', groupId: '' }; setDraft(empty); setApplied(empty); }}>Reset</button>
        </form>
        {report && <p className="mt-3 text-xs text-slate-500">Range {report.range.from} to {report.range.to}{report.group ? ` · ${report.group.name}` : ''}.</p>}
      </Card>

      {loading && !report && <Spinner label="Loading reports" />}
      {error && <Alert>{error}</Alert>}

      {report && (
        <div className="space-y-6">
          <Card title="Export CSV" action={<span className="text-xs text-slate-500">Uses the same filters</span>}>
            <div className="flex flex-wrap gap-3">
              {[{ t: 'students', l: 'Student progress' }, { t: 'groups', l: 'Groups' }, { t: 'activities', l: 'Activities' }].map((x) => (
                <Button key={x.t} disabled={exporting !== null} onClick={() => exportCsv(x.t)} className="bg-slate-700 hover:bg-slate-800">{exporting === x.t ? 'Preparing…' : `Export ${x.l}`}</Button>
              ))}
            </div>
            {exportError && <div className="mt-3"><Alert>{exportError}</Alert></div>}
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Students" value={report.summary.students} />
            <StatCard label="Reviews submitted" value={report.summary.reviewsSubmitted} hint="In the selected range" />
            <StatCard label="Activities completed" value={report.activities.completed} hint={`${report.activities.scheduled} scheduled · ${report.activities.cancelled} cancelled`} />
            <StatCard label="Groups" value={report.groups.length} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Submissions per week">
              {report.weeklySubmissions.length === 0 ? <EmptyState title="No submissions in this range" /> : (
                <ul className="space-y-3 text-sm">
                  {report.weeklySubmissions.map((w) => (
                    <li key={w.week}>
                      <div className="flex justify-between"><span>{w.week}</span><span className="text-slate-500">{w.count}</span></div>
                      <div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-brand-500" style={{ width: `${Math.round((w.count / maxWeek) * 100)}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Groups">
              {report.groups.length === 0 ? <EmptyState title="No groups assigned" /> : (
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Group</th><th>Members</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{report.groups.map((g) => <tr key={g.id}><td className="py-2">{g.name}</td><td>{g.memberCount}</td></tr>)}</tbody>
                </table>
              )}
            </Card>
          </div>

          <Card title="Student progress">
            {report.students.length === 0 ? <EmptyState title="No students in this view" /> : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Student</th><th>Assigned</th><th>Submitted</th><th>Open</th><th>Overdue</th><th className="w-40">Completion</th><th>Reviews in range</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.students.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 font-medium">{s.name}</td>
                        <td>{s.assignedCount}</td>
                        <td>{s.submittedCount}</td>
                        <td>{s.openCount}</td>
                        <td className={s.overdueCount ? 'text-red-600' : ''}>{s.overdueCount}</td>
                        <td><ProgressBar value={s.completionPct} /></td>
                        <td>{s.reviewsSubmittedInRange}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
