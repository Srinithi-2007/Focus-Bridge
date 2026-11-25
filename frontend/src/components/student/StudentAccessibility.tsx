'use client';

import { useEffect } from 'react';
import { workspaceRequest } from '@/lib/workspace/client';

export interface Accessibility { fontScale: string; highContrast: boolean; reducedMotion: boolean }

// Applies the student's saved accessibility options to the page. Styled through data attributes in globals.css.
export function applyAccessibility(a: Accessibility) {
  const el = document.documentElement;
  el.dataset.fontScale = a.fontScale;
  el.dataset.highContrast = String(a.highContrast);
  el.dataset.reducedMotion = String(a.reducedMotion);
}

export default function StudentAccessibility() {
  useEffect(() => {
    workspaceRequest<{ accessibility: Accessibility }>('/me/settings')
      .then((d) => applyAccessibility(d.accessibility))
      .catch(() => undefined);
  }, []);
  return null;
}
