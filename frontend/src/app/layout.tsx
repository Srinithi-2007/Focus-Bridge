import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import BotanicalPageBackground from '@/components/BotanicalPageBackground';

export const metadata: Metadata = {
  title: 'FocusBridge',
  description: 'Coaching, tasks and progress for organizations, coaches and students.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-stone-900 antialiased bg-transparent selection:bg-amber-200 selection:text-emerald-950">
        <Suspense fallback={null}>
          <BotanicalPageBackground />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
