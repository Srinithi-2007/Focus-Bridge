'use client';

import React, { Suspense, useMemo } from 'react';
import { usePathname } from 'next/navigation';

export type BotanicalTheme = 'dogwood' | 'dewy-geometry' | 'botanical-sprig' | 'minimal-leaves';

interface BackgroundConfig {
  id: BotanicalTheme;
  title: string;
  src: string;
  positionClasses: string;
  inlinePosition: string;
}

const BACKGROUNDS: Record<BotanicalTheme, BackgroundConfig> = {
  dogwood: {
    id: 'dogwood',
    title: 'Background 1 — Sage Green Dogwood Branch',
    src: '/backgrounds/dogwood-branch.webp',
    positionClasses: 'bg-right-top sm:bg-right',
    inlinePosition: 'right center',
  },
  'dewy-geometry': {
    id: 'dewy-geometry',
    title: 'Background 2 — Dewy Leaves on Sage Green Geometry',
    src: '/backgrounds/dewy-leaves-geometry.webp',
    positionClasses: 'bg-center',
    inlinePosition: 'center center',
  },
  'botanical-sprig': {
    id: 'botanical-sprig',
    title: 'Background 3 — Pastel Green Botanical Sprig Wallpaper',
    src: '/backgrounds/botanical-sprig.webp',
    positionClasses: 'bg-top sm:bg-center-top',
    inlinePosition: 'center top',
  },
  'minimal-leaves': {
    id: 'minimal-leaves',
    title: 'Background 4 — Minimal Green Leaves on Cream Background',
    src: '/backgrounds/minimal-leaves-cream.webp',
    positionClasses: 'bg-right-top',
    inlinePosition: 'right top',
  },
};

export function getBackgroundForRoute(pathname: string): BackgroundConfig {
  if (!pathname || pathname === '/' || pathname === '/about') {
    return BACKGROUNDS['dogwood'];
  }
  if (pathname.startsWith('/login') || pathname.startsWith('/register')) {
    return BACKGROUNDS['dewy-geometry'];
  }
  if (pathname.startsWith('/student')) {
    return BACKGROUNDS['botanical-sprig'];
  }
  if (pathname.startsWith('/admin') || pathname.startsWith('/coach')) {
    return BACKGROUNDS['minimal-leaves'];
  }
  return BACKGROUNDS['minimal-leaves'];
}

function BotanicalPageBackgroundInner() {
  const pathname = usePathname();

  const config = useMemo(() => {
    return getBackgroundForRoute(pathname || '');
  }, [pathname]);

  return (
    <aside
      aria-hidden="true"
      className="fixed inset-0 -z-30 w-full h-full pointer-events-none overflow-hidden select-none"
    >
      <div
        className={`w-full h-full bg-no-repeat bg-cover transition-all duration-500 ease-out ${config.positionClasses}`}
        style={{
          backgroundImage: `url("${config.src}")`,
          backgroundPosition: config.inlinePosition,
          backgroundSize: 'cover',
          // Strictly full 100% opacity, no blur, no filter, no overlay
          opacity: 1,
        }}
      />
    </aside>
  );
}

export default function BotanicalPageBackground() {
  return (
    <Suspense
      fallback={
        <aside
          aria-hidden="true"
          className="fixed inset-0 -z-30 w-full h-full pointer-events-none overflow-hidden select-none"
        >
          <div
            className="w-full h-full bg-no-repeat bg-cover bg-right sm:bg-right"
            style={{
              backgroundImage: 'url("/backgrounds/dogwood-branch.webp")',
              backgroundPosition: 'right center',
              backgroundSize: 'cover',
              opacity: 1,
            }}
          />
        </aside>
      }
    >
      <BotanicalPageBackgroundInner />
    </Suspense>
  );
}
