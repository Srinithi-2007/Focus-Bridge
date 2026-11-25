import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <SiteHeader />
      <main className="mx-auto max-w-4xl flex-1 space-y-12 px-6 py-16 sm:py-20">
        <section className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/90 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-900 mb-4">
            ✦ Grounded Learning Platform
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-stone-900 font-serif">
            About FocusBridge
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-stone-700">
            FocusBridge is a coaching platform designed for organizations running thoughtful, transformative learning programs. It brings administration, intentional coaching, and student growth together into one cohesive, distraction-free environment.
          </p>
        </section>

        <div className="grid gap-6 sm:grid-cols-2">
          <section aria-labelledby="reviews" className="rounded-2xl border border-stone-200/90 bg-[#FCFBF8] p-8 shadow-sm">
            <h2 id="reviews" className="text-xl font-bold text-stone-900 font-serif">Individual reviews</h2>
            <p className="mt-3 text-stone-600 leading-relaxed text-sm">
              Each student receives dedicated progress reviews from their assigned coach. Reviews evaluate observations, strengths, challenges, and actionable milestones, ensuring intentional, personalized growth.
            </p>
          </section>

          <section aria-labelledby="groups" className="rounded-2xl border border-stone-200/90 bg-[#FCFBF8] p-8 shadow-sm">
            <h2 id="groups" className="text-xl font-bold text-stone-900 font-serif">Group coaching</h2>
            <p className="mt-3 text-stone-600 leading-relaxed text-sm">
              Cohorts flourish with shared classrooms featuring announcements, curated discussions, activities, and group resources—all safely governed by assigned coaches.
            </p>
          </section>

          <section aria-labelledby="ai" className="rounded-2xl border border-stone-200/90 bg-[#FCFBF8] p-8 shadow-sm sm:col-span-2">
            <h2 id="ai" className="text-xl font-bold text-stone-900 font-serif">AI workflow with human agency</h2>
            <p className="mt-3 text-stone-600 leading-relaxed text-sm">
              Students can ask the AI assistant to decompose complex assignments into structured subtasks and propose balanced calendar schedules. Nothing touches a student&apos;s schedule until the student reviews and explicitly approves it.
            </p>
          </section>
        </div>

        <section className="rounded-2xl border border-emerald-200/80 bg-emerald-900 text-white p-8 sm:p-10 shadow-md flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-bold font-serif">Ready to elevate your program?</h3>
            <p className="mt-2 text-emerald-100/90 text-sm">Register your organization or sign in to your workspace.</p>
          </div>
          <div className="flex gap-4">
            <Link href="/register" className="rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-semibold text-stone-950 shadow hover:bg-amber-300 transition-colors">
              Get started
            </Link>
            <Link href="/login" className="rounded-lg border border-emerald-400/50 bg-emerald-800/80 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 transition-colors">
              Sign in
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
