import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="border-t border-stone-200/80 bg-[#FCFBF8]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-stone-600 sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} FocusBridge. All rights reserved.</p>
        <div className="flex gap-6">
          <Link href="/about" className="hover:text-emerald-800 transition-colors">About</Link>
          <Link href="/login" className="hover:text-emerald-800 transition-colors">Sign in</Link>
          <Link href="/register" className="hover:text-emerald-800 transition-colors">Register</Link>
        </div>
      </div>
    </footer>
  );
}
