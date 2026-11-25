import Link from 'next/link';

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#FCFBF8]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4" aria-label="Main">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-emerald-950 hover:text-emerald-800">
          <span className="text-emerald-700 font-serif">✦</span>
          <span>FocusBridge</span>
        </Link>
        <div className="flex items-center gap-6 text-sm font-medium text-stone-700">
          <Link href="/about" className="hover:text-emerald-800 transition-colors">About</Link>
          <Link href="/login" className="hover:text-emerald-800 transition-colors">Sign in</Link>
          <Link
            href="/register"
            className="rounded-lg bg-emerald-800 px-4 py-2 text-white shadow-sm hover:bg-emerald-900 active:bg-emerald-950 transition-colors"
          >
            Register organization
          </Link>
        </div>
      </nav>
    </header>
  );
}
