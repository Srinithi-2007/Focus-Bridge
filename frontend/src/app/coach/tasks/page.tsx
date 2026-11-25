'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Badge, Card, EmptyState, Modal, PageHeader, SelectField, Spinner, formatDate } from '@/components/ui';
import Button from '@/components/Button';
import Field from '@/components/Field';
import { FeedbackModal, TaskStateBadge } from '@/components/coach/shared';
import { formatDateTime, toIsoOrNull, toLocalInput } from '@/lib/coach/format';
import { errorMessage, useWorkspaceData, workspaceRequest } from '@/lib/workspace/client';

interface TaskRow {
  id: string; title: string; instructions: string; priority: string; deadline: string | null; audience: 'student' | 'group';
  target: { type: string; id: string; name: string } | null; status: 'draft' | 'published' | 'archived'; attachments: { name: string; url: string }[];
  publishedAt: string | null; originalInstructions: string | null; originalDeadline: string | null; revisionCount: number; lastEditedAt: string | null;
  assigneeCount: number; submittedCount: number; reviewedCount: number;
}
interface Assignee { studentId: string; name: string; email: string; state: 'not_started' | 'submitted' | 'reviewed' | 'overdue'; submission: { id: string; body: string; attachments: { name: string; url: string }[]; submittedAt: string; late: boolean; attempts: number; feedback: string; status: string } | null }
interface TaskDetail { task: TaskRow; assignees: Assignee[]; hiddenAssigneeCount: number }
interface StudentOption { id: string; name: string; status: string }
interface GroupOption { id: string; name: string }

export default function CoachTasksPage() {
  return <Suspense fallback={<Spinner label="Loading tasks" />}><TasksInner /></Suspense>;
}

function TasksInner() {
  const params = useSearchParams();
  const [status, setStatus] = useState('');
  const [groupFilter] = useState(params.get('group') || '');
  const [editor, setEditor] = useState<{ task: TaskRow | null; studentId?: string; groupId?: string } | null>(
    params.get('new') ? { task: null, studentId: params.get('student') || undefined, groupId: params.get('group') || undefined } : null
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const q = new URLSearchParams();
  if (status) q.set('status', status);
  if (groupFilter) q.set('groupId', groupFilter);
  const tasks = useWorkspaceData<{ tasks: TaskRow[] }>(`/coach/tasks?${q.toString()}`);
  const detail = useWorkspaceData<TaskDetail>(selectedId ? `/coach/tasks/${selectedId}` : null);
  const students = useWorkspaceData<{ students: StudentOption[] }>('/coach/students?limit=100');
  const groups = useWorkspaceData<{ groups: GroupOption[] }>('/coach/groups');

  function changed(msg: string) {
    setNotice(msg);
    setError('');
    tasks.reload();
    detail.reload();
  }

  async function act(fn: () => Promise<unknown>, msg: string) {
    setError('');
    try {
      await fn();
      changed(msg);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader title="Tasks & assignments" description="Draft, publish and track tasks for individual students or groups. Published instructions and deadlines are preserved with their revision history."
        action={<Button onClick={() => setEditor({ task: null })}>New task</Button>} />
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <Card>
        <div className="mb-4 max-w-xs">
          <SelectField label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'All tasks' }, { value: 'draft', label: 'Drafts' }, { value: 'published', label: 'Published' }, { value: 'archived', label: 'Archived' }]} />
        </div>
        {tasks.loading && !tasks.data && <Spinner label="Loading tasks" />}
        {tasks.error && <Alert>{tasks.error}</Alert>}
        {tasks.data && tasks.data.tasks.length === 0 && <EmptyState title="No tasks yet" body="Create a task for a student or a group." action={<Button onClick={() => setEditor({ task: null })}>Create task</Button>} />}
        {tasks.data && tasks.data.tasks.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">Task</th><th className="px-3 py-2">For</th><th className="px-3 py-2">Deadline</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Submitted</th><th className="px-3 py-2"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.data.tasks.map((t) => (
                  <tr key={t.id} className={selectedId === t.id ? 'bg-brand-50/40' : ''}>
                    <td className="px-3 py-3"><p className="font-medium">{t.title}</p><p className="text-xs text-slate-500">Priority: {t.priority}{t.revisionCount ? ` · ${t.revisionCount} revision${t.revisionCount > 1 ? 's' : ''}` : ''}</p></td>
                    <td className="px-3 py-3">{t.target ? <>{t.target.name}<span className="block text-xs text-slate-500">{t.audience === 'group' ? 'Group' : 'Student'}</span></> : '—'}</td>
                    <td className="px-3 py-3">{formatDate(t.deadline)}</td>
                    <td className="px-3 py-3"><Badge tone={t.status === 'published' ? 'green' : t.status === 'draft' ? 'slate' : 'amber'}>{t.status}</Badge></td>
                    <td className="px-3 py-3">{t.status === 'draft' ? '—' : `${t.submittedCount} of ${t.assigneeCount}`}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => setSelectedId(t.id)} className="mr-3 font-medium text-brand-600 hover:underline">View</button>
                      {t.status !== 'archived' && <button type="button" onClick={() => setEditor({ task: t })} className="mr-3 font-medium text-brand-600 hover:underline">Edit</button>}
                      {t.status === 'draft' && <button type="button" onClick={() => act(() => workspaceRequest(`/coach/tasks/${t.id}/publish`, { method: 'POST' }), `"${t.title}" published.`)} className="mr-3 font-medium text-green-700 hover:underline">Publish</button>}
                      {t.status === 'published' && <button type="button" onClick={() => { if (window.confirm('Archive this task? Students keep their submissions, but no new submissions are accepted.')) act(() => workspaceRequest(`/coach/tasks/${t.id}/archive`, { method: 'POST' }), `"${t.title}" archived.`); }} className="mr-3 font-medium text-amber-700 hover:underline">Archive</button>}
                      {t.status === 'draft' && <button type="button" onClick={() => { if (window.confirm('Delete this draft?')) act(() => workspaceRequest(`/coach/tasks/${t.id}`, { method: 'DELETE' }), 'Draft deleted.'); }} className="font-medium text-red-600 hover:underline">Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedId && (
        <div className="mt-6">
          <TaskPanel
            id={selectedId}
            detail={detail.data}
            loading={detail.loading}
            error={detail.error}
            onClose={() => setSelectedId(null)}
            onFeedback={setFeedbackId}
          />
        </div>
      )}

      <TaskEditor
        value={editor}
        students={students.data?.students || []}
        groups={groups.data?.groups || []}
        onClose={() => setEditor(null)}
        onSaved={(msg) => { setEditor(null); changed(msg); }}
      />
      <FeedbackModal submissionId={feedbackId} onClose={() => setFeedbackId(null)} onSaved={() => { setFeedbackId(null); changed('Feedback saved. The student can see it.'); }} />
    </>
  );
}

function TaskPanel({ id, detail, loading, error, onClose, onFeedback }: { id: string; detail: TaskDetail | null; loading: boolean; error: string; onClose: () => void; onFeedback: (subId: string) => void }) {
  if (loading && !detail) return <Spinner label="Loading task" />;
  if (error) return <Alert>{error}</Alert>;
  if (!detail) return null;
  const t = detail.task;
  return (
    <Card title={t.title} action={<button type="button" onClick={onClose} className="text-sm text-slate-600 hover:underline">Close</button>}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Instructions (as published)</p>
            <p className="mt-1 whitespace-pre-wrap">{t.originalInstructions || t.instructions || '—'}</p>
            <p className="mt-2 text-xs text-slate-500">Original deadline: {formatDateTime(t.originalDeadline)}</p>
          </div>
          {t.revisionCount > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase text-amber-800">Current version · {t.revisionCount} revision{t.revisionCount > 1 ? 's' : ''}</p>
              <p className="mt-1 whitespace-pre-wrap">{t.instructions}</p>
              <p className="mt-2 text-xs text-amber-900">Current deadline: {formatDateTime(t.deadline)} · last edited {formatDateTime(t.lastEditedAt)}</p>
            </div>
          )}
          {t.attachments.length > 0 && (
            <ul className="space-y-1">{t.attachments.map((a) => <li key={a.url}><a href={a.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">{a.name}</a></li>)}</ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Assignees</p>
          {detail.assignees.length === 0 && <p className="text-sm text-slate-500">No allocated students in this assignment.</p>}
          <ul className="divide-y divide-slate-100 text-sm">
            {detail.assignees.map((a) => (
              <li key={a.studentId} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{a.name}</span>
                  <TaskStateBadge state={a.state} />
                </div>
                {a.submission && (
                  <div className="mt-2 rounded bg-slate-50 p-2">
                    <p className="text-xs text-slate-500">Submitted {formatDateTime(a.submission.submittedAt)}{a.submission.late ? ' · late' : ''}{a.submission.attempts > 1 ? ` · attempt ${a.submission.attempts}` : ''}</p>
                    {a.submission.body && <p className="mt-1 whitespace-pre-wrap">{a.submission.body}</p>}
                    {a.submission.attachments.map((x) => <a key={x.url} href={x.url} target="_blank" rel="noopener noreferrer" className="block text-brand-600 hover:underline">{x.name}</a>)}
                    <button type="button" onClick={() => onFeedback(a.submission!.id)} className="mt-2 text-sm font-medium text-brand-600 hover:underline">{a.submission.feedback ? 'Edit feedback' : 'Give feedback'}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {detail.hiddenAssigneeCount > 0 && <p className="mt-3 text-xs text-slate-500">{detail.hiddenAssigneeCount} other group member(s) are not allocated to you and are not shown.</p>}
        </div>
      </div>
      <p className="sr-only">Task {id}</p>
    </Card>
  );
}

function TaskEditor({ value, students, groups, onClose, onSaved }: {
  value: { task: TaskRow | null; studentId?: string; groupId?: string } | null;
  students: StudentOption[]; groups: GroupOption[]; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const open = value !== null;
  const editing = value?.task ?? null;
  const locked = editing?.status === 'published';
  const [form, setForm] = useState({ title: '', instructions: '', priority: 'medium', deadline: '', audience: 'student' as 'student' | 'group', studentId: '', groupId: '' });
  const [attachments, setAttachments] = useState<{ name: string; url: string }[]>([]);
  const [attName, setAttName] = useState('');
  const [attUrl, setAttUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!value) return;
    setError('');
    if (value.task) {
      const t = value.task;
      setForm({ title: t.title, instructions: t.instructions, priority: t.priority, deadline: toLocalInput(t.deadline), audience: t.audience, studentId: t.audience === 'student' && t.target ? t.target.id : '', groupId: t.audience === 'group' && t.target ? t.target.id : '' });
      setAttachments(t.attachments);
    } else {
      setForm({ title: '', instructions: '', priority: 'medium', deadline: '', audience: value.groupId ? 'group' : 'student', studentId: value.studentId || '', groupId: value.groupId || '' });
      setAttachments([]);
    }
  }, [value]);

  function addAttachment() {
    if (!attName.trim() || !/^https?:\/\//i.test(attUrl.trim())) return setError('Attachments need a name and an http:// or https:// link.');
    setAttachments([...attachments, { name: attName.trim(), url: attUrl.trim() }]);
    setAttName('');
    setAttUrl('');
    setError('');
  }

  function body(publish: boolean) {
    const base = { title: form.title.trim(), instructions: form.instructions.trim(), priority: form.priority, deadline: toIsoOrNull(form.deadline), attachments };
    if (locked) return base;
    return { ...base, audience: form.audience, studentId: form.audience === 'student' ? form.studentId || null : null, groupId: form.audience === 'group' ? form.groupId || null : null, ...(editing ? {} : { publish }) };
  }

  async function submit(publish: boolean) {
    setBusy(true);
    setError('');
    try {
      if (!editing) {
        const res = await workspaceRequest<{ task: TaskRow }>('/coach/tasks', { method: 'POST', body: body(publish) });
        onSaved(publish ? `"${res.task.title}" published.` : `Draft "${res.task.title}" saved.`);
      } else {
        await workspaceRequest(`/coach/tasks/${editing.id}`, { method: 'PATCH', body: body(false) });
        if (publish && editing.status === 'draft') await workspaceRequest(`/coach/tasks/${editing.id}/publish`, { method: 'POST' });
        onSaved(publish ? `"${form.title}" published.` : locked ? 'Revision saved. The change is recorded.' : 'Draft saved.');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function onFormSubmit(e: FormEvent) {
    e.preventDefault();
    submit(false);
  }

  return (
    <Modal open={open} title={editing ? (locked ? 'Revise published task' : 'Edit draft') : 'New task'} onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <Button type="button" disabled={busy || !form.title.trim()} onClick={() => submit(false)} className="bg-slate-700 hover:bg-slate-800">{locked ? 'Save revision' : 'Save draft'}</Button>
          {!locked && <Button type="button" disabled={busy || !form.title.trim()} onClick={() => submit(true)}>{busy ? 'Working…' : 'Publish'}</Button>}
        </>
      }>
      <form id="task-form" onSubmit={onFormSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        {locked && <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">This task is published. You can revise its instructions, deadline, priority and attachments; the original version is kept and each change is recorded. Audience is fixed.</p>}
        <Field label="Title" required minLength={3} maxLength={150} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <fieldset className="space-y-2" disabled={locked}>
          <legend className="text-sm font-medium text-slate-700">Assign to</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="audience" checked={form.audience === 'student'} onChange={() => setForm({ ...form, audience: 'student' })} /> Individual student</label>
            <label className="flex items-center gap-2"><input type="radio" name="audience" checked={form.audience === 'group'} onChange={() => setForm({ ...form, audience: 'group' })} /> Group</label>
          </div>
          {form.audience === 'student' ? (
            <SelectField label="Student" value={form.studentId} onChange={(v) => setForm({ ...form, studentId: v })} options={[{ value: '', label: 'Choose a student' }, ...students.map((s) => ({ value: s.id, label: s.name }))]} />
          ) : (
            <SelectField label="Group" value={form.groupId} onChange={(v) => setForm({ ...form, groupId: v })} options={[{ value: '', label: 'Choose a group' }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} />
          )}
        </fieldset>
        <div className="flex flex-col gap-1">
          <label htmlFor="task-instructions" className="text-sm font-medium text-slate-700">Instructions</label>
          <textarea id="task-instructions" rows={5} maxLength={5000} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <p className="text-xs text-slate-500">At least 10 characters before publishing.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Priority" value={form.priority} onChange={(v) => setForm({ ...form, priority: v })} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
          <div className="flex flex-col gap-1">
            <label htmlFor="task-deadline" className="text-sm font-medium text-slate-700">Deadline</label>
            <input id="task-deadline" type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Attachments (links)</p>
          {attachments.length > 0 && (
            <ul className="space-y-1 text-sm">
              {attachments.map((a, i) => (
                <li key={`${a.url}-${i}`} className="flex items-center justify-between gap-2"><span className="truncate">{a.name}</span><button type="button" onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} className="text-xs text-red-600 hover:underline">Remove</button></li>
              ))}
            </ul>
          )}
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input aria-label="Attachment name" placeholder="Name" value={attName} onChange={(e) => setAttName(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <input aria-label="Attachment link" placeholder="https://…" value={attUrl} onChange={(e) => setAttUrl(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <button type="button" onClick={addAttachment} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Add</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
