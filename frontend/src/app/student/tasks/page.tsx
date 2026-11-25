'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Badge, Card, EmptyState, Modal, PageHeader, Spinner, formatDate } from '@/components/ui';
import Button from '@/components/Button';
import Field from '@/components/Field';
import { SourceBadge, fmt, fmtDay, fmtTime } from '@/components/student/shared';
import { errorMessage, useWorkspaceData, workspaceRequest } from '@/lib/workspace/client';

interface TaskItem { id: string; title: string; instructions: string; priority: string; deadline: string | null; overdue: boolean; submission: { id: string; body: string; status: string; submittedAt: string; late: boolean; attempts: number; feedback: string | null } | null }
interface Subtask { id: string; title: string; estimateMinutes: number; done: boolean }
interface Block { id: string; subtaskId: string; start: string; end: string }
interface Plan { id: string; taskId: string; taskTitle: string; status: 'proposed' | 'approved' | 'rejected' | 'superseded'; source: 'ai' | 'planner'; sourceNote: string; subtasks: Subtask[]; blocks: Block[]; unscheduledMinutes: number; feasible: boolean; warnings: string[]; missedBlocks?: number }

export default function StudentTasksPage() {
  return <Suspense fallback={<Spinner label="Loading tasks" />}><TasksInner /></Suspense>;
}

function TasksInner() {
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(params.get('task'));
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const tasks = useWorkspaceData<{ tasks: TaskItem[] }>('/me/tasks');
  const current = tasks.data?.tasks.find((t) => t.id === selected) ?? null;

  return (
    <>
      <PageHeader title="My tasks" description="Work assigned by your coach. Your coach's instructions and deadlines are shown exactly as published." />
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {tasks.loading && !tasks.data && <Spinner label="Loading tasks" />}
      {tasks.error && <Alert>{tasks.error}</Alert>}
      {tasks.data && tasks.data.tasks.length === 0 && <EmptyState title="No tasks assigned" body="Tasks from your coach will appear here." />}

      {tasks.data && tasks.data.tasks.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card title="Assigned">
            <ul className="space-y-1">
              {tasks.data.tasks.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => setSelected(t.id)} aria-current={selected === t.id ? 'true' : undefined}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm ${selected === t.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-100'}`}>
                    <span className="block font-medium">{t.title}</span>
                    <span className="block text-xs text-slate-500">{t.submission ? (t.submission.feedback ? 'Feedback received' : 'Submitted') : t.overdue ? 'Overdue' : `Due ${formatDate(t.deadline)}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <div className="min-w-0 space-y-6">
            {!current && <EmptyState title="Choose a task" body="Select a task to read the instructions, plan your time, or submit your work." />}
            {current && (
              <>
                <Card title={current.title} action={<Badge tone={current.overdue ? 'red' : 'blue'}>{current.overdue ? 'Overdue' : `Priority: ${current.priority}`}</Badge>}>
                  <p className="text-sm text-slate-500">Deadline: {fmt(current.deadline)}</p>
                  <div className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm">{current.instructions || 'No instructions were given.'}</div>
                  {current.submission?.feedback && (
                    <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm"><p className="font-semibold text-green-900">Feedback from your coach</p><p className="mt-1 whitespace-pre-wrap">{current.submission.feedback}</p></div>
                  )}
                </Card>
                <SubmitCard task={current} onDone={() => { setNotice('Submitted. Your coach has been notified.'); tasks.reload(); }} onError={setError} />
                <PlanCard task={current} onNotice={setNotice} onError={setError} />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SubmitCard({ task, onDone, onError }: { task: TaskItem; onDone: () => void; onError: (m: string) => void }) {
  const [body, setBody] = useState(task.submission?.body || '');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await workspaceRequest(`/me/tasks/${task.id}/submission`, { method: 'POST', body: { body: body.trim() } });
      onDone();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Your submission" action={task.submission ? <span className="text-xs text-slate-500">{task.submission.attempts > 1 ? `Attempt ${task.submission.attempts} · ` : ''}{task.submission.late ? 'Submitted late' : `Submitted ${fmt(task.submission.submittedAt)}`}</span> : undefined}>
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="sub-body" className="text-sm font-medium text-slate-700">Your response</label>
        <textarea id="sub-body" rows={5} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <p className="text-xs text-slate-500">File uploads are not available yet. Paste your work here.</p>
        <div className="flex justify-end"><Button type="submit" disabled={busy || !body.trim()}>{busy ? 'Submitting…' : task.submission ? 'Resubmit' : 'Submit'}</Button></div>
      </form>
    </Card>
  );
}

function PlanCard({ task, onNotice, onError }: { task: TaskItem; onNotice: (m: string) => void; onError: (m: string) => void }) {
  const plans = useWorkspaceData<{ plans: Plan[] }>(`/me/plans?taskId=${task.id}`);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState<Plan | null>(null);
  const active = plans.data?.plans.find((p) => p.status === 'proposed' || p.status === 'approved') ?? null;

  async function generate() {
    setBusy(true);
    try {
      await workspaceRequest(`/me/tasks/${task.id}/plans`, { method: 'POST' });
      onNotice('A plan was proposed. Review it, then approve to add work blocks to your calendar.');
      plans.reload();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      onNotice(msg);
      plans.reload();
    } catch (e) {
      onError(errorMessage(e));
    }
  }

  return (
    <Card title="Plan my time" action={!active && !plans.loading ? <Button onClick={generate} disabled={busy}>{busy ? 'Planning…' : 'Propose a plan'}</Button> : undefined}>
      {plans.loading && !plans.data && <Spinner label="Loading plan" />}
      {!active && !plans.loading && <p className="text-sm text-slate-500">Propose a plan to split this task into steps and place work blocks in your availability. Nothing is added to your calendar until you approve.</p>}
      {active && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><SourceBadge source={active.source} /><Badge tone={active.status === 'approved' ? 'green' : 'amber'}>{active.status === 'approved' ? 'Approved' : 'Proposed — not on calendar yet'}</Badge></div>
          <p className="text-xs text-slate-500">{active.sourceNote}</p>
          {active.warnings.map((w) => <Alert key={w} tone="info">{w}</Alert>)}
          {active.missedBlocks ? <Alert>{active.missedBlocks} work block(s) were missed. You can re-plan the remaining steps.</Alert> : null}

          <div>
            <p className="mb-2 text-sm font-semibold">Steps</p>
            <ul className="divide-y divide-slate-100 text-sm">
              {active.subtasks.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                  <label className="flex items-center gap-2">
                    {active.status === 'approved' && <input type="checkbox" checked={s.done} onChange={(e) => act(() => workspaceRequest(`/me/plans/${active.id}/subtasks/${s.id}`, { method: 'PATCH', body: { done: e.target.checked } }), 'Step updated.')} className="h-4 w-4" aria-label={`Mark ${s.title} done`} />}
                    <span className={s.done ? 'line-through text-slate-400' : ''}>{s.title}</span>
                  </label>
                  <span className="whitespace-nowrap text-slate-500">{s.estimateMinutes} min</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Work blocks {active.feasible ? '' : `(${active.unscheduledMinutes} min unscheduled)`}</p>
            {active.blocks.length === 0 ? <p className="text-sm text-slate-500">No blocks could be placed. Add availability in Settings.</p> : (
              <ul className="space-y-1 text-sm">
                {active.blocks.map((b) => <li key={b.id}>{fmtDay(b.start)} · {fmtTime(b.start)} – {fmtTime(b.end)}</li>)}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            {active.status === 'proposed' && (
              <>
                <button type="button" onClick={() => setEditOpen(active)} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Edit steps</button>
                <button type="button" onClick={() => act(() => workspaceRequest(`/me/plans/${active.id}/reject`, { method: 'POST' }), 'Plan discarded.')} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Discard</button>
                <Button onClick={() => act(() => workspaceRequest(`/me/plans/${active.id}/approve`, { method: 'POST' }), 'Plan approved. Work blocks are on your calendar.')} disabled={active.blocks.length === 0}>Approve plan</Button>
              </>
            )}
            {active.status === 'approved' && (
              <Button onClick={() => act(() => workspaceRequest(`/me/plans/${active.id}/reschedule`, { method: 'POST' }), 'A new proposal was made for the remaining steps.')}>Re-plan remaining steps</Button>
            )}
          </div>
        </div>
      )}
      <EditPlanModal plan={editOpen} onClose={() => setEditOpen(null)} onSaved={() => { setEditOpen(null); onNotice('Steps updated and blocks re-placed.'); plans.reload(); }} onError={onError} />
    </Card>
  );
}

function EditPlanModal({ plan, onClose, onSaved, onError }: { plan: Plan | null; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [rows, setRows] = useState<{ id?: string; title: string; estimateMinutes: number }[]>([]);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const current = plan ? plan.id : null;
  if (current !== key) {
    setKey(current);
    setRows(plan ? plan.subtasks.map((s) => ({ id: s.id, title: s.title, estimateMinutes: s.estimateMinutes })) : []);
    setErr('');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!plan) return;
    setBusy(true);
    setErr('');
    try {
      await workspaceRequest(`/me/plans/${plan.id}`, { method: 'PATCH', body: { subtasks: rows.map((r) => ({ id: r.id, title: r.title.trim(), estimateMinutes: Number(r.estimateMinutes) })) } });
      onSaved();
    } catch (e2) {
      setErr(errorMessage(e2));
      onError('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={plan !== null} title="Edit steps" onClose={onClose}>
      <form onSubmit={save} className="space-y-4" noValidate>
        {err && <Alert>{err}</Alert>}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_96px_auto] items-end gap-2">
            <Field label={`Step ${i + 1}`} value={r.title} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <Field label="Minutes" type="number" min={5} max={480} value={String(r.estimateMinutes)} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, estimateMinutes: Number(e.target.value) } : x)))} />
            <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length <= 1} className="mb-1 text-sm text-red-600 hover:underline disabled:text-slate-400">Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => setRows([...rows, { title: '', estimateMinutes: 30 }])} disabled={rows.length >= 12} className="text-sm font-medium text-brand-600 hover:underline">+ Add step</button>
        <p className="text-xs text-slate-500">Changing steps re-places the work blocks in your availability.</p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <Button type="submit" disabled={busy || rows.some((r) => r.title.trim().length < 3)}>{busy ? 'Saving…' : 'Save steps'}</Button>
        </div>
      </form>
    </Modal>
  );
}
