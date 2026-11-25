'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Card, EmptyState, PageHeader, SelectField, Spinner, formatDate } from '@/components/ui';
import { ProgressBar } from '@/components/coach/shared';
import { useWorkspaceData } from '@/lib/workspace/client';

interface Row { id: string; name: string; email: string; groups: { id: string; name: string }[]; openTasks: number; overdueTasks: number; completionPct: number | null; lastReviewAt: string | null; reviewDue: boolean; programName: string | null }
interface Page { total: number; page: number; limit: number; students: Row[] }

const PAGE_SIZE = 20;

export default function CoachStudentsPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [groupId, setGroupId] = useState('');
  const [needsReview, setNeedsReview] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const q = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (debounced) q.set('search', debounced);
  if (groupId) q.set('groupId', groupId);
  if (needsReview) q.set('needsReview', needsReview);
  const students = useWorkspaceData<Page>(`/coach/students?${q.toString()}`);
  const groups = useWorkspaceData<{ groups: { id: string; name: string }[] }>('/coach/groups');
  const totalPages = Math.max(1, Math.ceil((students.data?.total || 0) / PAGE_SIZE));

  return (
    <>
      <PageHeader title="My students" description="Students allocated to you. Open a profile for tasks, progress, reviews and private notes." />
      <Card>
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <div className="flex flex-col gap-1 md:col-span-2">
            <label htmlFor="s-search" className="text-sm font-medium text-slate-700">Search</label>
            <input id="s-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <SelectField label="Group" value={groupId} onChange={(v) => { setGroupId(v); setPage(1); }} options={[{ value: '', label: 'All my students' }, ...(groups.data?.groups || []).map((g) => ({ value: g.id, label: g.name }))]} />
          <SelectField label="Review status" value={needsReview} onChange={(v) => { setNeedsReview(v); setPage(1); }} options={[{ value: '', label: 'Any' }, { value: 'true', label: 'Review due' }, { value: 'false', label: 'Review up to date' }]} />
        </div>

        {students.loading && !students.data && <Spinner label="Loading students" />}
        {students.error && <Alert>{students.error}</Alert>}
        {students.data && students.data.students.length === 0 && <EmptyState title="No students match" body="Students appear here once an administrator allocates them to you." />}
        {students.data && students.data.students.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">Student</th><th className="px-3 py-2">Groups</th><th className="px-3 py-2">Open</th><th className="px-3 py-2">Progress</th><th className="px-3 py-2">Last review</th><th className="px-3 py-2"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.data.students.map((s) => (
                  <tr key={s.id} className="align-top">
                    <td className="px-3 py-3"><p className="font-medium">{s.name}</p><p className="text-slate-500">{s.email}</p>{s.programName && <p className="text-xs text-slate-500">{s.programName}</p>}</td>
                    <td className="px-3 py-3">{s.groups.length ? s.groups.map((g) => g.name).join(', ') : <span className="text-slate-400">None</span>}</td>
                    <td className="px-3 py-3">{s.openTasks}{s.overdueTasks > 0 && <span className="ml-2 text-xs text-red-600">{s.overdueTasks} overdue</span>}</td>
                    <td className="px-3 py-3 w-40"><ProgressBar value={s.completionPct} /></td>
                    <td className="px-3 py-3">{formatDate(s.lastReviewAt)}{s.reviewDue && <span className="block text-xs text-amber-700">Review due</span>}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <Link href={`/coach/students/${s.id}`} className="mr-3 font-medium text-brand-600 hover:underline">Profile</Link>
                      <Link href={`/coach/tasks?student=${s.id}&new=1`} className="mr-3 font-medium text-brand-600 hover:underline">Assign task</Link>
                      <Link href={`/coach/reviews?student=${s.id}`} className="font-medium text-brand-600 hover:underline">Review</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
              <span>Page {page} of {totalPages} · {students.data.total} students</span>
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
