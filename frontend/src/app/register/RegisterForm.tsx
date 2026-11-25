'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Field from '@/components/Field';
import Button from '@/components/Button';
import { apiRequest, formatApiError, SessionUser } from '@/lib/api';
import { saveSession } from '@/lib/session';

interface InvitationInfo {
  email: string;
  role: 'coach' | 'student';
  organizationName: string;
}

export default function RegisterForm() {
  const invite = useSearchParams().get('invite');
  return invite ? <ActivateInvitation token={invite} /> : <RegisterOrganization />;
}

function RegisterOrganization() {
  const router = useRouter();
  const [form, setForm] = useState({ organizationName: '', firstName: '', lastName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<SessionUser | null>(null);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiRequest<{ token: string; user: SessionUser; csrfToken?: string }>('/auth/register-organization', { body: form });
      saveSession(data.token, data.user, data.csrfToken);
      router.push('/admin/dashboard');
    } catch (err) {
      setError(formatApiError(err, 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <section className="rounded-xl border border-slate-200 p-6">
        <h1 className="text-2xl font-bold">Your organization is ready</h1>
        <p className="mt-2 text-slate-600">Signed in as {done.email}. Next, invite coaches and students from the admin workspace.</p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="text-3xl font-bold">Register your organization</h1>
      <p className="mt-2 text-sm text-slate-600">You will become the administrator of this workspace.</p>
      {error && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Field label="Organization name" required value={form.organizationName} onChange={update('organizationName')} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="First name" required value={form.firstName} onChange={update('firstName')} />
          <Field label="Last name" required value={form.lastName} onChange={update('lastName')} />
        </div>
        <Field label="Work email" type="email" autoComplete="email" required value={form.email} onChange={update('email')} />
        <Field label="Password" type="password" autoComplete="new-password" required value={form.password} onChange={update('password')} />
        <p className="text-xs text-slate-500">At least 10 characters, with uppercase, lowercase and a number.</p>
        <Button type="submit" disabled={loading} className="w-full">{loading ? 'Creating…' : 'Create organization'}</Button>
      </form>
      <p className="mt-6 text-sm text-slate-600">
        Already have an account? <Link href="/login" className="font-medium text-brand-600 hover:underline">Sign in</Link>
      </p>
    </section>
  );
}

function ActivateInvitation({ token }: { token: string }) {
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message?: string; name?: string } | null>(null);

  useEffect(() => {
    apiRequest<InvitationInfo>(`/auth/invitations/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((err) => setLoadError(formatApiError(err, 'This invitation could not be loaded.')));
  }, [token]);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiRequest<{ token?: string; user?: SessionUser; csrfToken?: string; message?: string }>('/auth/invitations/accept', {
        body: { token, ...form },
      });
      if (data.token && data.user) {
        saveSession(data.token, data.user, data.csrfToken);
        setResult({ name: data.user.firstName });
      } else {
        setResult({ message: data.message });
      }
    } catch (err) {
      setError(formatApiError(err, 'Activation failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  if (loadError) {
    return (
      <section>
        <h1 className="text-2xl font-bold">Invitation unavailable</h1>
        <p role="alert" className="mt-3 text-slate-600">{loadError}</p>
        <p className="mt-4 text-sm"><Link href="/login" className="text-brand-600 hover:underline">Go to sign in</Link></p>
      </section>
    );
  }
  if (!info) return <p className="text-slate-500">Checking your invitation…</p>;

  if (result) {
    return (
      <section className="rounded-xl border border-slate-200 p-6">
        <h1 className="text-2xl font-bold">{result.name ? `Welcome, ${result.name}` : 'Account created'}</h1>
        <p className="mt-2 text-slate-600">{result.message || 'Your account is active.'}</p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="text-3xl font-bold">Activate your account</h1>
      <p className="mt-2 text-sm text-slate-600">
        You were invited to {info.organizationName} as a {info.role} using {info.email}.
      </p>
      {error && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <Field label="First name" required value={form.firstName} onChange={update('firstName')} />
          <Field label="Last name" required value={form.lastName} onChange={update('lastName')} />
        </div>
        <Field label="Create password" type="password" autoComplete="new-password" required value={form.password} onChange={update('password')} />
        <Button type="submit" disabled={loading} className="w-full">{loading ? 'Activating…' : 'Activate account'}</Button>
      </form>
    </section>
  );
}
