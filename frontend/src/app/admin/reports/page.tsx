'use client';

import { useState } from 'react';
import { Alert, Card, EmptyState, PageHeader, Spinner, StatCard } from '@/components/ui';
import Button from '@/components/Button';
import { downloadCsv, errorMessage, useAdminData } from '@/lib/admin/client';

interface Report {
  range: { from: string; to: string };
  students: { active: number; invited: number; deactivated: number; unassignedActive: number; byProgram: { program: string; count: number }[] };
  coaches: { active: number; pending: number; load: { name: string; status: string; studentCount: number; groupCount: number }[] };
  groups: { name: string; memberCount: number }[];
  invitations: { created: number; accepted: number; revoked: number };
  monthlyAccounts: { month: string; coach?: number; student?: number }[];
  tasks: { available: boolean; message: string };
}

const EXPORTS = [
  { type: 'students', label: 'Students' },
  { type: 'coaches', label: 'Coach load' },
  { type: 'groups', label: 'Groups' },
  { type: 'invitations', label: 'Invitations' },
];

export default function ReportsPage() {
  const [draft, setDraft] = useState({ from: '', to: '' });
  const [range, setRange] = useState({ from: '', to: '' });
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);

  const q = new URLSearchParams();
  if (range.from) q.set('from', range.from);
  if (range.to) q.set('to', range.to);
  const qs = q.toString();
  const { data, error, loading } = useAdminData<{ report: Report }>(`/admin/reports${qs ? `?${qs}` : ''}`);
  const report = data?.report;
  const maxMonthly = Math.max(1, ...(report?.monthlyAccounts || []).map((m) => (m.coach || 0) + (m.student || 0)));

  async function exportCsv(type: string) {
    setExporting(type);
    setExportError('');
    try {
      await downloadCsv(`/admin/reports/export?type=${type}${qs ? `&${qs}` : ''}`, `focusbridge-${type}.csv`);
    } catch (e) {
      setExportError(errorMessage(e));
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      <PageHeader title="Reports & analytics" description="Organization-level counts and trends. Aggregates only; no individual rankings." />

      <Card className="mb-6">
        <form className="flex flex-wrap items-end gap-4" onSubmit={(e) => { e.preventDefault(); setRange(draft); }}>
          <div className="flex flex-col gap-1">
            <label htmlFor="from" className="text-sm font-medium text-slate-700">From</label>
            <input id="from" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="to" className="text-sm font-medium text-slate-700">To</label>
            <input id="to" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <Button type="submit">Apply range</Button>
          <button type="button" className="text-sm text-slate-600 hover:underline" onClick={() => { setDraft({ from: '', to: '' }); setRange({ from: '', to: '' }); }}>Last 90 days</button>
        </form>
        {report && <p className="mt-3 text-xs text-slate-500">Showing {report.range.from} to {report.range.to}.</p>}
      </Card>

      {loading && !report && <Spinner label="Loading reports" />}
      {error && <Alert>{error}</Alert>}

      {report && (
        <div className="space-y-6">
          <Card title="Export CSV" action={<span className="text-xs text-slate-500">Uses the same date range</span>}>
            <div className="flex flex-wrap gap-3">
              {EXPORTS.map((e) => (
                <Button key={e.type} disabled={exporting !== null} onClick={() => exportCsv(e.type)} className="bg-slate-700 hover:bg-slate-800">
                  {exporting === e.type ? 'Preparing…' : `Export ${e.label}`}
                </Button>
              ))}
            </div>
            {exportError && <div className="mt-3"><Alert>{exportError}</Alert></div>}
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Active students" value={report.students.active} />
            <StatCard label="Unassigned active students" value={report.students.unassignedActive} />
            <StatCard label="Active coaches" value={report.coaches.active} hint={`${report.coaches.pending} pending approval`} />
            <StatCard label="Invitations sent" value={report.invitations.created} hint={`${report.invitations.accepted} accepted · ${report.invitations.revoked} revoked`} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Students by program">
              {report.students.byProgram.length === 0 ? <EmptyState title="No active students yet" /> : (
                <ul className="space-y-3 text-sm">
                  {report.students.byProgram.map((row) => {
                    const total = report.students.active || 1;
                    return (
                      <li key={row.program}>
                        <div className="flex justify-between"><span>{row.program}</span><span className="text-slate-500">{row.count}</span></div>
                        <div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-brand-500" style={{ width: `${Math.round((row.count / total) * 100)}%` }} /></div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="Accounts created by month">
              {report.monthlyAccounts.length === 0 ? <EmptyState title="No accounts created in this range" /> : (
                <ul className="space-y-3 text-sm">
                  {report.monthlyAccounts.map((m) => {
                    const count = (m.coach || 0) + (m.student || 0);
                    return (
                      <li key={m.month}>
                        <div className="flex justify-between"><span>{m.month}</span><span className="text-slate-500">{m.student || 0} students · {m.coach || 0} coaches</span></div>
                        <div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-green-500" style={{ width: `${Math.round((count / maxMonthly) * 100)}%` }} /></div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="Coach load">
              {report.coaches.load.length === 0 ? <EmptyState title="No coaches yet" /> : (
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Coach</th><th>Status</th><th>Students</th><th>Groups</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.coaches.load.map((c) => (
                      <tr key={c.name}><td className="py-2">{c.name}</td><td>{c.status.replace('_', ' ')}</td><td>{c.studentCount}</td><td>{c.groupCount}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="Groups">
              {report.groups.length === 0 ? <EmptyState title="No groups yet" /> : (
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Group</th><th>Members</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.groups.map((g) => <tr key={g.name}><td className="py-2">{g.name}</td><td>{g.memberCount}</td></tr>)}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card title="Task and completion trends">
            <EmptyState title="Not available yet" body={report.tasks.message} />
          </Card>
        </div>
      )}
    </>
  );
}
