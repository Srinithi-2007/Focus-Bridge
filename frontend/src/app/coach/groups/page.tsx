'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Card, EmptyState, PageHeader, Spinner, formatDate } from '@/components/ui';
import Button from '@/components/Button';
import Field from '@/components/Field';
import { ProgressBar } from '@/components/coach/shared';
import { errorMessage, useWorkspaceData, workspaceRequest } from '@/lib/workspace/client';
import { formatDateTime } from '@/lib/coach/format';

interface GroupSummary { id: string; name: string; description: string; memberCount: number; programName: string | null; upcomingActivities: number }
interface Post { id: string; kind: string; body: string | null; removed: boolean; author: { name: string; role: string }; createdAt: string; replies?: Post[] }
interface GroupDetail {
  group: { id: string; name: string; description: string; programName: string | null; memberCount: number };
  members: { id: string; name: string; email: string; status: string }[];
  announcements: Post[];
  discussions: Post[];
  resources: { id: string; title: string; url: string }[];
  activities: { id: string; title: string; startsAt: string; endsAt: string; status: string; upcoming: boolean }[];
  assignments: { id: string; title: string; status: string; deadline: string | null; assigneeCount: number; submittedCount: number; reviewedCount: number }[];
}

const TABS = ['Announcements', 'Discussion', 'Resources', 'Members', 'Activities', 'Assignments'] as const;
type Tab = (typeof TABS)[number];

export default function CoachGroupsPage() {
  return <Suspense fallback={<Spinner label="Loading classrooms" />}><GroupsInner /></Suspense>;
}

function GroupsInner() {
  const params = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(params.get('group'));
  const [tab, setTab] = useState<Tab>('Announcements');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const groups = useWorkspaceData<{ groups: GroupSummary[] }>('/coach/groups');
  const detail = useWorkspaceData<GroupDetail>(selectedId ? `/coach/groups/${selectedId}` : null);
  const current = selectedId ? groups.data?.groups.find((g) => g.id === selectedId) : undefined;

  function refresh(msg?: string) {
    setError('');
    if (msg) setNotice(msg);
    detail.reload();
    groups.reload();
  }

  async function run(fn: () => Promise<unknown>, msg: string) {
    setError('');
    try {
      await fn();
      refresh(msg);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader title="My groups & classroom" description="Announcements, discussion, shared resources and activities for each group you coach." />
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {groups.loading && !groups.data && <Spinner label="Loading groups" />}
      {groups.data && groups.data.groups.length === 0 && <EmptyState title="No groups assigned" body="An administrator assigns groups to you." />}

      {groups.data && groups.data.groups.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <Card title="Groups" className="h-fit">
            <ul className="space-y-1">
              {groups.data.groups.map((g) => (
                <li key={g.id}>
                  <button type="button" onClick={() => { setSelectedId(g.id); setTab('Announcements'); setNotice(''); }} aria-current={selectedId === g.id ? 'true' : undefined}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm ${selectedId === g.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-100'}`}>
                    <span className="block font-medium">{g.name}</span>
                    <span className="block text-xs text-slate-500">{g.memberCount} members{g.upcomingActivities ? ` · ${g.upcomingActivities} upcoming` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <div className="min-w-0 space-y-4">
            {!selectedId && <EmptyState title="Choose a group" body="Select a group to open its classroom." />}
            {selectedId && detail.loading && !detail.data && <Spinner label="Loading classroom" />}
            {selectedId && detail.error && <Alert>{detail.error}</Alert>}
            {detail.data && current && (
              <>
                <Card>
                  <h2 className="text-xl font-semibold">{detail.data.group.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{detail.data.group.memberCount} members{detail.data.group.programName ? ` · ${detail.data.group.programName}` : ''}</p>
                  {detail.data.group.description && <p className="mt-3 text-sm text-slate-700">{detail.data.group.description}</p>}
                </Card>

                <div role="tablist" aria-label="Classroom sections" className="flex gap-1 overflow-x-auto border-b border-slate-200">
                  {TABS.map((t) => (
                    <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)}
                      className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
                      {t}
                    </button>
                  ))}
                </div>

                {tab === 'Announcements' && <PostsPanel kind="announcement" groupId={detail.data.group.id} posts={detail.data.announcements} onChanged={refresh} onError={setError} />}
                {tab === 'Discussion' && <PostsPanel kind="discussion" groupId={detail.data.group.id} posts={detail.data.discussions} onChanged={refresh} onError={setError} />}
                {tab === 'Resources' && <ResourcesPanel groupId={detail.data.group.id} resources={detail.data.resources} onRun={run} />}
                {tab === 'Members' && (
                  <Card title={`Members (${detail.data.members.length})`}>
                    {detail.data.members.length === 0 ? <EmptyState title="No members yet" /> : (
                      <ul className="divide-y divide-slate-100 text-sm">
                        {detail.data.members.map((m) => <li key={m.id} className="py-2"><p className="font-medium">{m.name}</p><p className="text-slate-500">{m.email}</p></li>)}
                      </ul>
                    )}
                  </Card>
                )}
                {tab === 'Activities' && (
                  <Card title="Group activities" action={<Link href={`/coach/activities?group=${detail.data.group.id}&new=1`} className="text-sm text-brand-600 hover:underline">Schedule activity</Link>}>
                    {detail.data.activities.length === 0 ? <EmptyState title="No activities for this group" /> : (
                      <ul className="divide-y divide-slate-100 text-sm">
                        {detail.data.activities.map((a) => <li key={a.id} className="flex justify-between gap-3 py-2"><span className="font-medium">{a.title}</span><span className="text-slate-500">{formatDateTime(a.startsAt)} · {a.status}</span></li>)}
                      </ul>
                    )}
                  </Card>
                )}
                {tab === 'Assignments' && (
                  <Card title="Group assignments" action={<Link href={`/coach/tasks?group=${detail.data.group.id}`} className="text-sm text-brand-600 hover:underline">Manage tasks</Link>}>
                    {detail.data.assignments.length === 0 ? <EmptyState title="No assignments yet" body="Publish a group task from the Tasks page." /> : (
                      <ul className="divide-y divide-slate-100 text-sm">
                        {detail.data.assignments.map((a) => (
                          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                            <div><p className="font-medium">{a.title}</p><p className="text-xs text-slate-500">Due {formatDate(a.deadline)} · {a.submittedCount} of {a.assigneeCount} submitted{a.reviewedCount ? ` · ${a.reviewedCount} with feedback` : ''}</p></div>
                            <div className="w-40"><ProgressBar value={a.assigneeCount ? Math.round((a.submittedCount / a.assigneeCount) * 100) : null} /></div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function PostsPanel({ kind, groupId, posts, onChanged, onError }: { kind: 'announcement' | 'discussion'; groupId: string; posts: Post[]; onChanged: (msg?: string) => void; onError: (m: string) => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');

  async function post(e: FormEvent, parentId: string | null) {
    e.preventDefault();
    const text = parentId ? replyBody : body;
    if (!text.trim()) return;
    setBusy(true);
    try {
      await workspaceRequest(`/coach/groups/${groupId}/posts`, { method: 'POST', body: { kind: parentId ? 'discussion' : kind, body: text.trim(), parentId } });
      if (parentId) { setReplyBody(''); setReplyTo(null); } else setBody('');
      onChanged(parentId ? 'Reply posted.' : kind === 'announcement' ? 'Announcement posted.' : 'Message posted.');
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(postId: string) {
    if (!window.confirm('Remove this post from the classroom? Replies stay visible as removed.')) return;
    try {
      await workspaceRequest(`/coach/groups/${groupId}/posts/${postId}`, { method: 'DELETE' });
      onChanged('Post removed.');
    } catch (err) {
      onError(errorMessage(err));
    }
  }

  const title = kind === 'announcement' ? 'Announcements' : 'Discussion';
  return (
    <Card title={title}>
      <form onSubmit={(e) => post(e, null)} className="mb-6 space-y-2">
        <label htmlFor={`${kind}-body`} className="text-sm font-medium text-slate-700">{kind === 'announcement' ? 'New announcement' : 'New message'}</label>
        <textarea id={`${kind}-body`} rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <div className="flex justify-end"><Button type="submit" disabled={busy || !body.trim()}>{busy ? 'Posting…' : 'Post'}</Button></div>
      </form>
      {posts.length === 0 ? <EmptyState title={`No ${title.toLowerCase()} yet`} /> : (
        <ul className="space-y-4">
          {posts.map((p) => (
            <li key={p.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{p.author.name} <span className="text-xs text-slate-500">· {p.author.role}</span></p>
                  <p className="text-xs text-slate-500">{formatDateTime(p.createdAt)}</p>
                </div>
                {!p.removed && <button type="button" onClick={() => remove(p.id)} className="text-xs font-medium text-red-600 hover:underline">Remove</button>}
              </div>
              <p className={`mt-2 whitespace-pre-wrap text-sm ${p.removed ? 'italic text-slate-400' : ''}`}>{p.removed ? 'This post was removed by the coach.' : p.body}</p>
              {(p.replies || []).length > 0 && (
                <ul className="mt-3 space-y-2 border-l-2 border-slate-100 pl-4">
                  {(p.replies || []).map((r) => (
                    <li key={r.id} className="text-sm">
                      <span className="font-medium">{r.author.name}</span> <span className="text-xs text-slate-500">{formatDateTime(r.createdAt)}</span>
                      <p className={`whitespace-pre-wrap ${r.removed ? 'italic text-slate-400' : ''}`}>{r.removed ? 'This reply was removed.' : r.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              {!p.removed && (
                replyTo === p.id ? (
                  <form onSubmit={(e) => post(e, p.id)} className="mt-3 space-y-2">
                    <label htmlFor={`reply-${p.id}`} className="sr-only">Reply</label>
                    <textarea id={`reply-${p.id}`} rows={2} maxLength={2000} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setReplyTo(null)} className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
                      <Button type="submit" disabled={busy || !replyBody.trim()}>Reply</Button>
                    </div>
                  </form>
                ) : (
                  <button type="button" onClick={() => { setReplyTo(p.id); setReplyBody(''); }} className="mt-3 text-sm font-medium text-brand-600 hover:underline">Reply</button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ResourcesPanel({ groupId, resources, onRun }: { groupId: string; resources: { id: string; title: string; url: string }[]; onRun: (fn: () => Promise<unknown>, msg: string) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [formError, setFormError] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!/^https?:\/\//i.test(url.trim())) return setFormError('Links must start with http:// or https://');
    await onRun(() => workspaceRequest(`/coach/groups/${groupId}/resources`, { method: 'POST', body: { title: title.trim(), url: url.trim() } }), 'Resource shared.');
    setTitle('');
    setUrl('');
  }

  return (
    <Card title="Shared resources">
      <form onSubmit={add} className="mb-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" noValidate>
        {formError && <div className="sm:col-span-3"><Alert>{formError}</Alert></div>}
        <Field label="Title" required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Field label="Link (https://…)" required type="url" maxLength={2048} value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button type="submit" disabled={!title.trim() || !url.trim()}>Share</Button>
      </form>
      <p className="mb-4 text-xs text-slate-500">Resources are shared as links. File uploads are not available in this release.</p>
      {resources.length === 0 ? <EmptyState title="No resources yet" /> : (
        <ul className="divide-y divide-slate-100 text-sm">
          {resources.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div><p className="font-medium">{r.title}</p><a href={r.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-brand-600 hover:underline">{r.url}</a></div>
              <button type="button" onClick={() => { if (window.confirm('Remove this resource?')) onRun(() => workspaceRequest(`/coach/groups/${groupId}/resources/${r.id}`, { method: 'DELETE' }), 'Resource removed.'); }} className="text-sm font-medium text-red-600 hover:underline">Remove</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
