'use client';

import { FormEvent, Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Card, EmptyState, Modal, PageHeader, Spinner, StatusBadge, formatDate } from '@/components/ui';
import Field from '@/components/Field';
import Button from '@/components/Button';
import RevokeButton from '@/components/admin/RevokeButton';
import { adminRequest, errorMessage, useAdminData } from '@/lib/admin/client';

interface Coach {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  studentCount: number;
  groupCount: number;
}
interface Invite { id: string; email: string; expiresAt: string }
interface StudentRow { id: string; firstName: string; lastName: string; email: string; status: string }

export default function CoachesPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<Coach | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const q = new URLSearchParams();
  if (debounced) q.set('search', debounced);
  if (status) q.set('status', status);
  const coaches = useAdminData<{ coaches: Coach[] }>(`/admin/coaches?${q.toString()}`);
  const invites = useAdminData<{ invitations: Invite[] }>('/admin/invitations?role=coach&state=open');

  function changed(msg: string) {
    setNotice(msg);
    setError('');
    coaches.reload();
    invites.reload();
  }

  async function act(fn: () => Promise<unknown>, msg: string) {
    setError('');
    try {
      await fn();
      changed(msg);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Coaches"
        description="Invite coaches, approve new accounts, and review each coach's caseload."
        action={<Button onClick={() => setInviteOpen(true)}>Invite coach</Button>}
      />
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <Card>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1 md:col-span-2">
            <label htmlFor="coach-search" className="text-sm font-medium text-slate-700">Search</label>
            <input id="coach-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="coach-status" className="text-sm font-medium text-slate-700">Status</label>
            <select id="coach-status" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="">All statuses</option>
              <option value="pending_approval">Pending approval</option>
              <option value="active">Active</option>
              <option value="deactivated">Deactivated</option>
            </select>
          </div>
        </div>

        {coaches.loading && !coaches.data && <Spinner label="Loading coaches" />}
        {coaches.error && <Alert>{coaches.error}</Alert>}
        {coaches.data && coaches.data.coaches.length === 0 && <EmptyState title="No coaches match these filters" body="Invite a coach to get started." />}
        {coaches.data && coaches.data.coaches.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Coach</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Students</th>
                  <th className="px-3 py-2">Groups</th>
                  <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {coaches.data.coaches.map((c) => (
                  <Fragment key={c.id}>
                    <tr>
                      <td className="px-3 py-3">
                        <p className="font-medium">{c.firstName} {c.lastName}</p>
                        <p className="text-slate-500">{c.email}</p>
                      </td>
                      <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                      <td className="px-3 py-3">
                        <button type="button" onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="text-brand-600 hover:underline" aria-expanded={expanded === c.id}>
                          {c.studentCount} assigned
                        </button>
                      </td>
                      <td className="px-3 py-3">{c.groupCount}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {c.status === 'pending_approval' && (
                          <button type="button" onClick={() => act(() => adminRequest(`/admin/users/${c.id}/approve`, { method: 'PATCH' }), `${c.firstName} ${c.lastName} approved.`)} className="mr-3 font-medium text-green-700 hover:underline">Approve</button>
                        )}
                        <button type="button" onClick={() => setEditing(c)} className="mr-3 font-medium text-brand-600 hover:underline">Edit</button>
                        {c.status !== 'pending_approval' && (
                          <button
                            type="button"
                            onClick={() => act(() => adminRequest(`/admin/users/${c.id}/status`, { method: 'PATCH', body: { status: c.status === 'active' ? 'deactivated' : 'active' } }), `${c.firstName} ${c.lastName} ${c.status === 'active' ? 'deactivated' : 'reactivated'}.`)}
                            className={`font-medium hover:underline ${c.status === 'active' ? 'text-red-600' : 'text-green-700'}`}
                          >
                            {c.status === 'active' ? 'Deactivate' : 'Reactivate'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded === c.id && (
                      <tr className="bg-slate-50">
                        <td colSpan={5} className="px-3 py-3">
                          <CaseloadPanel coachId={c.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-6">
        <Card title="Pending coach invitations">
          {invites.data && invites.data.invitations.length === 0 && <EmptyState title="No open coach invitations" />}
          {invites.data && invites.data.invitations.length > 0 && (
            <ul className="divide-y divide-slate-100 text-sm">
              {invites.data.invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p>{i.email}</p>
                    <p className="text-xs text-slate-500">Expires {formatDate(i.expiresAt)}</p>
                  </div>
                  <RevokeButton id={i.id} onDone={() => changed('Invitation revoked.')} onError={setError} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <InviteCoachModal open={inviteOpen} onClose={() => setInviteOpen(false)} onSent={(email) => { setInviteOpen(false); changed(`Invitation sent to ${email}. The coach must be approved after activating.`); }} />
      <EditCoachModal coach={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); changed('Coach details saved.'); }} />
    </>
  );
}

// Lists the students currently allocated to a coach. Read-only here; reassignment happens on the Allocations page.
function CaseloadPanel({ coachId }: { coachId: string }) {
  const students = useAdminData<{ students: StudentRow[] }>(`/admin/students?coachId=${coachId}&limit=100`);
  if (students.loading && !students.data) return <Spinner label="Loading caseload" />;
  if (students.error) return <Alert>{students.error}</Alert>;
  if (!students.data || students.data.students.length === 0) {
    return <p className="text-sm text-slate-600">No students are assigned to this coach. <Link href="/admin/allocations" className="text-brand-600 hover:underline">Open allocations</Link></p>;
  }
  return (
    <ul className="grid gap-2 text-sm sm:grid-cols-2">
      {students.data.students.map((s) => (
        <li key={s.id} className="rounded border border-slate-200 bg-white px-3 py-2">
          {s.firstName} {s.lastName} <span className="text-slate-500">· {s.email}</span>
        </li>
      ))}
    </ul>
  );
}

function InviteCoachModal({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setEmail(''); setError(''); } }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminRequest('/admin/invitations', { method: 'POST', body: { email: email.trim(), role: 'coach' } });
      onSent(email.trim());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} title="Invite coach" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Coach email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <p className="text-xs text-slate-500">After the coach activates the account, it stays pending until you approve it here.</p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send invitation'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditCoachModal({ coach, onClose, onSaved }: { coach: Coach | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (coach) {
      setForm({ firstName: coach.firstName, lastName: coach.lastName, email: coach.email });
      setError('');
    }
  }, [coach]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!coach) return;
    setBusy(true);
    setError('');
    try {
      await adminRequest(`/admin/users/${coach.id}`, { method: 'PATCH', body: form });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={!!coach} title="Edit coach" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-2 gap-4">
          <Field label="First name" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          <Field label="Last name" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
        <Field label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </form>
    </Modal>
  );
}
