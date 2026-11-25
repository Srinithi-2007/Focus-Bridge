'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Badge, Card, EmptyState, PageHeader, SelectField, Spinner } from '@/components/ui';
import { formatDateTime } from '@/lib/coach/format';
import Button from '@/components/Button';
import { errorMessage, useWorkspaceData, workspaceRequest } from '@/lib/workspace/client';

interface StudentOption { id: string; name: string; status: string }
interface ReviewRow { id: string; studentId: string; studentName: string; status: 'draft' | 'submitted'; strengths: string; challenges: string; observations: string; recommendations: string; nextGoals: string; submittedAt: string | null; updatedAt: string }

const SECTIONS: { key: 'strengths' | 'challenges' | 'observations' | 'recommendations' | 'nextGoals'; label: string; hint: string; required?: boolean }[] = [
  { key: 'strengths', label: 'Strengths', hint: 'What the student does well.', required: true },
  { key: 'challenges', label: 'Challenges', hint: 'Where progress is slower or harder.' },
  { key: 'observations', label: 'Observations', hint: 'What you noticed in tasks, groups or sessions.', required: true },
  { key: 'recommendations', label: 'Recommendations', hint: 'Concrete suggestions for the next period.' },
  { key: 'nextGoals', label: 'Next goals', hint: 'Goals for the coming weeks.', required: true },
];

export default function CoachReviewsPage() {
  return <Suspense fallback={<Spinner label="Loading reviews" />}><ReviewsInner /></Suspense>;
}

function ReviewsInner() {
  const params = useSearchParams();
  const [studentId, setStudentId] = useState(params.get('student') || '');
  const [selectedReview, setSelectedReview] = useState<string | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const students = useWorkspaceData<{ students: StudentOption[] }>('/coach/students?limit=100');
  const reviews = useWorkspaceData<{ reviews: ReviewRow[] }>(studentId ? `/coach/reviews?studentId=${studentId}` : null);
  const active = reviews.data?.reviews.find((r) => r.id === selectedReview) ?? null;

  useEffect(() => {
    if (studentId && reviews.data && selectedReview === null) {
      const first = reviews.data.reviews[0];
      setSelectedReview(first ? first.id : 'new');
    }
  }, [studentId, reviews.data, selectedReview]);

  function changeStudent(id: string) {
    setStudentId(id);
    setSelectedReview(null);
    setNotice('');
  }

  return (
    <>
      <PageHeader title="Individual reviews" description="One review per student. Write a draft, then submit it. Submitted reviews are locked and kept as a history." />
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card title="Student">
          {students.loading && !students.data && <Spinner label="Loading students" />}
          {students.data && students.data.students.length === 0 && <EmptyState title="No allocated students" />}
          <SelectField label="Student" value={studentId} onChange={changeStudent} options={[{ value: '', label: 'Choose a student' }, ...(students.data?.students || []).map((s) => ({ value: s.id, label: s.name }))]} />
          {studentId && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-700">History</p>
              {reviews.loading && !reviews.data && <Spinner label="Loading history" />}
              {reviews.data && reviews.data.reviews.length === 0 && <p className="text-sm text-slate-500">No reviews yet for this student.</p>}
              <ul className="space-y-1">
                {reviews.data?.reviews.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setSelectedReview(r.id)} aria-current={selectedReview === r.id ? 'true' : undefined}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm ${selectedReview === r.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-100'}`}>
                      <span className="block">{r.status === 'submitted' ? `Submitted ${formatDateTime(r.submittedAt)}` : `Draft · ${formatDateTime(r.updatedAt)}`}</span>
                      <Badge tone={r.status === 'submitted' ? 'green' : 'amber'}>{r.status}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setSelectedReview('new')} className="mt-3 text-sm font-medium text-brand-600 hover:underline">+ New review</button>
            </div>
          )}
        </Card>

        <div className="min-w-0">
          {!studentId && <EmptyState title="Choose a student" body="Select one of your students to write or review their progress report." />}
          {studentId && selectedReview !== null && selectedReview !== 'new' && !active && <Spinner label="Loading review" />}
          {studentId && selectedReview !== null && (selectedReview === 'new' || active) && (
            <ReviewEditor
              key={selectedReview}
              studentId={studentId}
              studentName={students.data?.students.find((s) => s.id === studentId)?.name || ''}
              review={selectedReview === 'new' ? null : active}
              onChanged={(msg, id) => { setNotice(msg); setSelectedReview(id); reviews.reload(); }}
            />
          )}
        </div>
      </div>
    </>
  );
}

function ReviewEditor({ studentId, studentName, review, onChanged }: { studentId: string; studentName: string; review: ReviewRow | null; onChanged: (msg: string, id: string) => void }) {
  const locked = review?.status === 'submitted';
  const [form, setForm] = useState({ strengths: review?.strengths || '', challenges: review?.challenges || '', observations: review?.observations || '', recommendations: review?.recommendations || '', nextGoals: review?.nextGoals || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<null | 'draft' | 'submit'>(null);

  async function save(submit: boolean, e?: FormEvent) {
    e?.preventDefault();
    setError('');
    setBusy(submit ? 'submit' : 'draft');
    if (submit && !window.confirm('Submit this review? After submission it is locked and cannot be edited.')) {
      setBusy(null);
      return;
    }
    try {
      if (!review) {
        const res = await workspaceRequest<{ review: ReviewRow }>('/coach/reviews', { method: 'POST', body: { studentId, ...form, submit } });
        onChanged(submit ? 'Review submitted.' : 'Draft saved.', res.review.id);
      } else {
        const res = await workspaceRequest<{ review: ReviewRow }>(`/coach/reviews/${review.id}`, { method: 'PATCH', body: { ...form, submit } });
        onChanged(submit ? 'Review submitted and locked.' : 'Draft saved.', res.review.id);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title={review ? (locked ? `Submitted review · ${formatDateTime(review.submittedAt)}` : 'Draft review') : `New review for ${studentName}`}
      action={locked ? <Badge tone="green">Locked</Badge> : <Badge tone="amber">Draft</Badge>}
    >
      <p className="mb-4 rounded-md bg-slate-50 p-3 text-xs text-slate-600">Written by you. This review is never generated or submitted by AI. AI-generated insights, when available, appear separately.</p>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {locked ? (
        <dl className="space-y-4 text-sm">
          {SECTIONS.map((s) => (
            <div key={s.key}><dt className="text-xs font-semibold uppercase text-slate-500">{s.label}</dt><dd className="mt-1 whitespace-pre-wrap">{review?.[s.key] || <span className="text-slate-400">—</span>}</dd></div>
          ))}
        </dl>
      ) : (
        <form onSubmit={(e) => save(false, e)} className="space-y-4" noValidate>
          {SECTIONS.map((s) => (
            <div key={s.key} className="flex flex-col gap-1">
              <label htmlFor={`rv-${s.key}`} className="text-sm font-medium text-slate-700">{s.label}{s.required && <span className="text-red-600"> *</span>}</label>
              <p className="text-xs text-slate-500">{s.hint}</p>
              <textarea id={`rv-${s.key}`} rows={3} maxLength={3000} value={form[s.key]} onChange={(e) => setForm({ ...form, [s.key]: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
          ))}
          <p className="text-xs text-slate-500">* Required before submitting.</p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="submit" disabled={busy !== null} className="bg-slate-700 hover:bg-slate-800">{busy === 'draft' ? 'Saving…' : 'Save draft'}</Button>
            <Button type="button" disabled={busy !== null} onClick={() => save(true)}>{busy === 'submit' ? 'Submitting…' : 'Submit review'}</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
