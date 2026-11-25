import { Suspense } from 'react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import LoginForm from './LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <SiteHeader />
      <main className="mx-auto flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-stone-200/90 bg-[#FCFBF8] p-8 shadow-xl">
          <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <LoginForm />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
