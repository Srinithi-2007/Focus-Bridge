'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Card, EmptyState, Modal, PageHeader, SelectField, Spinner, StatusBadge, formatDate } from '@/components/ui';
import Field from '@/components/Field';
import Button from '@/components/Button';
import { adminRequest, errorMessage, useAdminData } from '@/lib/admin/client';
import RevokeButton from '@/components/admin/RevokeButton';

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  programId: string | null;
  programName: string | null;
  coach: { id: string; name: string; status: string } | null;
  groups: { id: string; name: string }[];
}
interface StudentPage { total: number; page: number; limit: number; students: Student[] }
interface Program { id: string; name: string }
interface Invite { id: string; email: string; state: string; expiresAt: string }

const PAGE_SIZE = 20;

export default function StudentsPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [programId, setProgramId] = useState('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');
  const [notifyError, setNotifyError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [toggling, setToggling] = useState<Student | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo(() => {
    const q = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (debounced) q.set('search', debounced);
    if (status) q.set('status', status);
    if (programId) q.set('programId', programId);
    return q.toString();
  }, [debounced, status, programId, page]);

  const students = useAdminData<StudentPage>(`/admin/students?${query}`);
  const programs = useAdminData<{ programs: Program[] }>('/admin/programs');
  const invites = useAdminData<{ invitations: Invite[] }>('/admin/invitations?role=student&state=open');

  const totalPages = Math.max(1, Math.ceil((students.data?.total || 0) / PAGE_SIZE));
  const programOptions = [{ value: '', label: 'All programs' }, ...(programs.data?.programs || []).map((p) => ({ value: p.id, label: p.name }))];

  function done(message: string) {
    setNotice(message);
    setNotifyError('');
    students.reload();
    invites.reload();
  }

  return (
    <>
      <PageHeader
        title="Students"
        description="Invite students, update their details and manage their program and access."
        action={<Button onClick={() => setInviteOpen(true)}>Invite student</Button>}
      />
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
      {notifyError && <div className="mb-4"><Alert>{notifyError}</Alert></div>}

      <Card>
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <div className="flex flex-col gap-1 md:col-span-2">
            <label htmlFor="student-search" className="text-sm font-medium text-slate-700">Search</label>
            <input id="student-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <SelectField label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: '', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'deactivated', label: 'Deactivated' }]} />
          <SelectField label="Program" value={programId} onChange={(v) => { setProgramId(v); setPage(1); }} options={programOptions} />
        </div>

        {students.loading && !students.data && <Spinner label="Loading students" />}
        {students.error && <Alert>{students.error}</Alert>}
        {students.data && students.data.students.length === 0 && (
          <EmptyState title="No students match these filters" body="Invite a student or adjust the search." />
        )}
        {students.data && students.data.students.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Program</th>
                  <th className="px-3 py-2">Coach</th>
                  <th className="px-3 py-2">Groups</th>
                  <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.data.students.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-3">
                      <p className="font-medium">{s.firstName} {s.lastName}</p>
                      <p className="text-slate-500">{s.email}</p>
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-3 py-3">{s.programName || <span className="text-slate-400">None</span>}</td>
                    <td className="px-3 py-3">
                      {s.coach ? (
                        <span className="flex items-center gap-2">{s.coach.name}{s.coach.status !== 'active' && <Badge tone="amber">Coach inactive</Badge>}</span>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-3 py-3">{s.groups.length ? s.groups.map((g) => g.name).join(', ') : <span className="text-slate-400">None</span>}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => setEditing(s)} className="mr-3 font-medium text-brand-600 hover:underline">Edit</button>
                      <button type="button" onClick={() => setToggling(s)} className={`font-medium hover:underline ${s.status === 'active' ? 'text-red-600' : 'text-green-700'}`}>
                        {s.status === 'active' ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
              <span>Page {page} of {totalPages} · {students.data.total} students</span>
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="mt-6">
        <Card title="Pending invitations">
          {invites.loading && !invites.data && <Spinner label="Loading invitations" />}
          {invites.data && invites.data.invitations.length === 0 && <EmptyState title="No open student invitations" />}
          {invites.data && invites.data.invitations.length > 0 && (
            <ul className="divide-y divide-slate-100 text-sm">
              {invites.data.invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p>{i.email}</p>
                    <p className="text-xs text-slate-500">Expires {formatDate(i.expiresAt)}</p>
                  </div>
                  <RevokeButton id={i.id} onDone={() => done('Invitation revoked.')} onError={setNotifyError} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <InviteStudentModal open={inviteOpen} onClose={() => setInviteOpen(false)} onSent={(email) => { setInviteOpen(false); done(`Invitation sent to ${email}.`); }} />
      <EditStudentModal student={editing} programs={programs.data?.programs || []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); done('Student details saved.'); }} />
      <ToggleStudentModal student={toggling} onClose={() => setToggling(null)} onDone={(msg) => { setToggling(null); done(msg); }} onError={setNotifyError} />
    </>
  );
}

function InviteStudentModal({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setEmail(''); setError(''); } }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminRequest('/admin/invitations', { method: 'POST', body: { email: email.trim(), role: 'student' } });
      onSent(email.trim());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Invite student" onClose={onClose}>
      <form id="invite-student" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Student email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <p className="text-xs text-slate-500">The student receives a link to activate their account. The link expires after the organization&apos;s invitation period.</p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send invitation'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditStudentModal({ student, programs, onClose, onSaved }: { student: Student | null; programs: Program[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', programId: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (student) {
      setForm({ firstName: student.firstName, lastName: student.lastName, email: student.email, programId: student.programId || '' });
      setError('');
    }
  }, [student]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!student) return;
    setBusy(true);
    setError('');
    try {
      await adminRequest(`/admin/students/${student.id}`, { method: 'PATCH', body: { ...form, programId: form.programId || null } });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!student} title="Edit student" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-2 gap-4">
          <Field label="First name" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          <Field label="Last name" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
        <Field label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <SelectField label="Program" value={form.programId} onChange={(v) => setForm({ ...form, programId: v })} options={[{ value: '', label: 'No program' }, ...programs.map((p) => ({ value: p.id, label: p.name }))]} />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ToggleStudentModal({ student, onClose, onDone, onError }: { student: Student | null; onClose: () => void; onDone: (msg: string) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const deactivating = student?.status === 'active';
  async function confirm() {
    if (!student) return;
    setBusy(true);
    try {
      await adminRequest(`/admin/users/${student.id}/status`, { method: 'PATCH', body: { status: deactivating ? 'deactivated' : 'active' } });
      onDone(`${student.firstName} ${student.lastName} ${deactivating ? 'deactivated' : 'reactivated'}.`);
    } catch (err) {
      onError(errorMessage(err));
      onClose();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={!!student}
      title={deactivating ? 'Deactivate student?' : 'Reactivate student?'}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <Button onClick={confirm} disabled={busy} className={deactivating ? 'bg-red-600 hover:bg-red-700' : ''}>{busy ? 'Working…' : deactivating ? 'Deactivate' : 'Reactivate'}</Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        {deactivating
          ? `${student?.firstName} ${student?.lastName} will be unable to sign in. Their records and coach assignment are kept and can be restored.`
          : `${student?.firstName} ${student?.lastName} will be able to sign in again.`}
      </p>
    </Modal>
  );
}
