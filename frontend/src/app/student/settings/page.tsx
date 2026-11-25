'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Alert, Card, PageHeader, SelectField, Spinner } from '@/components/ui';
import Button from '@/components/Button';
import Field from '@/components/Field';
import { applyAccessibility } from '@/components/student/StudentAccessibility';
import { errorMessage, useWorkspaceData, workspaceRequest } from '@/lib/workspace/client';

interface Settings {
  profile: { firstName: string; lastName: string; email: string; programName: string | null };
  availability: { day: number; start: string; end: string }[];
  availabilityTimezone: string;
  preferences: { reminderLeadMinutes: number; emailReminders: boolean };
  accessibility: { fontScale: 'default' | 'large' | 'xlarge'; highContrast: boolean; reducedMotion: boolean };
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function StudentSettingsPage() {
  const { data, error, loading, reload } = useWorkspaceData<Settings>('/me/settings');
  const [draft, setDraft] = useState<Settings | null>(null);
  const [notice, setNotice] = useState('');
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setDraft(data); }, [data]);

  if (loading && !draft) return <Spinner label="Loading settings" />;
  if (error) return <Alert>{error}</Alert>;
  if (!draft) return null;

  const windowsValid = draft.availability.every((w) => TIME.test(w.start) && TIME.test(w.end) && w.end > w.start);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || !windowsValid) return;
    setBusy(true);
    setSaveError('');
    setNotice('');
    try {
      await workspaceRequest('/me/settings', { method: 'PATCH', body: { availability: draft.availability, preferences: draft.preferences, accessibility: draft.accessibility } });
      applyAccessibility(draft.accessibility);
      setNotice('Settings saved.');
      reload();
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" description="Your profile, availability for planning, reminders, accessibility and security." />
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
      {saveError && <div className="mb-4"><Alert>{saveError}</Alert></div>}

      <div className="space-y-6">
        <Card title="Profile">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-500">Name</dt><dd className="font-medium">{draft.profile.firstName} {draft.profile.lastName}</dd></div>
            <div><dt className="text-slate-500">Email</dt><dd className="font-medium">{draft.profile.email}</dd></div>
            <div><dt className="text-slate-500">Program</dt><dd className="font-medium">{draft.profile.programName || 'None'}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">Your name and program are managed by your organization.</p>
        </Card>

        <form onSubmit={save} className="space-y-6" noValidate>
          <Card title="Availability for planning" action={<Button type="button" className="bg-slate-700 hover:bg-slate-800" onClick={() => setDraft({ ...draft, availability: [...draft.availability, { day: 1, start: '09:00', end: '10:00' }] })} disabled={draft.availability.length >= 21}>Add window</Button>}>
            <p className="mb-3 text-xs text-slate-500">Times are in {draft.availabilityTimezone}. The planner places work blocks only inside these windows.</p>
            {draft.availability.length === 0 && <p className="mb-3 text-sm text-slate-500">No windows yet. Add at least one so plans can be scheduled.</p>}
            <ul className="space-y-3">
              {draft.availability.map((w, i) => (
                <li key={i} className="grid grid-cols-[1fr_110px_110px_auto] items-end gap-3">
                  <SelectField label="Day" value={String(w.day)} onChange={(v) => setDraft({ ...draft, availability: draft.availability.map((x, j) => (j === i ? { ...x, day: Number(v) } : x)) })} options={DAYS.map((d, n) => ({ value: String(n), label: d }))} />
                  <Field label="From" type="time" value={w.start} onChange={(e) => setDraft({ ...draft, availability: draft.availability.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} />
                  <Field label="To" type="time" value={w.end} onChange={(e) => setDraft({ ...draft, availability: draft.availability.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} />
                  <button type="button" onClick={() => setDraft({ ...draft, availability: draft.availability.filter((_, j) => j !== i) })} className="mb-1 text-sm text-red-600 hover:underline">Remove</button>
                </li>
              ))}
            </ul>
            {!windowsValid && <p role="alert" className="mt-3 text-sm text-red-600">Each window needs a valid start and an end later than the start.</p>}
          </Card>

          <Card title="Reminders">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Remind me before" value={String(draft.preferences.reminderLeadMinutes)} onChange={(v) => setDraft({ ...draft, preferences: { ...draft.preferences, reminderLeadMinutes: Number(v) } })} options={[{ value: '15', label: '15 minutes' }, { value: '30', label: '30 minutes' }, { value: '60', label: '1 hour' }, { value: '180', label: '3 hours' }, { value: '1440', label: '1 day' }]} />
              <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={draft.preferences.emailReminders} onChange={(e) => setDraft({ ...draft, preferences: { ...draft.preferences, emailReminders: e.target.checked } })} className="mt-1 h-4 w-4" /><span>Also send reminders by email<span className="block text-xs text-slate-500">Email delivery is not connected on this server yet. In-app reminders always work.</span></span></label>
            </div>
          </Card>

          <Card title="Accessibility">
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField label="Text size" value={draft.accessibility.fontScale} onChange={(v) => setDraft({ ...draft, accessibility: { ...draft.accessibility, fontScale: v as Settings['accessibility']['fontScale'] } })} options={[{ value: 'default', label: 'Default' }, { value: 'large', label: 'Large' }, { value: 'xlarge', label: 'Extra large' }]} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.accessibility.highContrast} onChange={(e) => setDraft({ ...draft, accessibility: { ...draft.accessibility, highContrast: e.target.checked } })} className="h-4 w-4" />High contrast</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.accessibility.reducedMotion} onChange={(e) => setDraft({ ...draft, accessibility: { ...draft.accessibility, reducedMotion: e.target.checked } })} className="h-4 w-4" />Reduce motion</label>
            </div>
          </Card>

          <div className="flex justify-end"><Button type="submit" disabled={busy || !windowsValid}>{busy ? 'Saving…' : 'Save settings'}</Button></div>
        </form>

        <PasswordCard />
      </div>
    </>
  );
}

function PasswordCard() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await workspaceRequest('/me/security/password', { method: 'POST', body: form });
      setForm({ currentPassword: '', newPassword: '' });
      setMsg({ tone: 'success', text: 'Password updated.' });
    } catch (err) {
      setMsg({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Security">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        {msg && <div className="sm:col-span-2"><Alert tone={msg.tone === 'success' ? 'success' : 'error'}>{msg.text}</Alert></div>}
        <Field label="Current password" type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
        <Field label="New password" type="password" autoComplete="new-password" required value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
        <p className="text-xs text-slate-500 sm:col-span-2">At least 10 characters, with uppercase, lowercase and a number.</p>
        <div className="sm:col-span-2 flex justify-end"><Button type="submit" disabled={busy || !form.currentPassword || !form.newPassword}>{busy ? 'Updating…' : 'Change password'}</Button></div>
      </form>
    </Card>
  );
}
