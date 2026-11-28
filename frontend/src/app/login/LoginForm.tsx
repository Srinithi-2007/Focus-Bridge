'use client';

import { FormEvent, useState, useEffect } from 'react';
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
  const resetToken = params.get('reset') || params.get('token');
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenValidating, setTokenValidating] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [signedIn, setSignedIn] = useState<SessionUser | null>(null);

  // Validate reset token with backend when opening a reset link
  useEffect(() => {
    if (resetToken && mode === 'reset') {
      let cancelled = false;
      setTokenValidating(true);
      setError('');

      apiRequest<{ valid: boolean }>('/auth/validate-reset-token', {
        body: { token: resetToken },
      })
        .then(() => {
          if (!cancelled) {
            setTokenValid(true);
            setTokenValidating(false);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setTokenValid(false);
            setTokenValidating(false);
            setError(formatApiError(err, 'This password reset link is invalid or has expired. Please request a new one.'));
          }
        });

      return () => {
        cancelled = true;
      };
    }
  }, [resetToken, mode]);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
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
    setNotice('');
    setLoading(true);
    try {
      const data = await apiRequest<{ message: string }>('/auth/forgot-password', { body: { email } });
      setNotice(data.message || 'If an account exists for this email, a password reset link has been sent.');
    } catch (err) {
      setError(formatApiError(err, 'Could not request password reset. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!resetToken) {
      setError('Password reset token is missing. Please use the link sent to your email.');
      return;
    }

    if (newPassword.length < 10) {
      setError('Password must be at least 10 characters long.');
      return;
    }

    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Password must contain at least one uppercase letter, one lowercase letter, and one number.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter both passwords.');
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest<{ message: string }>('/auth/reset-password', {
        body: { token: resetToken, password: newPassword },
      });
      setNotice(data.message || 'Password updated successfully. You can now sign in.');
      setMode('signin');
      setNewPassword('');
      setConfirmPassword('');
      router.replace('/login');
    } catch (err) {
      setError(formatApiError(err, 'Failed to update password. Your reset link may have expired.'));
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
      <h1 className="text-3xl font-bold text-stone-900">
        {mode === 'signin' && 'Sign in'}
        {mode === 'forgot' && 'Reset your password'}
        {mode === 'reset' && 'Create a new password'}
      </h1>

      {notice && (
        <div role="status" className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {mode === 'signin' && (
        <form onSubmit={handleSignIn} className="mt-6 space-y-4" noValidate>
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              className="text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
              onClick={() => {
                setError('');
                setNotice('');
                setMode('forgot');
              }}
            >
              Forgot password?
            </button>
            <p className="text-sm text-stone-600">
              New organization?{' '}
              <Link href="/register" className="font-medium text-emerald-700 hover:text-emerald-800 hover:underline">
                Register here
              </Link>
            </p>
          </div>
        </form>
      )}

      {mode === 'forgot' && (
        <form onSubmit={handleForgot} className="mt-6 space-y-4" noValidate>
          <p className="text-sm text-stone-600">
            Enter your registered email address and we will send you a secure link to reset your password.
          </p>
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Sending link…' : 'Send reset link'}
          </Button>
          <div className="pt-2 text-center">
            <button
              type="button"
              className="text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
              onClick={() => {
                setError('');
                setNotice('');
                setMode('signin');
              }}
            >
              Back to sign in
            </button>
          </div>
        </form>
      )}

      {mode === 'reset' && (
        <div className="mt-6">
          {tokenValidating ? (
            <p className="py-4 text-center text-sm text-stone-500">Verifying your password reset link…</p>
          ) : tokenValid === false ? (
            <div className="space-y-4 pt-2 text-center">
              <Button
                type="button"
                onClick={() => {
                  setError('');
                  setNotice('');
                  setMode('forgot');
                }}
                className="w-full"
              >
                Request a new reset link
              </Button>
              <button
                type="button"
                className="text-sm font-medium text-emerald-700 hover:underline"
                onClick={() => {
                  setError('');
                  setNotice('');
                  setMode('signin');
                }}
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4" noValidate>
              <p className="text-sm text-stone-600">
                Choose a strong new password for your account.
              </p>
              <Field
                label="New password"
                type="password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Field
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <p className="text-xs text-stone-500">
                Must be at least 10 characters long, containing uppercase, lowercase, and numbers.
              </p>
              <Button type="submit" disabled={loading || !resetToken} className="w-full">
                {loading ? 'Saving new password…' : 'Save new password'}
              </Button>
              <div className="pt-2 text-center">
                <button
                  type="button"
                  className="text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                  onClick={() => {
                    setError('');
                    setNotice('');
                    setMode('signin');
                  }}
                >
                  Back to sign in
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
