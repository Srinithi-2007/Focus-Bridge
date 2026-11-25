'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Alert, Card, PageHeader, Spinner } from '@/components/ui';
import Field from '@/components/Field';
import Button from '@/components/Button';
import { adminRequest, errorMessage, useAdminData } from '@/lib/admin/client';

interface Settings {
  organization: { name: string; slug: string; contactEmail: string; description: string; timezone: string; programLabel: string };
  invitations: { expiryDays: number };
  notifications: { inviteEmails: boolean; approvalEmails: boolean };
  roles: { role: string; access: string }[];
  administrators: { id: string; name: string; email: string }[];
}

export default function SettingsPage() {
  const { data, error, loading, setData } = useAdminData<{ settings: Settings }>('/admin/settings');
  const [form, setForm] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    if (data) setForm(data.settings);
  }, [data]);

  if (loading && !data) return <Spinner label="Loading settings" />;
  if (error) return <Alert>{error}</Alert>;
  if (!form) return null;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setSaveError('');
    setSaved('');
    try {
      const res = await adminRequest<{ settings: Settings }>('/admin/settings', {
        method: 'PATCH',
        body: {
          name: form.organization.name,
          contactEmail: form.organization.contactEmail,
          description: form.organization.description,
          timezone: form.organization.timezone,
          programLabel: form.organization.programLabel,
          invitations: { expiryDays: Number(form.invitations.expiryDays) },
          notifications: form.notifications,
        },
      });
      setData({ settings: res.settings });
      setSaved('Settings saved.');
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const set = (fn: (s: Settings) => Settings) => setForm((prev) => (prev ? fn(prev) : prev));

  return (
    <>
      <PageHeader title="Organization settings" description="Profile, invitations, notifications and access." />
      <form onSubmit={save} className="space-y-6" noValidate>
        {saveError && <Alert>{saveError}</Alert>}
        {saved && <Alert tone="success">{saved}</Alert>}

        <Card title="Organization profile">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Organization name" required value={form.organization.name} onChange={(e) => set((s) => ({ ...s, organization: { ...s.organization, name: e.target.value } }))} />
            <Field label="Contact email" type="email" value={form.organization.contactEmail} onChange={(e) => set((s) => ({ ...s, organization: { ...s.organization, contactEmail: e.target.value } }))} />
            <Field label="Timezone" value={form.organization.timezone} onChange={(e) => set((s) => ({ ...s, organization: { ...s.organization, timezone: e.target.value } }))} />
            <Field label="Name for programs (e.g. Program, Track)" value={form.organization.programLabel} onChange={(e) => set((s) => ({ ...s, organization: { ...s.organization, programLabel: e.target.value } }))} />
          </div>
          <div className="mt-4 flex flex-col gap-1">
            <label htmlFor="org-description" className="text-sm font-medium text-slate-700">Description</label>
            <textarea id="org-description" rows={3} value={form.organization.description} onChange={(e) => set((s) => ({ ...s, organization: { ...s.organization, description: e.target.value } }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <p className="mt-3 text-xs text-slate-500">Organization ID slug: {form.organization.slug}</p>
        </Card>

        <Card title="Invitations">
          <div className="max-w-xs">
            <Field label="Invitation link validity (days)" type="number" min={1} max={30} value={String(form.invitations.expiryDays)} onChange={(e) => set((s) => ({ ...s, invitations: { expiryDays: Number(e.target.value) } }))} />
          </div>
          <p className="mt-2 text-xs text-slate-500">Between 1 and 30 days. Applies to invitations sent after saving.</p>
        </Card>

        <Card title="Notifications">
          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={form.notifications.inviteEmails} onChange={(e) => set((s) => ({ ...s, notifications: { ...s.notifications, inviteEmails: e.target.checked } }))} className="h-4 w-4" />
              Email invitation links when invitations are sent
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={form.notifications.approvalEmails} onChange={(e) => set((s) => ({ ...s, notifications: { ...s.notifications, approvalEmails: e.target.checked } }))} className="h-4 w-4" />
              Notify coaches when their account is approved
            </label>
            <p className="text-xs text-slate-500">Email delivery requires a configured email provider. Until one is connected, links are only logged on the server.</p>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Button>
        </div>
      </form>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card title="Roles and permissions">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Role</th><th>Access</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data?.settings.roles.map((r) => (
                <tr key={r.role}><td className="py-2 pr-4 font-medium align-top">{r.role}</td><td className="py-2 text-slate-600">{r.access}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">Roles are fixed in this release. Changing a user&apos;s role is not available.</p>
        </Card>
        <Card title="Administrators">
          <ul className="divide-y divide-slate-100 text-sm">
            {data?.settings.administrators.map((a) => (
              <li key={a.id} className="py-2"><p className="font-medium">{a.name}</p><p className="text-slate-500">{a.email}</p></li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
