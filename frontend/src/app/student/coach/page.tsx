'use client';

import { FormEvent, useState } from 'react';
import { Alert, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { formatDateTime } from '@/lib/coach/format';
import Button from '@/components/Button';
import { errorMessage, useWorkspaceData, workspaceRequest } from '@/lib/workspace/client';

interface CoachView {
  coach: { name: string; email: string } | null;
  feedback: { id: string; taskTitle: string; feedback: string; feedbackAt: string }[];
  goals: { text: string; fromReviewAt: string } | null;
  reviews: { id: string; submittedAt: string; strengths: string; challenges: string; observations: string; recommendations: string; nextGoals: string }[];
  messages: { id: string; from: 'student' | 'coach'; body: string; createdAt: string }[];
}

export default function StudentCoachPage() {
  const { data, error, loading, reload } = useWorkspaceData<CoachView>('/me/coach');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState('');

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setSendError('');
    try {
      await workspaceRequest('/me/coach/messages', { method: 'POST', body: { body: text.trim() } });
      setText('');
      reload();
    } catch (err) {
      setSendError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <Spinner label="Loading your coach" />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;

  if (!data.coach) {
    return (
      <>
        <PageHeader title="My coach" />
        <EmptyState title="No coach assigned yet" body="Your administrator assigns a coach to you. You will see their feedback and reviews here." />
      </>
    );
  }

  return (
    <>
      <PageHeader title="My coach" description={`${data.coach.name} · ${data.coach.email}`} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Messages" action={<span className="text-xs text-slate-500">Replies are asynchronous. Your coach responds when available.</span>}>
          {data.messages.length === 0 ? <p className="mb-4 text-sm text-slate-500">No messages yet.</p> : (
            <ul className="mb-4 max-h-80 space-y-3 overflow-y-auto text-sm">
              {data.messages.map((m) => (
                <li key={m.id} className={`rounded-lg p-3 ${m.from === 'student' ? 'ml-8 bg-brand-50' : 'mr-8 bg-slate-100'}`}>
                  <p className="text-xs text-slate-500">{m.from === 'student' ? 'You' : data.coach?.name} · {formatDateTime(m.createdAt)}</p>
                  <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
          {sendError && <div className="mb-3"><Alert>{sendError}</Alert></div>}
          <form onSubmit={send} className="space-y-2">
            <label htmlFor="msg" className="text-sm font-medium text-slate-700">Send a message</label>
            <textarea id="msg" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <div className="flex justify-end"><Button type="submit" disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send'}</Button></div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card title="Current goals">
            {data.goals ? (
              <>
                <p className="whitespace-pre-wrap text-sm">{data.goals.text}</p>
                <p className="mt-2 text-xs text-slate-500">From your review on {formatDateTime(data.goals.fromReviewAt)}</p>
              </>
            ) : <p className="text-sm text-slate-500">Your coach will set goals in a review.</p>}
          </Card>

          <Card title="Feedback on your work">
            {data.feedback.length === 0 ? <p className="text-sm text-slate-500">No feedback yet.</p> : (
              <ul className="divide-y divide-slate-100 text-sm">
                {data.feedback.map((f) => <li key={f.id} className="py-3"><p className="font-medium">{f.taskTitle}</p><p className="mt-1 whitespace-pre-wrap">{f.feedback}</p><p className="text-xs text-slate-500">{formatDateTime(f.feedbackAt)}</p></li>)}
              </ul>
            )}
          </Card>

          <Card title="Individual reviews">
            <p className="mb-3 text-xs text-slate-500">Written by your coach. Submitted reviews are final.</p>
            {data.reviews.length === 0 ? <p className="text-sm text-slate-500">No submitted reviews yet.</p> : (
              <ul className="space-y-2 text-sm">
                {data.reviews.map((r) => (
                  <li key={r.id}>
                    <details className="rounded border border-slate-200 p-3">
                      <summary className="cursor-pointer font-medium">Review from {formatDateTime(r.submittedAt)}</summary>
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
      </div>
    </>
  );
}
