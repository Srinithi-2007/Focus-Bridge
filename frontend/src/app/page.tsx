import React from 'react';
import Link from 'next/link';
import SequentialBackgroundAnimation from '@/components/SequentialBackgroundAnimation';

const pillars = [
  {
    icon: '🌱',
    title: 'Rooted Foundations',
    subtitle: 'Executive Coaching & Mentorship',
    body: 'Institutional leaders pair students with certified executive coaches who provide structured accountability, frozen task instructions, and longitudinal progress tracking.',
    badge: 'Structure',
  },
  {
    icon: '✨',
    title: 'Emergent Clarity',
    subtitle: 'Intelligent Focus & Planning',
    body: 'Overwhelming assignments naturally unravel into clear, manageable subtasks. Time-blocked focus sessions are synchronized to calendars only upon student approval.',
    badge: 'Momentum',
  },
  {
    icon: '🦋',
    title: 'Flourishing Mastery',
    subtitle: 'Lifelong Self-Direction',
    body: 'Students develop enduring study habits, self-regulation, and confidence through timely coach feedback, locked milestone reviews, and measurable growth analytics.',
    badge: 'Autonomy',
  },
];

const coachingStages = [
  {
    step: '01',
    title: 'Establish Your Sanctuary',
    subtitle: 'Organization Onboarding',
    body: 'Administrators set up their institution with secure multi-tenant isolation, custom coaching tracks, and single-use invitation links for coaches and students.',
  },
  {
    step: '02',
    title: 'Cultivate Partnerships',
    subtitle: 'Caseload Allocation',
    body: 'Academic leaders match students with vetted, approved coaches. Group cohorts and specialized curriculum programs form collaborative communities.',
  },
  {
    step: '03',
    title: 'Nurture Daily Focus',
    subtitle: 'Guided Task Lifecycle',
    body: 'Coaches publish tasks with frozen instructions. Students use the AI-assisted or deterministic planner to schedule focus blocks within their availability.',
  },
  {
    step: '04',
    title: 'Celebrate Transformation',
    subtitle: 'Milestone Progress Reviews',
    body: 'Coaches author strengths-focused reviews that lock upon submission. Students build a lasting record of academic independence and personal growth.',
  },
];

const roleSanctuaries = [
  {
    role: 'Institutional Leaders',
    tagline: 'Visibility with Uncompromising Privacy',
    description: 'Monitor student enrollment, coach caseload balances, and longitudinal engagement with formula-safe CSV exports and strict tenant data isolation.',
    link: '/admin/dashboard',
    ctaText: 'Explore Admin Console',
  },
  {
    role: 'Executive Coaches',
    tagline: 'Purpose-Built Tools for Deeper Mentorship',
    description: 'Manage allocated caseloads, publish immutable task criteria, review submissions, conduct group discussions, and write private longitudinal reviews.',
    link: '/coach/dashboard',
    ctaText: 'Open Coach Workspace',
  },
  {
    role: 'Independent Students',
    tagline: 'Transform Overwhelm into Daily Mastery',
    description: 'Break down complex assignments with the intelligent study planner, block focus sessions on your calendar, and chat 1-on-1 via your coach Direct Line.',
    link: '/student/dashboard',
    ctaText: 'Launch Student Portal',
  },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen text-stone-900 selection:bg-amber-200 selection:text-emerald-950 font-sans">
      {/* 
        Hero Cinematic Sequential Animation Layer
        Plays in the opening viewport so the antique book and emerging butterflies shine.
        The full-page botanical background (Background 1: Sage Green Dogwood Branch)
        is mounted at the root layout and extends behind the entire page.
      */}
      <SequentialBackgroundAnimation
        totalFrames={80}
        fps={16}
        initialHoldMs={600}
        endHoldMs={1200}
        transitionMs={600}
        className="absolute inset-0 h-[100vh] min-h-[700px] pointer-events-none -z-10 overflow-hidden"
      />

      {/* Floating Botanical Navigation Bar */}
      <header className="sticky top-0 z-40 w-full px-4 sm:px-8 pt-4 pb-2">
        <nav
          className="mx-auto flex max-w-6xl items-center justify-between rounded-full bg-[#FAF8F5] border border-stone-300/80 px-6 py-3 shadow-md"
          aria-label="Main Navigation"
        >
          <Link href="/" className="flex items-center gap-2 group">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-800 text-amber-300 text-sm font-bold shadow-sm group-hover:scale-105 transition-transform">
              ✦
            </span>
            <span className="text-xl font-bold tracking-tight text-emerald-950">
              Focus<span className="text-emerald-700">Bridge</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-7 text-sm font-semibold text-stone-700">
            <Link href="/about" className="hover:text-emerald-800 transition-colors">
              Our Philosophy
            </Link>
            <a href="#pillars" className="hover:text-emerald-800 transition-colors">
              Pillars
            </a>
            <a href="#journey" className="hover:text-emerald-800 transition-colors">
              How It Works
            </a>
            <a href="#workspaces" className="hover:text-emerald-800 transition-colors">
              Workspaces
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-full bg-white border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 hover:text-emerald-900 shadow-sm transition-all"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-emerald-800 border border-emerald-900 px-5 py-2 text-sm font-semibold text-amber-100 hover:bg-emerald-700 hover:text-white shadow-md hover:scale-105 transition-all"
            >
              Register
            </Link>
          </div>
        </nav>
      </header>

      <main className="relative z-10">
        {/* 
          Hero Section:
          Content positioned with careful vertical hierarchy so the lower-central open book 
          and soaring butterflies in the background animation are clearly visible.
        */}
        <section className="relative px-6 pt-10 sm:pt-16 pb-20 text-center">
          <div className="mx-auto max-w-4xl">
            {/* Organic Garden Motif Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-700/30 bg-[#FDFBF7] px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-950 shadow-sm">
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span>An Ecosystem for Executive Function & Lifelong Growth</span>
            </div>

            {/* Main Hero Headline */}
            <h1 className="mt-6 text-4xl sm:text-6xl font-extrabold tracking-tight text-emerald-950 leading-[1.15] drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">
              Where Focus Takes Flight &amp; <br />
              <span className="text-emerald-850">Potential Truly Blooms</span>
            </h1>

            {/* Description with High-Contrast Organic Tones */}
            <p className="mx-auto mt-6 max-w-2xl text-lg sm:text-xl font-medium text-stone-900 leading-relaxed drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">
              FocusBridge bridges the gap between ambitious academic goals and daily execution.
              Connecting coaches, students, and academic leaders in a structured environment designed to transform habits into natural mastery.
            </p>

            {/* Primary & Secondary Action CTAs */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="w-full sm:w-auto rounded-full bg-emerald-900 border-2 border-amber-400/40 px-8 py-3.5 text-base font-bold text-amber-50 hover:bg-emerald-800 hover:text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center gap-2"
              >
                <span>Cultivate Your Organization</span>
                <span className="text-amber-300">→</span>
              </Link>
              <Link
                href="/about"
                className="w-full sm:w-auto rounded-full bg-[#FAF8F5] border border-stone-400 px-7 py-3.5 text-base font-bold text-stone-900 hover:bg-white hover:text-emerald-950 shadow-sm hover:scale-105 transition-all"
              >
                Explore The Methodology
              </Link>
            </div>
          </div>

          {/* 
            Visual Breathing Zone:
            Generous unobstructed vertical opening to admire the antique book and 
            butterflies fluttering freely in the center-lower viewport.
          */}
          <div className="mt-28 sm:mt-40 mb-6 flex flex-col items-center justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#FAF8F5]/90 border border-stone-300/80 px-4 py-1.5 text-xs font-semibold text-emerald-950 shadow-sm">
              <span className="text-amber-600">✦</span>
              <span>Watch the story unfold • Scroll down to explore</span>
              <span className="text-amber-600">↓</span>
            </span>
          </div>
        </section>

        {/* 
          Section 1: The Three Pillars of Transformation
          Crafted with solid, crisp, warm linen cards with fine borders.
          Zero blur, zero dark overlay.
        */}
        <section id="pillars" className="relative px-6 py-20 max-w-6xl mx-auto scroll-mt-24">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-800 bg-amber-100/90 border border-amber-300/80 px-3 py-1 rounded-full">
              Core Principles
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-emerald-950 tracking-tight drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]">
              The Three Pillars of Transformation
            </h2>
            <p className="mt-3 text-stone-800 font-medium drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]">
              Our proven coaching methodology empowers students to build sustainable cognitive systems.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {pillars.map((p) => (
              <div
                key={p.title}
                className="rounded-2xl bg-[#FCFBF8] border-2 border-stone-300/90 p-8 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-4xl" role="img" aria-label={p.title}>
                      {p.icon}
                    </span>
                    <span className="rounded-full bg-emerald-100 border border-emerald-300 px-3 py-0.5 text-xs font-bold text-emerald-800">
                      {p.badge}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-emerald-950">{p.title}</h3>
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 mt-1">
                    {p.subtitle}
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-stone-700 font-normal">
                    {p.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 
          Section 2: The Coaching Journey
          Visual chapter progression mimicking the chapters of an open illuminated book.
        */}
        <section id="journey" className="relative px-6 py-20 max-w-6xl mx-auto scroll-mt-24">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-800 bg-amber-100/90 border border-amber-300/80 px-3 py-1 rounded-full">
              The Journey
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-emerald-950 tracking-tight drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]">
              How FocusBridge Unfolds
            </h2>
            <p className="mt-3 text-stone-800 font-medium drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]">
              Four purposeful stages connecting institutional strategy to individual student success.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {coachingStages.map((stage) => (
              <div
                key={stage.step}
                className="rounded-2xl bg-[#FCFBF8] border border-stone-300 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <span className="text-xs font-black tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                    STAGE {stage.step}
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-emerald-950 leading-snug">
                    {stage.title}
                  </h3>
                  <p className="text-xs font-semibold text-emerald-800 mt-1">
                    {stage.subtitle}
                  </p>
                  <p className="mt-3 text-xs leading-relaxed text-stone-600">
                    {stage.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 
          Section 3: Dedicated Workspaces for Every Role
        */}
        <section id="workspaces" className="relative px-6 py-20 max-w-6xl mx-auto scroll-mt-24">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-800 bg-amber-100/90 border border-amber-300/80 px-3 py-1 rounded-full">
              Ecosystem Roles
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-emerald-950 tracking-tight drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]">
              Tailored Sanctuaries for Every Role
            </h2>
            <p className="mt-3 text-stone-800 font-medium drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]">
              Experience focused, clutter-free interfaces aligned precisely with role responsibilities.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {roleSanctuaries.map((r) => (
              <div
                key={r.role}
                className="rounded-2xl bg-[#FCFBF8] border-2 border-stone-300/90 p-8 shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="inline-block rounded-md bg-emerald-900 text-amber-200 text-xs font-bold px-3 py-1 uppercase tracking-wider mb-3">
                    {r.role}
                  </div>
                  <h3 className="text-lg font-bold text-emerald-950 mb-2">
                    {r.tagline}
                  </h3>
                  <p className="text-sm text-stone-700 leading-relaxed mb-6">
                    {r.description}
                  </p>
                </div>
                <Link
                  href={r.link}
                  className="inline-flex items-center justify-between rounded-xl bg-white border border-stone-300 px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 hover:border-emerald-600 shadow-sm transition-all"
                >
                  <span>{r.ctaText}</span>
                  <span className="text-emerald-700">→</span>
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* 
          Section 4: Closing Call to Action
          Warm botanical invitation card.
        */}
        <section className="relative px-6 py-20 max-w-4xl mx-auto text-center">
          <div className="rounded-3xl bg-[#FAF8F5] border-2 border-amber-300/80 p-10 sm:p-14 shadow-xl">
            <span className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-emerald-800 text-amber-300 text-xl font-bold shadow-md">
              ✦
            </span>
            <h2 className="mt-6 text-3xl sm:text-4xl font-extrabold text-emerald-950 tracking-tight">
              Ready to Cultivate Lifelong Independence?
            </h2>
            <p className="mt-4 text-base sm:text-lg text-stone-700 max-w-xl mx-auto">
              Join leading academic institutions and certified executive coaches using FocusBridge to turn potential into lasting achievement.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="w-full sm:w-auto rounded-full bg-emerald-800 border border-emerald-950 px-8 py-3.5 text-base font-bold text-amber-50 hover:bg-emerald-700 hover:text-white shadow-lg hover:scale-105 transition-all"
              >
                Register Your Organization
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto rounded-full bg-white border border-stone-300 px-7 py-3.5 text-base font-bold text-stone-800 hover:bg-stone-50 shadow-sm transition-all"
              >
                Sign In To Workspace
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Redesigned Botanical Footer */}
      <footer className="relative z-10 border-t border-emerald-900 bg-[#16221F] text-stone-300 px-6 py-12">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-amber-300 text-sm font-bold">
              ✦
            </span>
            <div>
              <p className="text-base font-bold text-amber-50">FocusBridge</p>
              <p className="text-xs text-emerald-400">Executive Function Coaching Platform</p>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-6 text-sm font-medium text-stone-300">
            <Link href="/" className="hover:text-amber-300 transition-colors">Home</Link>
            <Link href="/about" className="hover:text-amber-300 transition-colors">About</Link>
            <Link href="/login" className="hover:text-amber-300 transition-colors">Sign In</Link>
            <Link href="/register" className="hover:text-amber-300 transition-colors">Register</Link>
            <Link href="/admin/dashboard" className="hover:text-amber-300 transition-colors">Admin</Link>
            <Link href="/coach/dashboard" className="hover:text-amber-300 transition-colors">Coach</Link>
            <Link href="/student/dashboard" className="hover:text-amber-300 transition-colors">Student</Link>
          </div>

          <p className="text-xs text-stone-400">
            © {new Date().getFullYear()} FocusBridge. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
