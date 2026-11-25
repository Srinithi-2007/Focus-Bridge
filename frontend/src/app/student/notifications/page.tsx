'use client';

import { useState } from 'react';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { formatDateTime } from '@/lib/coach/format';
import Button from '@/components/Button';
import Link from 'next/link';
import { errorMessage, useWorkspaceData, workspaceRequest } from '@/lib/workspace/client';

interface Note { id: string; type: string; title: string; body: string; link: string; readAt: string | null; createdAt: string }

export default function StudentNotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState('');
  const q = unreadOnly ? '?unread=true' : '';
  const { data, error: loadError, loading, reload } = useWorkspaceData<{ unread: number; notifications: Note[] }>(`/me/notifications${q}`);

  async function run(fn: () => Promise<unknown>) {
    setError('');
    try {
      await fn();
      reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const typeTone: Record<string, 'blue' | 'amber' | 'green' | 'slate'> = { task: 'blue', deadline: 'amber', reminder: 'amber', feedback: 'green', message: 'blue', group: 'slate', plan: 'slate' };

  return (
    <>
      <PageHeader title="Notifications" description="Tasks, feedback from your coach, deadline and work-block reminders, and messages."
        action={
          <div className="flex gap-2">
            <button type="button" onClick={() => setUnreadOnly(!unreadOnly)} aria-pressed={unreadOnly} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">{unreadOnly ? 'Showing unread' : 'Show unread only'}</button>
            <Button onClick={() => run(() => workspaceRequest('/me/notifications/read-all', { method: 'POST' }))} disabled={!data || data.unread === 0}>Mark all read</Button>
          </div>
        } />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {loadError && <Alert>{loadError}</Alert>}
      {loading && !data && <Spinner label="Loading notifications" />}
      {data && data.notifications.length === 0 && <EmptyState title={unreadOnly ? 'No unread notifications' : 'No notifications yet'} />}
      {data && data.notifications.length > 0 && (
        <Card>
          <ul className="divide-y divide-slate-100">
            {data.notifications.map((n) => (
              <li key={n.id} className={`flex flex-wrap items-start justify-between gap-3 py-4 ${n.readAt ? '' : 'bg-brand-50/40'}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><Badge tone={typeTone[n.type] || 'slate'}>{n.type}</Badge>{!n.readAt && <span className="text-xs font-semibold text-brand-700">New</span>}</div>
                  <p className="mt-1 font-medium">{n.title}</p>
                  {n.body && <p className="text-sm text-slate-600">{n.body}</p>}
                  <p className="text-xs text-slate-500">{formatDateTime(n.createdAt)}</p>
                </div>
                <div className="flex gap-3 text-sm">
                  {n.link && <Link href={n.link} className="font-medium text-brand-600 hover:underline">Open</Link>}
                  {!n.readAt && <button type="button" onClick={() => run(() => workspaceRequest(`/me/notifications/${n.id}/read`, { method: 'POST' }))} className="font-medium text-slate-600 hover:underline">Mark read</button>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
