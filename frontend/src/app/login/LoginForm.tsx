'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Field from '@/components/Field';
import Button from '@/components/Button';
import { apiRequest, formatApiError, SessionUser } from '@/lib/api';
import { saveSession } from '@/lib/session';

type Mode = 'signin' | 'forgot' | 'reset';

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const resetToken = params.get('reset');
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [signedIn, setSignedIn] = useState<SessionUser | null>(null);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // The API decides the role from the stored account. No role is selected or sent here.
      const data = await apiRequest<{ token: string; user: SessionUser; csrfToken?: string }>('/auth/login', {
        body: { email, password },
      });
      saveSession(data.token, data.user, data.csrfToken);
      if (data.user.role === 'admin') {
        router.push('/admin/dashboard');
        return;
      }
      if (data.user.role === 'coach') {
        router.push('/coach/dashboard');
        return;
      }
      setSignedIn(data.user);
    } catch (err) {
      setError(formatApiError(err, 'Sign-in failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiRequest<{ message: string }>('/auth/forgot-password', { body: { email } });
      setNotice(data.message);
    } catch (err) {
      setError(formatApiError(err, 'Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiRequest<{ message: string }>('/auth/reset-password', {
        body: { token: resetToken, password: newPassword },
      });
      setNotice(data.message);
      setMode('signin');
      router.replace('/login');
    } catch (err) {
      setError(formatApiError(err, 'Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  if (signedIn) {
    return (
      <section aria-labelledby="signed-in" className="rounded-xl border border-slate-200 p-6">
        <h1 id="signed-in" className="text-2xl font-bold">Welcome, {signedIn.firstName}</h1>
        <p className="mt-2 text-slate-600">
          You are signed in as {signedIn.role}. Your {signedIn.role} workspace is part of a later release.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="text-3xl font-bold">
        {mode === 'signin' && 'Sign in'}
        {mode === 'forgot' && 'Reset your password'}
        {mode === 'reset' && 'Choose a new password'}
      </h1>

      {notice && <p role="status" className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {mode === 'signin' && (
        <form onSubmit={handleSignIn} className="mt-6 space-y-4" noValidate>
          <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" disabled={loading} className="w-full">{loading ? 'Signing in…' : 'Sign in'}</Button>
          <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={() => { setError(''); setNotice(''); setMode('forgot'); }}>
            Forgot password?
          </button>
          <p className="text-sm text-slate-600">
            New organization? <Link href="/register" className="font-medium text-brand-600 hover:underline">Register here</Link>
          </p>
        </form>
      )}

      {mode === 'forgot' && (
        <form onSubmit={handleForgot} className="mt-6 space-y-4" noValidate>
          <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" disabled={loading} className="w-full">{loading ? 'Sending…' : 'Send reset link'}</Button>
          <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={() => { setError(''); setMode('signin'); }}>
            Back to sign in
          </button>
        </form>
      )}

      {mode === 'reset' && (
        <form onSubmit={handleReset} className="mt-6 space-y-4" noValidate>
          <Field label="New password" type="password" autoComplete="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <p className="text-xs text-slate-500">At least 10 characters, with uppercase, lowercase and a number.</p>
          <Button type="submit" disabled={loading || !resetToken} className="w-full">{loading ? 'Saving…' : 'Set new password'}</Button>
          {!resetToken && <p role="alert" className="text-sm text-red-600">This reset link is missing its token. Request a new one.</p>}
        </form>
      )}
    </section>
  );
}
