'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Alert, Card, EmptyState, Modal, PageHeader, SelectField, Spinner } from '@/components/ui';
import Field from '@/components/Field';
import Button from '@/components/Button';
import { adminRequest, errorMessage, useAdminData } from '@/lib/admin/client';

interface GroupSummary { id: string; name: string; description: string; memberCount: number; coach: { id: string; name: string; status: string } | null; program: { id: string; name: string } | null }
interface GroupDetail extends GroupSummary { members: { id: string; name: string; email: string; status: string }[] }
interface Coach { id: string; firstName: string; lastName: string; status: string }
interface Program { id: string; name: string }
interface StudentOption { id: string; firstName: string; lastName: string; email: string; status: string }

export default function GroupsPage() {
  const groups = useAdminData<{ groups: GroupSummary[] }>('/admin/groups');
  const coaches = useAdminData<{ coaches: Coach[] }>('/admin/coaches?status=active');
  const programs = useAdminData<{ programs: Program[] }>('/admin/programs');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState<null | 'create' | 'edit'>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const detail = useAdminData<{ group: GroupDetail }>(selectedId ? `/admin/groups/${selectedId}` : null);

  useEffect(() => {
    if (!selectedId && groups.data?.groups.length) setSelectedId(groups.data.groups[0].id);
  }, [groups.data, selectedId]);

  function changed(msg: string) {
    setNotice(msg);
    setError('');
    groups.reload();
    detail.reload();
  }

  async function removeMember(studentId: string) {
    if (!selectedId) return;
    setError('');
    try {
      await adminRequest(`/admin/groups/${selectedId}/members/${studentId}`, { method: 'DELETE' });
      changed('Student removed from the group.');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteGroup() {
    if (!selectedId || !window.confirm('Delete this group? Members stay in the organization but leave the group.')) return;
    try {
      await adminRequest(`/admin/groups/${selectedId}`, { method: 'DELETE' });
      setSelectedId(null);
      setNotice('Group deleted.');
      groups.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const group = detail.data?.group;

  return (
    <>
      <PageHeader title="Groups & classrooms" description="Create groups, assign a coach, and manage which students belong to each classroom."
        action={<Button onClick={() => setEditorOpen('create')}>New group</Button>} />
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {groups.loading && !groups.data && <Spinner label="Loading groups" />}
      {groups.data && groups.data.groups.length === 0 && (
        <EmptyState title="No groups yet" body="Create a group, then assign a coach and add students." action={<Button onClick={() => setEditorOpen('create')}>Create first group</Button>} />
      )}

      {groups.data && groups.data.groups.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card title="All groups" className="h-fit">
            <ul className="space-y-1" aria-label="Groups">
              {groups.data.groups.map((g) => (
                <li key={g.id}>
                  <button type="button" onClick={() => setSelectedId(g.id)} aria-current={selectedId === g.id ? 'true' : undefined}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm ${selectedId === g.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-100'}`}>
                    <span className="block font-medium">{g.name}</span>
                    <span className="block text-xs text-slate-500">{g.memberCount} members · {g.coach ? g.coach.name : 'No coach'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <div className="space-y-6">
            {detail.loading && !group && <Spinner label="Loading group" />}
            {detail.error && <Alert>{detail.error}</Alert>}
            {group && (
              <>
                <Card title={group.name} action={
                  <div className="flex gap-3 text-sm">
                    <button type="button" onClick={() => setEditorOpen('edit')} className="font-medium text-brand-600 hover:underline">Edit</button>
                    <button type="button" onClick={deleteGroup} className="font-medium text-red-600 hover:underline">Delete</button>
                  </div>
                }>
                  <dl className="grid gap-4 text-sm sm:grid-cols-3">
                    <div><dt className="text-slate-500">Coach</dt><dd className="font-medium">{group.coach ? group.coach.name : 'Not assigned'}</dd></div>
                    <div><dt className="text-slate-500">Program</dt><dd className="font-medium">{group.program ? group.program.name : 'None'}</dd></div>
                    <div><dt className="text-slate-500">Members</dt><dd className="font-medium">{group.memberCount}</dd></div>
                  </dl>
                  {group.description && <p className="mt-4 text-sm text-slate-600">{group.description}</p>}
                </Card>

                <Card title="Members" action={<Button onClick={() => setAddOpen(true)}>Add students</Button>}>
                  {group.members.length === 0 ? (
                    <EmptyState title="No students in this group yet" body="Add active students to start the classroom." />
                  ) : (
                    <ul className="divide-y divide-slate-100 text-sm">
                      {group.members.map((m) => (
                        <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                          <div>
                            <p className="font-medium">{m.name}</p>
                            <p className="text-slate-500">{m.email}</p>
                          </div>
                          <button type="button" onClick={() => removeMember(m.id)} className="text-sm font-medium text-red-600 hover:underline">Remove</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      <GroupEditor
        mode={editorOpen}
        group={editorOpen === 'edit' ? group || null : null}
        coaches={coaches.data?.coaches || []}
        programs={programs.data?.programs || []}
        onClose={() => setEditorOpen(null)}
        onSaved={(created) => {
          setEditorOpen(null);
          if (created) setSelectedId(created);
          changed(created ? 'Group created.' : 'Group saved.');
        }}
        onError={setError}
      />
      <AddStudentsModal open={addOpen} groupId={selectedId} existing={group?.members.map((m) => m.id) || []} onClose={() => setAddOpen(false)} onAdded={(msg) => { setAddOpen(false); changed(msg); }} />
    </>
  );
}

function GroupEditor({ mode, group, coaches, programs, onClose, onSaved, onError }: {
  mode: null | 'create' | 'edit'; group: GroupDetail | null; coaches: Coach[]; programs: Program[];
  onClose: () => void; onSaved: (createdId?: string) => void; onError: (m: string) => void;
}) {
  const [form, setForm] = useState({ name: '', description: '', coachId: '', programId: '' });
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  useEffect(() => {
    if (mode === 'create') setForm({ name: '', description: '', coachId: '', programId: '' });
    if (mode === 'edit' && group) setForm({ name: group.name, description: group.description, coachId: group.coach?.id || '', programId: group.program?.id || '' });
    setLocalError('');
  }, [mode, group]);

  const coachOptions = [{ value: '', label: 'No coach' }, ...coaches.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))];
  const programOptions = [{ value: '', label: 'No program' }, ...programs.map((p) => ({ value: p.id, label: p.name }))];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLocalError('');
    const body = { name: form.name.trim(), description: form.description.trim(), coachId: form.coachId || null, programId: form.programId || null };
    try {
      if (mode === 'create') {
        const res = await adminRequest<{ group: { id: string } }>('/admin/groups', { method: 'POST', body });
        onSaved(res.group.id);
      } else if (group) {
        await adminRequest(`/admin/groups/${group.id}`, { method: 'PATCH', body });
        onSaved();
      }
    } catch (err) {
      setLocalError(errorMessage(err));
      onError('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={mode !== null} title={mode === 'create' ? 'New group' : 'Edit group'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {localError && <Alert>{localError}</Alert>}
        <Field label="Group name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="flex flex-col gap-1">
          <label htmlFor="group-description" className="text-sm font-medium text-slate-700">Description</label>
          <textarea id="group-description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <SelectField label="Coach" value={form.coachId} onChange={(v) => setForm({ ...form, coachId: v })} options={coachOptions} />
        <SelectField label="Program" value={form.programId} onChange={(v) => setForm({ ...form, programId: v })} options={programOptions} />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save group'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function AddStudentsModal({ open, groupId, existing, onClose, onAdded }: { open: boolean; groupId: string | null; existing: string[]; onClose: () => void; onAdded: (msg: string) => void }) {
  const students = useAdminData<{ students: StudentOption[] }>(open ? '/admin/students?status=active&limit=100' : null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPicked([]); setError(''); } }, [open]);

  const candidates = useMemo(() => (students.data?.students || []).filter((s) => !existing.includes(s.id)), [students.data, existing]);

  async function submit() {
    if (!groupId || picked.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const res = await adminRequest<{ added: number; skipped: number }>(`/admin/groups/${groupId}/members`, { method: 'POST', body: { studentIds: picked } });
      onAdded(`${res.added} student(s) added${res.skipped ? `, ${res.skipped} already in the group` : ''}.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Add students" onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
        <Button onClick={submit} disabled={busy || picked.length === 0}>{busy ? 'Adding…' : `Add ${picked.length || ''} student${picked.length === 1 ? '' : 's'}`}</Button>
      </>}>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {students.loading && !students.data && <Spinner label="Loading students" />}
      {students.data && candidates.length === 0 && <EmptyState title="No other active students available" body="Students must be active to join a group." />}
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {candidates.map((s) => (
          <li key={s.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 hover:bg-slate-50 text-sm">
              <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id))} className="h-4 w-4" />
              <span>{s.firstName} {s.lastName} <span className="text-slate-500">· {s.email}</span></span>
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
