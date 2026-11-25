import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-24 text-center">
      <div className="w-full rounded-2xl border border-stone-200/90 bg-[#FCFBF8] p-8 shadow-lg">
        <span className="text-3xl font-serif text-emerald-800">✦</span>
        <h1 className="mt-2 text-3xl font-bold font-serif text-stone-900">Page not found</h1>
        <p className="mt-3 text-stone-600">The page you are looking for does not exist.</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-900 transition-colors"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
