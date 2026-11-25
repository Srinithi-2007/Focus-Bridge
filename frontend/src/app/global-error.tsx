'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-stone-900 bg-[#FAF8F5] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-stone-200 bg-white p-8 shadow-xl text-center">
          <h1 className="text-2xl font-bold font-serif text-stone-900">Application Error</h1>
          <p className="mt-3 text-sm text-stone-600">{error.message || 'A critical error occurred.'}</p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-6 rounded-lg bg-emerald-800 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-900"
          >
            Refresh
          </button>
        </div>
      </body>
    </html>
  );
}
