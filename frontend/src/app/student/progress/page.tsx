'use client';

import { Alert, Card, EmptyState, PageHeader, Spinner, StatCard } from '@/components/ui';
import { formatDateTime } from '@/lib/coach/format';
import { ProgressBar } from '@/components/coach/shared';
import { useWorkspaceData } from '@/lib/workspace/client';

interface Progress {
  progress: { assigned: number; submitted: number; completionPct: number | null; onTime: number; blocksDone: number; blocksPlanned: number };
  goals: { text: string; fromReviewAt: string; coachName: string } | null;
  reviews: { id: string; submittedAt: string; coachName: string; strengths: string; challenges: string; observations: string; recommendations: string; nextGoals: string }[];
  feedback: { taskId: string; feedback: string }[];
  insights: string[];
  insightsLabel: string;
}

export default function StudentProgressPage() {
  const { data, error, loading } = useWorkspaceData<Progress>('/me/progress');
  return (
    <>
      <PageHeader title="Progress" description="Your completion, goals and coach reviews. Planner insights are shown separately from coach reviews." />
      {loading && !data && <Spinner label="Loading progress" />}
      {error && <Alert>{error}</Alert>}
      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card><p className="text-sm text-slate-500">Task completion</p><div className="mt-2"><ProgressBar value={data.progress.completionPct} /></div><p className="mt-2 text-xs text-slate-500">{data.progress.submitted} of {data.progress.assigned} submitted</p></Card>
            <StatCard label="On-time submissions" value={data.progress.onTime} hint={`of ${data.progress.submitted} submitted`} />
            <StatCard label="Work blocks completed" value={data.progress.blocksDone} hint={`of ${data.progress.blocksPlanned} that have started`} />
            <Card><p className="text-sm text-slate-500">Current goals</p>{data.goals ? <p className="mt-1 whitespace-pre-wrap text-sm">{data.goals.text}</p> : <p className="mt-1 text-sm text-slate-500">Your coach will set goals in a review.</p>}</Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Coach reviews">
              {data.reviews.length === 0 ? <EmptyState title="No submitted reviews yet" /> : (
                <ul className="space-y-2 text-sm">
                  {data.reviews.map((r) => (
                    <li key={r.id}>
                      <details className="rounded border border-slate-200 p-3">
                        <summary className="cursor-pointer font-medium">Review by {r.coachName || 'your coach'} · {formatDateTime(r.submittedAt)}</summary>
                        <dl className="mt-3 space-y-2">{[['Strengths', r.strengths], ['Challenges', r.challenges], ['Observations', r.observations], ['Recommendations', r.recommendations], ['Next goals', r.nextGoals]].map(([k, v]) => (v ? <div key={k}><dt className="text-xs font-semibold uppercase text-slate-500">{k}</dt><dd className="whitespace-pre-wrap">{v}</dd></div> : null))}</dl>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Planner insights" action={<span className="text-xs text-slate-500">Not from your coach</span>}>
              <p className="mb-3 text-xs text-slate-500">{data.insightsLabel}</p>
              <ul className="list-disc space-y-2 pl-5 text-sm">{data.insights.map((i) => <li key={i}>{i}</li>)}</ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
