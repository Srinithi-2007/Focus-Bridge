'use client';

import { Badge } from '@/components/ui';

// Shows where a plan came from. AI output and the built-in planner are labelled, so students always know which one they are reading.
export function SourceBadge({ source }: { source: 'ai' | 'planner' }) {
  return source === 'ai' ? <Badge tone="blue">AI-generated proposal</Badge> : <Badge tone="slate">Built-in planner</Badge>;
}

export function fmt(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
