'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Badge, Card, EmptyState, Modal, PageHeader, SelectField, Spinner } from '@/components/ui';
import Button from '@/components/Button';
import Field from '@/components/Field';
import { formatDateTime, toIsoOrNull, toLocalInput } from '@/lib/coach/format';
import { errorMessage, useWorkspaceData, workspaceRequest } from '@/lib/workspace/client';

interface Activity { id: string; groupId: string; groupName: string; title: string; description: string; location: string; startsAt: string; endsAt: string; status: 'scheduled' | 'completed' | 'cancelled' }

export default function CoachActivitiesPage() {
  return <Suspense fallback={<Spinner label="Loading activities" />}><ActivitiesInner /></Suspense>;
}

function ActivitiesInner() {
  const params = useSearchParams();
  const [tab, setTab] = useState<'scheduled' | 'completed' | 'cancelled'>('scheduled');
  const [groupId, setGroupId] = useState(params.get('group') || '');
  const [editor, setEditor] = useState<{ activity: Activity | null } | null>(params.get('new') ? { activity: null } : null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const q = new URLSearchParams({ status: tab });
  if (groupId) q.set('groupId', groupId);
  const activities = useWorkspaceData<{ activities: Activity[] }>(`/coach/activities?${q.toString()}`);
  const groups = useWorkspaceData<{ groups: { id: string; name: string }[] }>('/coach/groups');

  async function run(fn: () => Promise<unknown>, msg: string) {
    setError('');
    try {
      await fn();
      setNotice(msg);
      activities.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const now = Date.now();
  return (
    <>
      <PageHeader title="Sessions & activities" description="Group sessions and scheduled events. Activities are shared with the whole group; there are no compulsory one-to-one sessions."
        action={<Button onClick={() => setEditor({ activity: null })}>Schedule activity</Button>} />
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div role="tablist" aria-label="Activity status" className="flex gap-1">
            {(['scheduled', 'completed', 'cancelled'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${tab === t ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                {t === 'scheduled' ? 'Upcoming' : t}
              </button>
            ))}
          </div>
          <div className="w-64">
            <SelectField label="Group" value={groupId} onChange={setGroupId} options={[{ value: '', label: 'All groups' }, ...(groups.data?.groups || []).map((g) => ({ value: g.id, label: g.name }))]} />
          </div>
        </div>

        {activities.loading && !activities.data && <Spinner label="Loading activities" />}
        {activities.error && <Alert>{activities.error}</Alert>}
        {activities.data && activities.data.activities.length === 0 && <EmptyState title={tab === 'scheduled' ? 'Nothing scheduled' : `No ${tab} activities`} body={tab === 'scheduled' ? 'Schedule a session for one of your groups.' : undefined} />}
        {activities.data && activities.data.activities.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {activities.data.activities.map((a) => {
              const started = new Date(a.startsAt).getTime() <= now;
              return (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                  <div>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-sm text-slate-600">{a.groupName} · {formatDateTime(a.startsAt)} – {formatDateTime(a.endsAt)}</p>
                    {a.location && <p className="text-sm text-slate-500">{a.location}</p>}
                    {a.description && <p className="mt-1 text-sm text-slate-700">{a.description}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <Badge tone={a.status === 'completed' ? 'green' : a.status === 'cancelled' ? 'red' : 'blue'}>{a.status}</Badge>
                    {a.status === 'scheduled' && (
                      <>
                        <button type="button" onClick={() => setEditor({ activity: a })} className="font-medium text-brand-600 hover:underline">Edit</button>
                        <button type="button" disabled={!started} title={started ? undefined : 'Available after the activity starts'} onClick={() => run(() => workspaceRequest(`/coach/activities/${a.id}/complete`, { method: 'POST' }), 'Marked as completed.')} className="font-medium text-green-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400">Mark completed</button>
                        <button type="button" onClick={() => { if (window.confirm('Cancel this activity? Group members will see it as cancelled.')) run(() => workspaceRequest(`/coach/activities/${a.id}/cancel`, { method: 'POST' }), 'Activity cancelled.'); }} className="font-medium text-red-600 hover:underline">Cancel</button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ActivityEditor value={editor} defaultGroupId={groupId} groups={groups.data?.groups || []} onClose={() => setEditor(null)} onSaved={(msg) => { setEditor(null); setNotice(msg); activities.reload(); }} />
    </>
  );
}

function ActivityEditor({ value, defaultGroupId, groups, onClose, onSaved }: { value: { activity: Activity | null } | null; defaultGroupId: string; groups: { id: string; name: string }[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const editing = value?.activity ?? null;
  const [form, setForm] = useState({ groupId: '', title: '', description: '', location: '', startsAt: '', endsAt: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset the form whenever the editor opens.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const key = value ? (editing ? editing.id : 'new') : null;
  if (key !== openKey) {
    setOpenKey(key);
    setError('');
    if (value) {
      setForm(editing
        ? { groupId: editing.groupId, title: editing.title, description: editing.description, location: editing.location, startsAt: toLocalInput(editing.startsAt), endsAt: toLocalInput(editing.endsAt) }
        : { groupId: defaultGroupId || groups[0]?.id || '', title: '', description: '', location: '', startsAt: '', endsAt: '' });
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const startsAt = toIsoOrNull(form.startsAt);
    const endsAt = toIsoOrNull(form.endsAt);
    if (!startsAt || !endsAt) {
      setBusy(false);
      return setError('Choose a start and end time.');
    }
    try {
      if (editing) {
        await workspaceRequest(`/coach/activities/${editing.id}`, { method: 'PATCH', body: { title: form.title.trim(), description: form.description.trim(), location: form.location.trim(), startsAt, endsAt } });
        onSaved('Activity updated.');
      } else {
        await workspaceRequest('/coach/activities', { method: 'POST', body: { groupId: form.groupId, title: form.title.trim(), description: form.description.trim(), location: form.location.trim(), startsAt, endsAt } });
        onSaved('Activity scheduled.');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={value !== null} title={editing ? 'Edit activity' : 'Schedule activity'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <SelectField label="Group" value={form.groupId} disabled={!!editing} onChange={(v) => setForm({ ...form, groupId: v })} options={[{ value: '', label: 'Choose a group' }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} />
        <Field label="Title" required minLength={3} maxLength={150} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1"><label htmlFor="act-start" className="text-sm font-medium text-slate-700">Starts</label><input id="act-start" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" /></div>
          <div className="flex flex-col gap-1"><label htmlFor="act-end" className="text-sm font-medium text-slate-700">Ends</label><input id="act-end" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" /></div>
        </div>
        <Field label="Location or link" maxLength={200} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        <div className="flex flex-col gap-1">
          <label htmlFor="act-desc" className="text-sm font-medium text-slate-700">Description</label>
          <textarea id="act-desc" rows={3} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <Button type="submit" disabled={busy || !form.groupId && !editing}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}
