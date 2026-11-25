'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner, StatusBadge, formatDate } from '@/components/ui';
import Button from '@/components/Button';
import { FeedbackModal, ProgressBar, TaskStateBadge } from '@/components/coach/shared';
import { formatDateTime } from '@/lib/coach/format';
import { errorMessage, useWorkspaceData, workspaceRequest } from '@/lib/workspace/client';

interface Profile {
  student: { id: string; name: string; email: string; status: string; programName: string | null; groups: { id: string; name: string }[] };
  overview: { assignedCount: number; submittedCount: number; openCount: number; overdueCount: number; completionPct: number | null; reviewCount: number };
  goals: { text: string; fromReviewAt: string } | null;
  tasks: { id: string; title: string; deadline: string | null; audience: string; state: 'not_started' | 'submitted' | 'reviewed' | 'overdue'; submittedAt: string | null; late: boolean }[];
  history: { id: string; taskTitle: string; submittedAt: string; status: string; late: boolean; attempts: number; feedback: string }[];
  reviews: { id: string; submittedAt: string; strengths: string; challenges: string; observations: string; recommendations: string; nextGoals: string }[];
  privateNotes: { id: string; body: string; createdAt: string }[];
}

interface MessageItem {
  id: string;
  from: 'student' | 'coach';
  body: string;
  createdAt: string;
}

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useWorkspaceData<Profile>(`/coach/students/${id}`);
  const { data: msgData, reload: reloadMessages } = useWorkspaceData<{ messages: MessageItem[] }>(`/coach/students/${id}/messages`);
  const [noteText, setNoteText] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState('');

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (!replyText.trim()) return;
    setReplyBusy(true);
    setReplyError('');
    try {
      await workspaceRequest(`/coach/students/${id}/messages`, { method: 'POST', body: { body: replyText.trim() } });
      setReplyText('');
      reloadMessages();
    } catch (err) {
      setReplyError(errorMessage(err));
    } finally {
      setReplyBusy(false);
    }
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    setNoteBusy(true);
    setActionError('');
    try {
      await workspaceRequest(`/coach/students/${id}/notes`, { method: 'POST', body: { body: noteText.trim() } });
      setNoteText('');
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setNoteBusy(false);
    }
  }

  async function deleteNote(noteId: string) {
    if (!window.confirm('Delete this private note?')) return;
    try {
      await workspaceRequest(`/coach/students/${id}/notes/${noteId}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  if (loading && !data) return <Spinner label="Loading student profile" />;
  if (error) return <><Alert>{error}</Alert><Link href="/coach/students" className="mt-4 inline-block text-brand-600 hover:underline">Back to my students</Link></>;
  if (!data) return null;
  const p = data.student;

  return (
    <>
      <div className="mb-2 text-sm"><Link href="/coach/students" className="text-brand-600 hover:underline">← My students</Link></div>
      <PageHeader
        title={p.name}
        description={p.email}
        action={
          <div className="flex flex-wrap gap-3">
            <Link href={`/coach/tasks?student=${p.id}&new=1`} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Assign task</Link>
            <Link href={`/coach/reviews?student=${p.id}`} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Write review</Link>
          </div>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={p.status} />
        {p.programName && <Badge tone="blue">{p.programName}</Badge>}
        {p.groups.map((g) => <Badge key={g.id}>{g.name}</Badge>)}
      </div>

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><p className="text-sm text-slate-500">Completion</p><div className="mt-2"><ProgressBar value={data.overview.completionPct} /></div><p className="mt-2 text-xs text-slate-500">{data.overview.submittedCount} of {data.overview.assignedCount} tasks submitted</p></Card>
          <Card><p className="text-sm text-slate-500">Open tasks</p><p className="mt-1 text-2xl font-bold">{data.overview.openCount}</p><p className="text-xs text-red-600">{data.overview.overdueCount} overdue</p></Card>
          <Card><p className="text-sm text-slate-500">Submitted reviews</p><p className="mt-1 text-2xl font-bold">{data.overview.reviewCount}</p></Card>
          <Card><p className="text-sm text-slate-500">Current goals</p>{data.goals ? <p className="mt-1 text-sm">{data.goals.text}</p> : <p className="mt-1 text-sm text-slate-500">Set in a submitted review.</p>}</Card>
        </div>

        <Card title="Assigned tasks">
          {data.tasks.length === 0 ? <EmptyState title="No published tasks yet" body="Publish a task to this student or their group to see progress here." /> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.tasks.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div><p className="font-medium">{t.title}</p><p className="text-xs text-slate-500">{t.audience === 'group' ? 'Group task' : 'Individual task'} · due {formatDate(t.deadline)}{t.submittedAt ? ` · submitted ${formatDateTime(t.submittedAt)}` : ''}{t.late ? ' · late' : ''}</p></div>
                  <TaskStateBadge state={t.state} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Progress history">
            {data.history.length === 0 ? <EmptyState title="No submissions yet" /> : (
              <ul className="divide-y divide-slate-100 text-sm">
                {data.history.map((h) => (
                  <li key={h.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><p className="font-medium">{h.taskTitle}</p><p className="text-xs text-slate-500">{formatDateTime(h.submittedAt)}{h.late ? ' · late' : ''}{h.attempts > 1 ? ` · attempt ${h.attempts}` : ''}</p></div>
                      {h.status === 'submitted' ? (
                        <button type="button" onClick={() => setFeedbackId(h.id)} className="text-sm font-medium text-brand-600 hover:underline">Give feedback</button>
                      ) : (<Badge tone="green">Feedback given</Badge>)}
                    </div>
                    {h.feedback && <p className="mt-2 rounded bg-slate-50 p-2 text-slate-700">{h.feedback}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Previous reviews" action={<Link href={`/coach/reviews?student=${p.id}`} className="text-sm text-brand-600 hover:underline">Open reviews</Link>}>
            {data.reviews.length === 0 ? <EmptyState title="No submitted reviews yet" /> : (
              <ul className="space-y-2 text-sm">
                {data.reviews.map((r) => (
                  <li key={r.id}>
                    <details className="rounded border border-slate-200 p-3">
                      <summary className="cursor-pointer font-medium">Review submitted {formatDateTime(r.submittedAt)}</summary>
                      <dl className="mt-3 space-y-2">
                        {[['Strengths', r.strengths], ['Challenges', r.challenges], ['Observations', r.observations], ['Recommendations', r.recommendations], ['Next goals', r.nextGoals]].map(([k, v]) => (
                          v ? <div key={k}><dt className="text-xs font-semibold uppercase text-slate-500">{k}</dt><dd className="whitespace-pre-wrap">{v}</dd></div> : null
                        ))}
                      </dl>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Direct Line (Messages)" action={<span className="text-xs text-slate-500">Asynchronous messages with {p.name}</span>}>
          {(!msgData || msgData.messages.length === 0) ? (
            <p className="mb-4 text-sm text-slate-500">No messages yet with this student.</p>
          ) : (
            <ul className="mb-4 max-h-80 space-y-3 overflow-y-auto text-sm">
              {msgData.messages.map((m) => (
                <li key={m.id} className={`rounded-lg p-3 ${m.from === 'coach' ? 'ml-8 bg-brand-50' : 'mr-8 bg-slate-100'}`}>
                  <p className="text-xs text-slate-500">{m.from === 'coach' ? 'You' : p.name} · {formatDateTime(m.createdAt)}</p>
                  <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
          {replyError && <div className="mb-3"><Alert>{replyError}</Alert></div>}
          <form onSubmit={sendReply} className="space-y-2">
            <label htmlFor="coach-reply" className="text-sm font-medium text-slate-700">Send reply to {p.name}</label>
            <textarea
              id="coach-reply"
              rows={3}
              maxLength={2000}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a message or reply…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={replyBusy || !replyText.trim()}>{replyBusy ? 'Sending…' : 'Send message'}</Button>
            </div>
          </form>
        </Card>

        <Card title="Private coach notes">
          <div className="mb-4 rounded-md bg-amber-50 p-3 text-xs text-amber-900">Private to you. Students and other coaches cannot see these notes.</div>
          {actionError && <div className="mb-3"><Alert>{actionError}</Alert></div>}
          <form onSubmit={addNote} className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="note-text" className="sr-only">Add a private note</label>
            <textarea id="note-text" rows={2} maxLength={3000} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a private note…" className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <Button type="submit" disabled={noteBusy || !noteText.trim()} className="sm:self-start">{noteBusy ? 'Saving…' : 'Add note'}</Button>
          </form>
          {data.privateNotes.length === 0 ? <p className="mt-4 text-sm text-slate-500">No notes yet.</p> : (
            <ul className="mt-4 divide-y divide-slate-100 text-sm">
              {data.privateNotes.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-4 py-3">
                  <div><p className="whitespace-pre-wrap">{n.body}</p><p className="text-xs text-slate-500">{formatDateTime(n.createdAt)}</p></div>
                  <button type="button" onClick={() => deleteNote(n.id)} className="text-xs font-medium text-red-600 hover:underline">Delete</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <FeedbackModal submissionId={feedbackId} onClose={() => setFeedbackId(null)} onSaved={() => { setFeedbackId(null); reload(); }} />
    </>
  );
}
