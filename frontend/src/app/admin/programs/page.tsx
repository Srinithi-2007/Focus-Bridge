'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Alert, Card, EmptyState, Modal, PageHeader, Spinner } from '@/components/ui';
import Field from '@/components/Field';
import Button from '@/components/Button';
import { adminRequest, errorMessage, useAdminData } from '@/lib/admin/client';

interface Program { id: string; name: string; description: string; coachingAreas: string[]; studentCount: number; groupCount: number }

export default function ProgramsPage() {
  const { data, error, loading, reload } = useAdminData<{ programs: Program[] }>('/admin/programs');
  const [editing, setEditing] = useState<Program | null | 'new'>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  async function remove(p: Program) {
    if (!window.confirm(`Delete the program "${p.name}"? This cannot be undone.`)) return;
    setActionError('');
    try {
      await adminRequest(`/admin/programs/${p.id}`, { method: 'DELETE' });
      setNotice(`"${p.name}" deleted.`);
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader title="Programs & coaching tracks" description="Describe each program and the coaching areas it covers."
        action={<Button onClick={() => setEditing('new')}>New program</Button>} />
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
      {actionError && <div className="mb-4"><Alert>{actionError}</Alert></div>}
      {loading && !data && <Spinner label="Loading programs" />}
      {error && <Alert>{error}</Alert>}
      {data && data.programs.length === 0 && <EmptyState title="No programs yet" body="Create a program to group students and groups by coaching track." action={<Button onClick={() => setEditing('new')}>Create program</Button>} />}
      {data && data.programs.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.programs.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{p.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{p.studentCount} students · {p.groupCount} groups</p>
                </div>
                <div className="flex gap-3 text-sm whitespace-nowrap">
                  <button type="button" onClick={() => setEditing(p)} className="font-medium text-brand-600 hover:underline">Edit</button>
                  <button type="button" onClick={() => remove(p)} className="font-medium text-red-600 hover:underline">Delete</button>
                </div>
              </div>
              {p.description && <p className="mt-3 text-sm text-slate-700">{p.description}</p>}
              {p.coachingAreas.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {p.coachingAreas.map((a) => <li key={a} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{a}</li>)}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
      <ProgramModal value={editing} onClose={() => setEditing(null)} onSaved={(msg) => { setEditing(null); setNotice(msg); reload(); }} />
    </>
  );
}

function ProgramModal({ value, onClose, onSaved }: { value: Program | null | 'new'; onClose: () => void; onSaved: (msg: string) => void }) {
  const open = value !== null;
  const existing = value && value !== 'new' ? value : null;
  const [form, setForm] = useState({ name: '', description: '', areas: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (value === 'new') setForm({ name: '', description: '', areas: '' });
    else if (value) setForm({ name: value.name, description: value.description, areas: value.coachingAreas.join(', ') });
    setError('');
  }, [value]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      coachingAreas: form.areas.split(',').map((a) => a.trim()).filter(Boolean),
    };
    try {
      if (existing) {
        await adminRequest(`/admin/programs/${existing.id}`, { method: 'PATCH', body });
        onSaved('Program saved.');
      } else {
        await adminRequest('/admin/programs', { method: 'POST', body });
        onSaved('Program created.');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={existing ? 'Edit program' : 'New program'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Program name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="flex flex-col gap-1">
          <label htmlFor="program-description" className="text-sm font-medium text-slate-700">Description</label>
          <textarea id="program-description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <Field label="Coaching areas (comma separated)" value={form.areas} onChange={(e) => setForm({ ...form, areas: e.target.value })} />
        <p className="text-xs text-slate-500">Use skills or goals such as planning, time management or study routines.</p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save program'}</Button>
        </div>
      </form>
    </Modal>
  );
}
