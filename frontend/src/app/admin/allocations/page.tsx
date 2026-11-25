'use client';

import { useMemo, useState } from 'react';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { adminRequest, errorMessage, useAdminData } from '@/lib/admin/client';

interface Allocations {
  coaches: { id: string; name: string; status: string; studentCount: number }[];
  students: {
    id: string;
    name: string;
    email: string;
    status: string;
    coach: { id: string; name: string; status: string } | null;
  }[];
}

export default function AllocationsPage() {
  const { data, error, loading, reload } = useAdminData<Allocations>('/admin/allocations');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const activeCoaches = useMemo(() => (data?.coaches || []).filter((c) => c.status === 'active'), [data]);
  const unassignedCount = useMemo(() => (data?.students || []).filter((s) => s.status === 'active' && !s.coach).length, [data]);

  const rows = useMemo(() => {
    const list = data?.students || [];
    return unassignedOnly ? list.filter((s) => !s.coach) : list;
  }, [data, unassignedOnly]);

  function currentValue(s: Allocations['students'][number]) {
    return drafts[s.id] !== undefined ? drafts[s.id] : s.coach?.id || '';
  }

  async function save(studentId: string, value: string) {
    setBusy(studentId);
    setRowError((r) => ({ ...r, [studentId]: '' }));
    setNotice('');
    try {
      await adminRequest(`/admin/students/${studentId}/coach`, { method: 'PUT', body: { coachId: value || null } });
      setDrafts((d) => {
        const next = { ...d };
        delete next[studentId];
        return next;
      });
      setNotice('Allocation saved.');
      reload();
    } catch (e) {
      setRowError((r) => ({ ...r, [studentId]: errorMessage(e) }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Coach allocation" description="Assign each student to an active coach. Changes take effect immediately and are recorded in activity." />
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
      {loading && !data && <Spinner label="Loading allocations" />}
      {error && <Alert>{error}</Alert>}

      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-sm text-slate-500">Active coaches</p>
              <p className="mt-1 text-2xl font-bold">{activeCoaches.length}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Unassigned active students</p>
              <p className="mt-1 text-2xl font-bold">{unassignedCount}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Students with an inactive coach</p>
              <p className="mt-1 text-2xl font-bold">{data.students.filter((s) => s.coach && s.coach.status !== 'active').length}</p>
            </Card>
          </div>

          <Card
            title="Student–coach relationships"
            action={
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} className="h-4 w-4" />
                Show unassigned only
              </label>
            }
          >
            {rows.length === 0 ? (
              <EmptyState title={unassignedOnly ? 'Every student has a coach' : 'No students yet'} body={unassignedOnly ? undefined : 'Invite students first, then allocate coaches here.'} />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Student</th>
                      <th className="px-3 py-2">Current coach</th>
                      <th className="px-3 py-2">Change coach</th>
                      <th className="px-3 py-2"><span className="sr-only">Save</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((s) => {
                      const canEdit = s.status === 'active';
                      const value = currentValue(s);
                      const dirty = value !== (s.coach?.id || '');
                      return (
                        <tr key={s.id} className="align-top">
                          <td className="px-3 py-3">
                            <p className="font-medium">{s.name}</p>
                            <p className="text-slate-500">{s.email}</p>
                            {!canEdit && <p className="mt-1 text-xs text-amber-700">Activate this student before allocating a coach.</p>}
                          </td>
                          <td className="px-3 py-3">
                            {s.coach ? (
                              <span className="flex items-center gap-2">
                                {s.coach.name}
                                {s.coach.status !== 'active' && <Badge tone="amber">Coach inactive</Badge>}
                              </span>
                            ) : (
                              <span className="text-slate-400">Unassigned</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <label htmlFor={`coach-${s.id}`} className="sr-only">Coach for {s.name}</label>
                            <select
                              id={`coach-${s.id}`}
                              disabled={!canEdit || busy === s.id}
                              value={value}
                              onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 sm:w-64"
                            >
                              <option value="">Unassigned</option>
                              {s.coach && s.coach.status !== 'active' && <option value={s.coach.id}>{s.coach.name} (inactive)</option>}
                              {activeCoaches.map((c) => (
                                <option key={c.id} value={c.id}>{c.name} · {c.studentCount} students</option>
                              ))}
                            </select>
                            {rowError[s.id] && <p role="alert" className="mt-2 text-sm text-red-600">{rowError[s.id]}</p>}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {dirty && (
                              <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setDrafts((d) => { const n = { ...d }; delete n[s.id]; return n; })} className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Reset</button>
                                <button type="button" disabled={busy === s.id} onClick={() => save(s.id, value)} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                                  {busy === s.id ? 'Saving…' : 'Save'}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <p className="text-xs text-slate-500">Only approved, active coaches appear in the list. Inactive coaches stay visible on existing students so you can reassign them.</p>
        </div>
      )}
    </>
  );
}
