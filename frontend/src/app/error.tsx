'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled app error:', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-24 text-center">
      <div className="w-full rounded-2xl border border-stone-200/90 bg-[#FCFBF8] p-8 shadow-lg">
        <span className="text-3xl font-serif text-emerald-800">✦</span>
        <h1 className="mt-2 text-2xl font-bold font-serif text-stone-900">Something went wrong</h1>
        <p className="mt-3 text-sm text-stone-600">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-900 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
