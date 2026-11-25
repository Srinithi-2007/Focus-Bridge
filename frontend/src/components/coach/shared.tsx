'use client';

import { FormEvent, useState } from 'react';
import { Badge, Modal, Alert } from '@/components/ui';
import Button from '@/components/Button';
import { workspaceRequest, errorMessage } from '@/lib/workspace/client';

const STATE = {
  not_started: { tone: 'slate', label: 'Not started' },
  submitted: { tone: 'blue', label: 'Submitted' },
  reviewed: { tone: 'green', label: 'Feedback given' },
  overdue: { tone: 'red', label: 'Overdue' },
} as const;

export function TaskStateBadge({ state }: { state: keyof typeof STATE }) {
  const s = STATE[state];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ProgressBar({ value, label }: { value: number | null; label?: string }) {
  if (value === null) return <span className="text-slate-400">No tasks yet</span>;
  return (
    <div className="min-w-[120px]" aria-label={label || `${value}% complete`}>
      <div className="flex justify-between text-xs text-slate-600"><span>{value}%</span></div>
      <div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-brand-500" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

// Feedback that a coach writes on a student's submission. Shown to the student; kept separate from private notes.
export function FeedbackModal({ submissionId, onClose, onSaved }: { submissionId: string | null; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const open = submissionId !== null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!submissionId) return;
    setBusy(true);
    setError('');
    try {
      await workspaceRequest(`/coach/submissions/${submissionId}/feedback`, { method: 'POST', body: { feedback: text.trim() } });
      setText('');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Feedback on submission" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4"> 
        {error && <Alert>{error}</Alert>}
        <p className="text-xs text-slate-500">Feedback is visible to the student.</p>
        <div className="flex flex-col gap-1">
          <label htmlFor="feedback-text" className="text-sm font-medium text-slate-700">Feedback</label>
          <textarea id="feedback-text" required rows={5} maxLength={3000} value={text} onChange={(e) => setText(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <Button type="submit" disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Save feedback'}</Button>
        </div>
      </form>
    </Modal>
  );
}
