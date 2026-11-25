'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { formatDateTime } from '@/lib/coach/format';
import Button from '@/components/Button';
import { errorMessage, useWorkspaceData, workspaceRequest } from '@/lib/workspace/client';

interface Post { id: string; kind: string; body: string | null; removed: boolean; author: string; authorRole: string; createdAt: string; replies?: Post[] }
interface GroupDetail {
  group: { id: string; name: string; description: string; coachName: string };
  announcements: Post[];
  discussions: Post[];
  resources: { id: string; title: string; url: string }[];
  activities: { id: string; title: string; startsAt: string; endsAt: string; location: string; status: string }[];
}

export default function StudentGroupsPage() {
  return <Suspense fallback={<Spinner label="Loading groups" />}><GroupsInner /></Suspense>;
}

function GroupsInner() {
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(params.get('group'));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const groups = useWorkspaceData<{ groups: { id: string; name: string; description: string }[] }>('/me/groups');
  const detail = useWorkspaceData<GroupDetail>(selected ? `/me/groups/${selected}` : null);

  return (
    <>
      <PageHeader title="My groups" description="Your classrooms: announcements from your coach, discussion, shared resources and activities." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
      {groups.loading && !groups.data && <Spinner label="Loading groups" />}
      {groups.data && groups.data.groups.length === 0 && <EmptyState title="You are not in a group yet" body="Your administrator adds you to a group with a coach." />}
      {groups.data && groups.data.groups.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <Card title="Groups" className="h-fit">
            <ul className="space-y-1">
              {groups.data.groups.map((g) => (
                <li key={g.id}><button type="button" onClick={() => setSelected(g.id)} aria-current={selected === g.id ? 'true' : undefined} className={`w-full rounded-md px-3 py-2 text-left text-sm ${selected === g.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-100'}`}>{g.name}</button></li>
              ))}
            </ul>
          </Card>
          <div className="min-w-0 space-y-6">
            {!selected && <EmptyState title="Choose a group" />}
            {selected && detail.loading && !detail.data && <Spinner label="Loading classroom" />}
            {selected && detail.error && <Alert>{detail.error}</Alert>}
            {detail.data && (
              <>
                <Card title={detail.data.group.name}>
                  <p className="text-sm text-slate-500">Coach: {detail.data.group.coachName || 'not yet assigned'}</p>
                  {detail.data.group.description && <p className="mt-2 text-sm">{detail.data.group.description}</p>}
                </Card>
                <Card title="Announcements">
                  {detail.data.announcements.length === 0 ? <EmptyState title="No announcements" /> : (
                    <ul className="space-y-3">{detail.data.announcements.map((p) => <PostItem key={p.id} post={p} />)}</ul>
                  )}
                </Card>
                <Card title="Discussion">
                  <PostComposer groupId={detail.data.group.id} onDone={(m) => { setNotice(m); detail.reload(); }} onError={setError} />
                  {detail.data.discussions.length === 0 ? <EmptyState title="No messages yet" body="Start the conversation." /> : (
                    <ul className="mt-4 space-y-3">{detail.data.discussions.map((p) => <PostItem key={p.id} post={p} groupId={detail.data!.group.id} onDone={() => { setNotice('Reply posted.'); detail.reload(); }} onError={setError} />)}</ul>
                  )}
                </Card>
                <Card title="Shared resources">
                  {detail.data.resources.length === 0 ? <EmptyState title="No resources shared yet" /> : (
                    <ul className="divide-y divide-slate-100 text-sm">{detail.data.resources.map((r) => <li key={r.id} className="py-2"><a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 hover:underline">{r.title}</a></li>)}</ul>
                  )}
                </Card>
                <Card title="Activities">
                  {detail.data.activities.length === 0 ? <EmptyState title="No activities scheduled" /> : (
                    <ul className="divide-y divide-slate-100 text-sm">{detail.data.activities.map((a) => <li key={a.id} className="py-2"><p className="font-medium">{a.title}</p><p className="text-slate-500">{formatDateTime(a.startsAt)}{a.location ? ` · ${a.location}` : ''} · {a.status}</p></li>)}</ul>
                  )}
                </Card>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function PostItem({ post, groupId, onDone, onError }: { post: Post; groupId?: string; onDone?: () => void; onError?: (m: string) => void }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  async function reply(e: FormEvent) {
    e.preventDefault();
    if (!groupId) return;
    setBusy(true);
    try {
      await workspaceRequest(`/me/groups/${groupId}/posts`, { method: 'POST', body: { body: text.trim(), parentId: post.id } });
      setText('');
      setReplying(false);
      onDone?.();
    } catch (err) {
      onError?.(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="rounded-lg border border-slate-200 p-4 text-sm">
      <p className="font-medium">{post.author} <span className="text-xs text-slate-500">· {post.authorRole === 'coach' ? 'Coach' : 'Member'} · {formatDateTime(post.createdAt)}</span></p>
      <p className={`mt-1 whitespace-pre-wrap ${post.removed ? 'italic text-slate-400' : ''}`}>{post.removed ? 'This post was removed.' : post.body}</p>
      {(post.replies || []).length > 0 && (
        <ul className="mt-3 space-y-2 border-l-2 border-slate-100 pl-4">
          {(post.replies || []).map((r) => <li key={r.id}><span className="font-medium">{r.author}</span> <span className="text-xs text-slate-500">{formatDateTime(r.createdAt)}</span><p className={`whitespace-pre-wrap ${r.removed ? 'italic text-slate-400' : ''}`}>{r.removed ? 'This reply was removed.' : r.body}</p></li>)}
        </ul>
      )}
      {groupId && !post.removed && (
        replying ? (
          <form onSubmit={reply} className="mt-3 space-y-2">
            <label htmlFor={`r-${post.id}`} className="sr-only">Reply</label>
            <textarea id={`r-${post.id}`} rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setReplying(false)} className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100">Cancel</button><Button type="submit" disabled={busy || !text.trim()}>Reply</Button></div>
          </form>
        ) : <button type="button" onClick={() => setReplying(true)} className="mt-2 text-sm font-medium text-brand-600 hover:underline">Reply</button>
      )}
    </li>
  );
}

function PostComposer({ groupId, onDone, onError }: { groupId: string; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  async function post(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await workspaceRequest(`/me/groups/${groupId}/posts`, { method: 'POST', body: { body: text.trim() } });
      setText('');
      onDone('Message posted.');
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={post} className="space-y-2">
      <label htmlFor="new-discussion" className="text-sm font-medium text-slate-700">Post to the group</label>
      <textarea id="new-discussion" rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <div className="flex justify-end"><Button type="submit" disabled={busy || !text.trim()}>{busy ? 'Posting…' : 'Post'}</Button></div>
    </form>
  );
}
